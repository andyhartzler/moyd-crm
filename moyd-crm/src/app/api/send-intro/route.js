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
    poBox: 'PO Box 270043',
    city: 'Kansas City',
    state: 'MO',
    zip: '64127',
    country: 'US'
  }
}

export async function POST(request) {
  try {
    const { recipients } = await request.json()
    
    console.log('📧 Sending intro to', recipients.length, 'recipient(s)')

    // Load logo once for all recipients
    let logoBase64 = null
    try {
      const logoPath = join(process.cwd(), 'public', 'logo.png')
      const logoBuffer = readFileSync(logoPath)
      logoBase64 = logoBuffer.toString('base64')
      console.log('✅ Logo loaded successfully:', {
        size: logoBuffer.length,
        base64Length: logoBase64.length
      })
    } catch (err) {
      console.error('⚠️ Could not load logo:', err.message)
    }

    // Generate vCard
    const vCardContent = generateVCard(CONTACT_INFO, logoBase64)
    const vCardBlob = new Blob([vCardContent], { type: 'text/vcard' })
    
    console.log('📎 vCard generated:', {
      size: vCardBlob.size,
      hasPhoto: !!logoBase64,
      preview: vCardContent.substring(0, 200) + '...'
    })

    const results = []
    let successCount = 0
    let introSendId = null

    for (const recipient of recipients) {
      try {
        const introMessage = `Hi! Thanks for connecting with MO Young Democrats.\n\nTap the contact card below to save our info.\n\nReply STOP to opt out of future messages.`
        
        const chatGuid = recipient.phone?.includes(';') 
          ? `iMessage;-;${recipient.phone}`
          : `SMS;-;${recipient.phone}`

        console.log(`\n📱 Sending to ${recipient.name} (${recipient.phone})`)

        // Create intro_send record
        const { data: introSend, error: introSendError } = await supabase
          .from('intro_sends')
          .insert({
            member_id: recipient.id,
            status: 'pending'
          })
          .select()
          .single()

        if (introSendError) {
          throw new Error(`Failed to create intro_send record: ${introSendError.message}`)
        }

        introSendId = introSend.id

        // Get or create conversation
        let { data: conversation } = await supabase
          .from('conversations')
          .select('id')
          .eq('phone_number', recipient.phone)
          .single()

        if (!conversation) {
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
              phone_number: recipient.phone,
              member_id: recipient.id,
              last_message_at: new Date().toISOString()
            })
            .select()
            .single()

          if (convError) throw convError
          conversation = newConv
        }

        const conversationId = conversation.id

        // Step 1: Send text message
        console.log('📝 Step 1: Sending text message...')
        
        const textResponse = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              message: introMessage,
              method: 'private-api'
            })
          }
        )

        if (!textResponse.ok) {
          throw new Error(`Text message failed: ${textResponse.statusText}`)
        }

        const textResult = await textResponse.json()
        
        // 🔥 CRITICAL: Extract real GUID from BlueBubbles response
        const realTextGuid = textResult.data?.guid
        
        console.log('📝 Text message response - Real GUID:', realTextGuid)

        if (textResult.status !== 200 && textResult.message !== 'Message sent!') {
          throw new Error(textResult.error?.message || 'Failed to send text message')
        }

        console.log('✅ Text message sent successfully')

        // 🔥 CRITICAL FIX: Save text message with REAL GUID from BlueBubbles
        if (realTextGuid) {
          const { error: textMsgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              body: introMessage,
              direction: 'outbound',
              delivery_status: 'sent', // Will be updated to 'delivered' by webhook
              sender_phone: recipient.phone,
              guid: realTextGuid, // 🔥 USE REAL GUID!
              is_read: true,
              created_at: new Date().toISOString()
            })

          if (textMsgError) {
            console.error('⚠️ Error saving text message:', textMsgError)
          } else {
            console.log('✅ Text message saved with REAL GUID:', realTextGuid)
          }
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

        console.log('📎 Submitting vCard to BlueBubbles...')

        // Set timeout for vCard (30 seconds)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.log('⏱️ BlueBubbles timeout (30s) - attachment is queued and will send in background')
          controller.abort()
        }, 30000)

        try {
          const attachmentResponse = await fetch(
            `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
            {
              method: 'POST',
              body: attachmentFormData,
              signal: controller.signal
            }
          )

          clearTimeout(timeoutId)

          // Try to parse response
          let attachmentResult
          const responseText = await attachmentResponse.text()
          
          try {
            attachmentResult = JSON.parse(responseText)
            
            // 🔥 CRITICAL: Extract real GUID from attachment response
            const realVCardGuid = attachmentResult.data?.guid
            
            console.log('📎 vCard sent! Real GUID:', realVCardGuid)

            // Save vCard message with REAL GUID
            if (realVCardGuid) {
              const { error: vCardError } = await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  body: '\ufffc', // Unicode object replacement character
                  direction: 'outbound',
                  delivery_status: 'sent', // Will be updated by webhook
                  sender_phone: recipient.phone,
                  guid: realVCardGuid, // 🔥 USE REAL GUID!
                  is_read: true,
                  is_contact_card: true,
                  created_at: new Date().toISOString()
                })

              if (vCardError) {
                console.error('⚠️ Error saving vCard message:', vCardError)
              } else {
                console.log('✅ vCard message saved with REAL GUID:', realVCardGuid)
              }
            }

          } catch (e) {
            console.log('⚠️ Attachment response not JSON:', responseText.substring(0, 200))
            
            // If we get a 524 or timeout, the message is likely queued
            if (responseText.includes('524') || !attachmentResponse.ok) {
              console.log('⚠️ Got error but message likely queued - webhook will update status')
              
              // Save with a temp GUID for now, webhook will update it
              const tempVCardGuid = `temp-vcard-${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              
              await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  body: '\ufffc',
                  direction: 'outbound',
                  delivery_status: 'sending', // Webhook will update
                  sender_phone: recipient.phone,
                  guid: tempVCardGuid,
                  is_read: true,
                  is_contact_card: true,
                  created_at: new Date().toISOString()
                })
              
              console.log('✅ vCard message saved with temp GUID, waiting for webhook')
            }
          }

        } catch (fetchError) {
          clearTimeout(timeoutId)
          
          if (fetchError.name === 'AbortError') {
            console.log('⏱️ Timeout aborted - BlueBubbles is processing in background')
            
            // Save with temp GUID, webhook will update when it sends
            const tempVCardGuid = `temp-vcard-${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            
            await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                body: '\ufffc',
                direction: 'outbound',
                delivery_status: 'sending',
                sender_phone: recipient.phone,
                guid: tempVCardGuid,
                is_read: true,
                is_contact_card: true,
                created_at: new Date().toISOString()
              })
            
            console.log('✅ vCard queued, saved with temp GUID')
          } else {
            throw fetchError
          }
        }

        // Update intro_send status
        await supabase
          .from('intro_sends')
          .update({ 
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', introSendId)

        successCount++
        results.push({
          phone: recipient.phone,
          name: recipient.name,
          status: 'success',
          message: 'Intro sent successfully'
        })

      } catch (err) {
        console.error(`❌ Failed to send to ${recipient.name}:`, err)
        
        // Update intro_send to failed
        if (introSendId) {
          await supabase
            .from('intro_sends')
            .update({ 
              status: 'failed',
              error_message: err.message
            })
            .eq('id', introSendId)
        }

        results.push({
          phone: recipient.phone,
          name: recipient.name,
          status: 'failed',
          error: err.message
        })
      }
    }

    return NextResponse.json({
      success: successCount > 0,
      totalSent: successCount,
      totalFailed: recipients.length - successCount,
      results
    })

  } catch (error) {
    console.error('❌ Error in send-intro:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send intro' },
      { status: 500 }
    )
  }
}

function generateVCard(contact, logoBase64) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.name}`,
    `ORG:${contact.name}`,
  ]

  if (contact.phone) {
    lines.push(`TEL;TYPE=WORK,VOICE:${contact.phone}`)
  }

  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${contact.email}`)
  }

  if (contact.website) {
    lines.push(`URL:${contact.website}`)
  }

  // 🔥 CORRECT ADDRESS FORMAT with PO Box
  if (contact.address) {
    const { street, poBox, city, state, zip, country } = contact.address
    // Format: ADR;TYPE=WORK:;;street;city;state;zip;country
    // For PO Box: ADR;TYPE=WORK:;PO Box;city;state;zip;country
    lines.push(`ADR;TYPE=WORK:;;${poBox};${city};${state};${zip};${country}`)
  }

  // 🔥 FIX: Add photo with proper line wrapping (vCard 3.0 spec requires wrapping at 75 chars)
  if (logoBase64) {
    const photoHeader = 'PHOTO;ENCODING=b;TYPE=PNG:'
    const photoLine = photoHeader + logoBase64
    
    // vCard 3.0 requires lines longer than 75 chars to be folded with CRLF + space
    if (photoLine.length > 75) {
      lines.push(photoHeader)
      // Split base64 data into 75-character chunks and prefix continuation lines with a space
      for (let i = 0; i < logoBase64.length; i += 75) {
        const chunk = logoBase64.substring(i, i + 75)
        lines.push(' ' + chunk) // Space prefix indicates continuation
      }
    } else {
      lines.push(photoLine)
    }
    
    console.log('📝 vCard generated with photo:', {
      lines: lines.length,
      photoSize: logoBase64.length,
      photoChunks: Math.ceil(logoBase64.length / 75),
      phone: contact.phone
    })
  }

  lines.push('END:VCARD')

  return lines.join('\r\n')
}