import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Contact information for the vCard
const CONTACT_INFO = {
  name: 'Missouri Young Democrats',
  phone: '+18168983610',
  email: 'info@moyoungdems.org',
  website: 'https://www.moyoungdems.org',
  address: {
    street: '615 E 13th St',
    city: 'Kansas City',
    state: 'MO',
    zip: '64106',
    country: 'USA',
    poBox: '',
    extendedAddress: ''
  }
}

const INTRO_MESSAGE = `Hi! Thanks for connecting with MO Young Democrats. 

Tap the contact card below to save our info.

Reply STOP to opt out of future messages.`

export async function POST(request) {
  try {
    const { recipients } = await request.json()

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients array is required' },
        { status: 400 }
      )
    }

    console.log(`📧 Sending intro to ${recipients.length} recipient(s)`)

    // Get the message template if it exists
    const { data: messageTemplate } = await supabase
      .from('message_templates')
      .select('*')
      .eq('name', 'Introduction')
      .maybeSingle()

    const introMessage = messageTemplate?.content || INTRO_MESSAGE

    // Generate the vCard once for all recipients
    const vCardBlob = generateVCard()
    console.log('📎 vCard generated:', {
      size: vCardBlob.size,
      preview: await vCardBlob.text().then(t => t.substring(0, 50) + '...')
    })

    const results = []
    let successCount = 0
    let failCount = 0

    for (const recipient of recipients) {
      let introSendId = null

      try {
        const chatGuid = recipient.phone.includes(';') 
          ? recipient.phone 
          : `iMessage;-;${recipient.phone}`

        console.log(`📤 Sending intro to ${recipient.name} (${recipient.phone})`)

        // Create intro_send record
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

        // Find or create conversation
        let conversationId
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('member_id', recipient.memberId)
          .maybeSingle()

        if (existingConv) {
          conversationId = existingConv.id
          // Update conversation with latest message
          await supabase
            .from('conversations')
            .update({
              last_message: introMessage,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId)
          console.log('📝 Updated existing conversation:', conversationId)
        } else {
          // Create new conversation
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
              member_id: recipient.memberId,
              chat_identifier: chatGuid,
              last_message: introMessage,
              last_message_at: new Date().toISOString()
            })
            .select('id')
            .single()

          if (convError) {
            console.error('Error creating conversation:', convError)
            throw new Error('Failed to create conversation')
          }

          conversationId = newConv.id
          console.log('✅ Created new conversation:', conversationId)
        }

        // Step 1: Send text message
        console.log('📨 Step 1: Sending text message...')
        const textTempGuid = `intro_text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        const textResponse = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              message: introMessage,
              method: 'private-api',
              tempGuid: textTempGuid
            }),
          }
        )

        const textResult = await textResponse.json()
        console.log('📨 Text response:', textResult)

        if (!textResponse.ok || textResult.status !== 200) {
          throw new Error(textResult.error?.message || textResult.message || 'Failed to send text message')
        }

        console.log('✅ Text message sent successfully')

        // 🔥 NEW: Save text message to database immediately
        const textMessageGuid = textResult.data?.guid || textTempGuid
        const { error: textMsgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            body: introMessage,
            direction: 'outbound',
            delivery_status: 'sent',
            sender_phone: recipient.phone,
            guid: textMessageGuid,
            is_read: true,
            has_attachments: false,
            created_at: new Date().toISOString()
          })

        if (textMsgError) {
          console.error('⚠️ Error saving text message to database:', textMsgError)
        } else {
          console.log('✅ Text message saved to database!')
        }

        // Small delay between text and attachment
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Step 2: Send vCard attachment using FormData
        console.log('📎 Step 2: Sending vCard attachment...')
        
        const attachmentFormData = new FormData()
        attachmentFormData.append('chatGuid', chatGuid)
        attachmentFormData.append('name', 'Missouri Young Democrats.vcf')
        attachmentFormData.append('attachment', vCardBlob, 'Missouri Young Democrats.vcf')
        attachmentFormData.append('method', 'private-api')
        const vCardTempGuid = `intro_vcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        attachmentFormData.append('tempGuid', vCardTempGuid)

        console.log('📎 Submitting vCard via FormData to BlueBubbles')

        const attachmentResponse = await fetch(
          `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            body: attachmentFormData,
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

        // 🔥 NEW: Save vCard attachment message to database immediately
        const vCardMessageGuid = attachmentResult.data?.guid || vCardTempGuid
        const { error: vCardMsgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            body: '', // Attachments typically have empty body
            direction: 'outbound',
            delivery_status: 'sent',
            sender_phone: recipient.phone,
            guid: vCardMessageGuid,
            is_read: true,
            has_attachments: true,
            created_at: new Date().toISOString()
          })

        if (vCardMsgError) {
          console.error('⚠️ Error saving vCard message to database:', vCardMsgError)
        } else {
          console.log('✅ vCard message saved to database!')
        }
        
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
      `ORG:${CONTACT_INFO.name}`,
      `TEL;TYPE=CELL:${CONTACT_INFO.phone}`,
      `EMAIL;TYPE=INTERNET:${CONTACT_INFO.email}`,
      `URL:${CONTACT_INFO.website}`,
      // ADR format: poBox;extendedAddress;street;city;region;postalCode;country
      `ADR;TYPE=WORK:${CONTACT_INFO.address.poBox};${CONTACT_INFO.address.extendedAddress};${CONTACT_INFO.address.street};${CONTACT_INFO.address.city};${CONTACT_INFO.address.state};${CONTACT_INFO.address.zip};${CONTACT_INFO.address.country}`
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