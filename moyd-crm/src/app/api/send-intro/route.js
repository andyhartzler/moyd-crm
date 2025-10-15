import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Contact information for MO Young Democrats
const CONTACT_INFO = {
  firstName: 'Missouri',
  lastName: 'Young Democrats',
  name: 'Missouri Young Democrats',
  organization: 'Missouri Young Democrats',
  phone: '+18165300773',
  email: 'info@moyoungdemocrats.org',
  website: 'https://moyoungdemocrats.org',
  address: {
    poBox: '',
    street: '',
    city: 'Kansas City',
    state: 'Missouri',
    zip: '64101',
    country: 'United States'
  }
}

export async function POST(request) {
  try {
    const { recipients, templateId } = await request.json()

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients array is required' },
        { status: 400 }
      )
    }

    console.log(`📧 Sending intro to ${recipients.length} recipient(s)`)

    // Get the message template (either specified or default)
    let messageTemplate
    if (templateId) {
      const { data: template } = await supabase
        .from('intro_message_templates')
        .select('*')
        .eq('id', templateId)
        .eq('active', true)
        .single()
      
      messageTemplate = template
    }
    
    // Fall back to default template if none specified or not found
    if (!messageTemplate) {
      const { data: defaultTemplate } = await supabase
        .from('intro_message_templates')
        .select('*')
        .eq('is_default', true)
        .eq('active', true)
        .single()
      
      messageTemplate = defaultTemplate
    }

    const introMessage = messageTemplate?.message_text || `Hi! Thanks for connecting with MO Young Democrats. 

Tap the contact card below to save our info.

Reply STOP to opt out of future messages.`

    const results = []
    let successCount = 0
    let failCount = 0

    // Generate vCard once (will be reused for all recipients)
    const vCardBlob = generateVCard()
    
    console.log('📎 vCard generated successfully')

    for (const recipient of recipients) {
      let introSendId = null
      
      try {
        // Check if member has opted out
        const { data: member } = await supabase
          .from('members')
          .select('opt_out')
          .eq('id', recipient.memberId)
          .single()
        
        if (member?.opt_out) {
          console.log(`⚠️ Skipping ${recipient.name} - opted out`)
          results.push({
            recipient: recipient.name,
            phone: recipient.phone,
            success: false,
            error: 'User has opted out'
          })
          failCount++
          continue
        }

        // Check if intro was already sent to this member
        const { data: existingSend } = await supabase
          .from('intro_sends')
          .select('id, sent_at')
          .eq('member_id', recipient.memberId)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        if (existingSend) {
          const daysSinceLastSend = Math.floor((Date.now() - new Date(existingSend.sent_at).getTime()) / (1000 * 60 * 60 * 24))
          console.log(`ℹ️ Intro was already sent to ${recipient.name} ${daysSinceLastSend} days ago`)
        }

        const chatGuid = recipient.phone.includes(';') 
          ? recipient.phone 
          : `iMessage;-;${recipient.phone}`

        console.log(`📤 Sending intro to ${recipient.name} (${recipient.phone})`)

        // Create intro_send record (✅ FIXED: Only columns that exist)
        const { data: introSend, error: introSendError } = await supabase
          .from('intro_sends')
          .insert({
            member_id: recipient.memberId,
            template_id: messageTemplate?.id || null,
            status: 'sending'
          })
          .select()
          .single()
        
        if (introSendError) {
          console.error('Error creating intro_send record:', introSendError)
          throw new Error('Failed to create send record')
        }

        introSendId = introSend.id
        console.log(`✅ Created intro_send record: ${introSendId}`)

        // Step 1: Send text message
        console.log('📨 Step 1: Sending text message...')
        const textResponse = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              message: introMessage,
              method: 'private-api',
              tempGuid: `intro_text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }),
          }
        )

        const textResult = await textResponse.json()
        console.log('📨 Text response:', textResult)

        if (!textResponse.ok || textResult.status !== 200) {
          throw new Error(textResult.error?.message || textResult.message || 'Failed to send text message')
        }

        console.log('✅ Text message sent successfully')

        // Small delay between text and attachment
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Step 2: Send vCard attachment using FormData (✅ FIXED: Like send-attachment route)
        console.log('📎 Step 2: Sending vCard attachment...')
        
        // Create FormData for the attachment (matches send-attachment pattern)
        const attachmentFormData = new FormData()
        attachmentFormData.append('chatGuid', chatGuid)
        attachmentFormData.append('name', 'Missouri Young Democrats.vcf')
        attachmentFormData.append('attachment', vCardBlob, 'Missouri Young Democrats.vcf')
        attachmentFormData.append('method', 'private-api')
        attachmentFormData.append('tempGuid', `intro_vcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)

        console.log('📎 Submitting vCard via FormData to BlueBubbles')

        const attachmentResponse = await fetch(
          `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            body: attachmentFormData,  // ✅ FormData, not JSON!
          }
        )

        // Try to parse response
        let attachmentResult
        try {
          attachmentResult = await attachmentResponse.json()
        } catch (e) {
          // If response isn't JSON, treat as success (BlueBubbles might not respond properly)
          console.log('⚠️ Attachment response not JSON, assuming success')
          attachmentResult = { status: 200 }
        }

        console.log('📎 Attachment response:', {
          ok: attachmentResponse.ok,
          status: attachmentResponse.status,
          result: attachmentResult
        })

        if (!attachmentResponse.ok || (attachmentResult.status && attachmentResult.status !== 200)) {
          console.error('❌ Attachment send failed:', attachmentResult)
          throw new Error(attachmentResult.error?.message || attachmentResult.message || 'Failed to send contact card')
        }

        console.log(`✅ Intro sent successfully to ${recipient.name}`)
        
        // Update intro_send record to success
        if (introSendId) {
          const { error: updateError } = await supabase
            .from('intro_sends')
            .update({ 
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('id', introSendId)
          
          if (updateError) {
            console.error('⚠️ Failed to update intro_send:', updateError)
          }
        }

        // Track the delivery in contact_card_interactions
        if (introSendId) {
          const { error: interactionError } = await supabase
            .from('contact_card_interactions')
            .insert({
              member_id: recipient.memberId,
              intro_send_id: introSendId,
              interaction_type: 'delivered'
            })
          
          if (interactionError) {
            console.error('⚠️ Failed to track interaction:', interactionError)
          }
        }
        
        results.push({
          recipient: recipient.name,
          phone: recipient.phone,
          success: true
        })
        successCount++

        // Delay between recipients to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`❌ Failed to send intro to ${recipient.name}:`, error)
        
        // Update intro_send record to failed
        if (introSendId) {
          const { error: updateError } = await supabase
            .from('intro_sends')
            .update({ 
              status: 'failed',
              error_message: error.message
            })
            .eq('id', introSendId)
          
          if (updateError) {
            console.error('⚠️ Failed to update failure status:', updateError)
          }
        }
        
        results.push({
          recipient: recipient.name,
          phone: recipient.phone,
          success: false,
          error: error.message
        })
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Intro sent to ${successCount} recipient(s)${failCount > 0 ? ` (${failCount} failed/skipped)` : ''}`,
      results
    })

  } catch (error) {
    console.error('💥 Error in send-intro API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send intro' },
      { status: 500 }
    )
  }
}

function generateVCard() {
  try {
    // Read and encode logo
    const logoPath = join(process.cwd(), 'public', 'moyd-logo.png')
    let logoBase64 = ''
    
    try {
      const logoBuffer = readFileSync(logoPath)
      logoBase64 = logoBuffer.toString('base64')
      console.log('✅ Logo loaded successfully:', {
        size: logoBuffer.length,
        base64Length: logoBase64.length
      })
    } catch (logoError) {
      console.warn('⚠️ Could not load logo, continuing without it:', logoError.message)
    }

    // Build vCard content
    const vCardLines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${CONTACT_INFO.name}`,
      `N:${CONTACT_INFO.lastName};${CONTACT_INFO.firstName};;;`,
      `ORG:${CONTACT_INFO.organization}`,
      `TEL;TYPE=CELL:${CONTACT_INFO.phone}`,
      `EMAIL;TYPE=INTERNET:${CONTACT_INFO.email}`,
      `URL:${CONTACT_INFO.website}`,
      `ADR;TYPE=WORK:${CONTACT_INFO.address.poBox};${CONTACT_INFO.address.street};${CONTACT_INFO.address.city};${CONTACT_INFO.address.state};${CONTACT_INFO.address.zip};${CONTACT_INFO.address.country}`
    ]

    // Add photo if logo was loaded successfully
    if (logoBase64) {
      vCardLines.push('PHOTO;ENCODING=BASE64;TYPE=PNG:' + logoBase64)
    }

    vCardLines.push('END:VCARD')

    const vCardContent = vCardLines.join('\r\n')

    console.log('📝 vCard generated:', {
      lines: vCardLines.length,
      hasPhoto: !!logoBase64,
      contentLength: vCardContent.length
    })

    // Create Blob (for FormData)
    return new Blob([vCardContent], { type: 'text/vcard' })
  } catch (error) {
    console.error('Error generating vCard:', error)
    throw error
  }
}