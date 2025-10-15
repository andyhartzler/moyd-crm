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

const CONTACT_INFO = {
  name: 'Missouri Young Democrats',
  phone: '+18165300773',
  email: 'info@moyoungdemocrats.org',
  website: 'https://moyoungdemocrats.org',
  address: {
    street: '',
    city: 'Kansas City',
    state: 'Missouri',
    zip: '64127',
    country: 'United States',
    poBox: 'PO Box 270043',
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

    const { data: messageTemplate } = await supabase
      .from('message_templates')
      .select('*')
      .eq('name', 'Introduction')
      .maybeSingle()

    const introMessage = messageTemplate?.content || INTRO_MESSAGE
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

        // Get or create conversation
        let conversationId
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('member_id', recipient.memberId)
          .maybeSingle()

        if (existingConv) {
          conversationId = existingConv.id
          await supabase
            .from('conversations')
            .update({ 
              updated_at: new Date().toISOString(),
              last_message: introMessage,
              last_message_at: new Date().toISOString()
            })
            .eq('id', conversationId)
        } else {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({
              member_id: recipient.memberId,
              last_message: introMessage,
              last_message_at: new Date().toISOString()
            })
            .select()
            .single()
          
          conversationId = newConv.id
        }

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

        // 🔥 CRITICAL FIX: Use consistent GUID pattern that webhook can match
        const textTempGuid = `temp-intro-text-${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        console.log('📨 Step 1: Sending text message with tempGuid:', textTempGuid)
        
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

        if (!textResponse.ok) {
          throw new Error(`Failed to send text: ${textResponse.status}`)
        }

        const textResult = await textResponse.json()
        console.log('📨 Text response:', {
          status: textResponse.status,
          guid: textResult.data?.guid,
          tempGuid: textResult.data?.tempGuid
        })

        if (textResult.status !== 200 && textResult.message !== 'Message sent!') {
          throw new Error(textResult.error?.message || 'Failed to send text message')
        }

        console.log('✅ Text message sent successfully')

        // Save text message to database with temp GUID
        const { error: textMsgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            body: introMessage,
            direction: 'outbound',
            delivery_status: 'sent',
            sender_phone: recipient.phone,
            guid: textTempGuid, // 🔥 Use temp GUID so webhook can find and update it
            is_read: true,
            is_from_me: true,
            created_at: new Date().toISOString()
          })

        if (textMsgError) {
          console.error('⚠️ Error saving text message:', textMsgError)
        } else {
          console.log('✅ Text message saved with tempGuid:', textTempGuid)
        }

        // Small delay between text and attachment
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Step 2: Send vCard attachment
        console.log('📎 Step 2: Sending vCard attachment...')
        
        const fileBuffer = await vCardBlob.arrayBuffer()
        const vCardFile = new File([fileBuffer], 'Missouri Young Democrats.vcf', { 
          type: 'text/vcard',
          lastModified: Date.now()
        })
        
        const attachmentFormData = new FormData()
        attachmentFormData.append('chatGuid', chatGuid)
        attachmentFormData.append('name', 'Missouri Young Democrats.vcf')
        attachmentFormData.append('attachment', vCardFile)
        attachmentFormData.append('method', 'private-api')
        
        // 🔥 CRITICAL FIX: Use consistent GUID pattern
        const vCardTempGuid = `temp-intro-vcard-${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        attachmentFormData.append('tempGuid', vCardTempGuid)

        console.log('📎 Submitting vCard with tempGuid:', vCardTempGuid)

        const attachmentResponse = await fetch(
          `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            body: attachmentFormData,
          }
        )

        // Try to parse response
        let attachmentResult
        const responseText = await attachmentResponse.text()
        
        try {
          attachmentResult = JSON.parse(responseText)
        } catch (e) {
          console.log('⚠️ Attachment response not JSON:', responseText.substring(0, 200))
          
          // 🔥 If we get a 524 but the message was still queued, that's OK
          // BlueBubbles will send it and webhook will update the status
          if (responseText.includes('524')) {
            console.log('⚠️ Got 524 but message likely queued - webhook will update status')
            
            // Save vCard message with temp GUID so webhook can update it
            await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                body: '',
                direction: 'outbound',
                delivery_status: 'sending', // Webhook will update this
                sender_phone: recipient.phone,
                guid: vCardTempGuid,
                is_read: true,
                is_from_me: true,
                created_at: new Date().toISOString(),
                attachments: [{
                  transfer_name: 'Missouri Young Democrats.vcf',
                  mime_type: 'text/vcard'
                }]
              })
            
            // Don't throw error - let webhook handle the update
            console.log('✅ vCard message saved, waiting for webhook to confirm delivery')
            
            await supabase
              .from('intro_sends')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', introSendId)

            successCount++
            results.push({
              phone: recipient.phone,
              name: recipient.name,
              status: 'success',
              message: 'Intro sent (webhook will confirm)'
            })
            continue
          }
          
          throw new Error(`BlueBubbles response error: ${attachmentResponse.status}`)
        }

        console.log('📎 Attachment response:', {
          ok: attachmentResponse.ok,
          status: attachmentResponse.status
        })

        // Check if attachment send was successful
        if (!attachmentResponse.ok && !(attachmentResult.status && attachmentResult.status === 200)) {
          console.error('❌ Attachment send failed:', attachmentResult)
          throw new Error(attachmentResult.error?.message || attachmentResult.message || 'Failed to send contact card')
        }

        console.log(`✅ Intro sent successfully to ${recipient.name}`)

        // Save vCard message with temp GUID
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            body: '',
            direction: 'outbound',
            delivery_status: 'sent',
            sender_phone: recipient.phone,
            guid: vCardTempGuid, // 🔥 Use temp GUID so webhook can update it
            is_read: true,
            is_from_me: true,
            created_at: new Date().toISOString(),
            attachments: [{
              transfer_name: 'Missouri Young Democrats.vcf',
              mime_type: 'text/vcard'
            }]
          })

        // Update intro_send status to completed
        await supabase
          .from('intro_sends')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', introSendId)

        successCount++
        results.push({
          phone: recipient.phone,
          name: recipient.name,
          status: 'success',
          message: 'Intro sent successfully'
        })

      } catch (error) {
        console.error(`❌ Failed to send intro to ${recipient.name}:`, error)
        failCount++
        
        if (introSendId) {
          await supabase
            .from('intro_sends')
            .update({ 
              status: 'failed',
              error_message: error.message 
            })
            .eq('id', introSendId)
        }

        results.push({
          phone: recipient.phone,
          name: recipient.name,
          status: 'failed',
          error: error.message
        })
      }
    }

    return NextResponse.json({
      success: successCount > 0,
      message: `Sent ${successCount} intro(s) successfully${failCount > 0 ? ` (${failCount} failed/skipped)` : ''}`,
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
      console.warn('⚠️ Could not load logo:', logoError.message)
    }

    const vCardLines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${CONTACT_INFO.name}`,
      `ORG:${CONTACT_INFO.name}`,
      `TEL;TYPE=CELL:${CONTACT_INFO.phone}`,
      `EMAIL;TYPE=INTERNET:${CONTACT_INFO.email}`,
      `URL:${CONTACT_INFO.website}`,
      `ADR;TYPE=WORK:${CONTACT_INFO.address.poBox};${CONTACT_INFO.address.extendedAddress};${CONTACT_INFO.address.street};${CONTACT_INFO.address.city};${CONTACT_INFO.address.state};${CONTACT_INFO.address.zip};${CONTACT_INFO.address.country}`
    ]

    if (logoBase64) {
      vCardLines.push('PHOTO;ENCODING=BASE64;TYPE=PNG:' + logoBase64)
    }

    vCardLines.push('END:VCARD')

    const vCardContent = vCardLines.join('\r\n')

    console.log('📝 vCard generated with CORRECT address:', {
      lines: vCardLines.length,
      hasPhoto: !!logoBase64,
      contentLength: vCardContent.length,
      phone: CONTACT_INFO.phone,
      poBox: CONTACT_INFO.address.poBox,
      zip: CONTACT_INFO.address.zip
    })

    return new Blob([vCardContent], { type: 'text/vcard' })
  } catch (error) {
    console.error('Error generating vCard:', error)
    throw error
  }
}