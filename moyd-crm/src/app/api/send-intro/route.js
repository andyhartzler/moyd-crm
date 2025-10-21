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

    // 🔥 FIX: Use correct filename - moyd-logo.png
    let logoBase64 = null
    try {
      const logoPath = join(process.cwd(), 'public', 'moyd-logo.png')
      console.log('📂 Loading logo from:', logoPath)
      
      const logoBuffer = readFileSync(logoPath)
      logoBase64 = logoBuffer.toString('base64')
      
      console.log('✅ Logo loaded successfully:', {
        size: logoBuffer.length,
        base64Length: logoBase64.length,
        firstChars: logoBase64.substring(0, 50) + '...',
        path: logoPath
      })
    } catch (err) {
      console.error('❌ FAILED to load logo:', err.message)
      console.error('❌ Logo error details:', {
        error: err,
        cwd: process.cwd(),
        attemptedPath: join(process.cwd(), 'public', 'moyd-logo.png')
      })
      // Continue without logo - will still send contact card
    }

    // Generate vCard with proper line folding
    const vCardContent = generateVCard(CONTACT_INFO, logoBase64)
    const vCardBlob = new Blob([vCardContent], { type: 'text/vcard' })
    
    console.log('📎 vCard generated:', {
      size: vCardBlob.size,
      hasPhoto: !!logoBase64,
      contentLength: vCardContent.length,
      firstLines: vCardContent.split('\r\n').slice(0, 10).join('\r\n')
    })

    const results = []
    let successCount = 0
    let introSendId = null

    for (const recipient of recipients) {
      try {
        const introMessage = `Hi! Thanks for connecting with MO Young Democrats.\n\nTap the contact card below to save our info.\n\nReply STOP to opt out of future messages.`
        
        const chatGuid = recipient.phone?.includes(';') 
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
          console.log('📝 Updating existing conversation:', conversationId)
          await supabase
            .from('conversations')
            .update({ 
              updated_at: new Date().toISOString(),
              last_message: introMessage,
              last_message_at: new Date().toISOString()
            })
            .eq('id', conversationId)
        } else {
          console.log('📝 Creating new conversation')
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
          console.log('✅ Created conversation:', conversationId)
        }

        // Create intro_send record
        const { data: introSend, error: introSendError } = await supabase
          .from('intro_sends')
          .insert({
            member_id: recipient.memberId,
            template_id: null,
            status: 'sending'
          })
          .select()
          .single()
        
        if (introSendError) {
          console.error('❌ Error creating intro_send record:', introSendError)
          throw new Error('Failed to create send record')
        }

        introSendId = introSend.id
        console.log(`✅ Created intro_send record: ${introSendId}`)

        // Step 1: Send text message
        console.log('📨 Step 1: Sending text message to BlueBubbles...')
        
        const textResponse = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              message: introMessage,
              method: 'private-api'
            }),
          }
        )

        if (!textResponse.ok) {
          console.error('❌ Text response not OK:', textResponse.status)
          throw new Error(`Failed to send text: ${textResponse.status}`)
        }

        const textResult = await textResponse.json()
        const realTextGuid = textResult.data?.guid
        
        console.log('📨 Text response:', {
          status: textResult.status,
          message: textResult.message,
          guid: realTextGuid
        })

        if (textResult.status !== 200 && textResult.message !== 'Message sent!') {
          throw new Error(textResult.error?.message || 'Failed to send text message')
        }

        // Save text message to database
        if (realTextGuid) {
          const { error: textDbError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              body: introMessage,
              direction: 'outbound',
              delivery_status: 'sent',
              sender_phone: recipient.phone,
              guid: realTextGuid,
              is_read: true,
              created_at: new Date().toISOString()
            })
          
          if (textDbError) {
            console.error('⚠️ Error saving text to database:', textDbError)
          } else {
            console.log('✅ Text message saved to database')
          }
        }

        // Small delay between text and attachment
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Step 2: Send vCard attachment
        console.log('📎 Step 2: Sending vCard attachment...')
        console.log('📎 vCard preview (first 500 chars):', vCardContent.substring(0, 500))
        
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

        console.log('📎 Submitting vCard to BlueBubbles:', {
          chatGuid,
          fileName: 'Missouri Young Democrats.vcf',
          fileSize: vCardFile.size,
          hasPhoto: !!logoBase64
        })

        // Set timeout for vCard (30 seconds)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.log('⏱️ BlueBubbles timeout (30s) - attachment queued')
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

          console.log('📎 Attachment response status:', attachmentResponse.status)

          // Try to parse response
          let attachmentResult
          const responseText = await attachmentResponse.text()
          
          try {
            attachmentResult = JSON.parse(responseText)
            const realVCardGuid = attachmentResult.data?.guid
            
            console.log('📎 vCard sent successfully:', {
              status: attachmentResult.status,
              guid: realVCardGuid,
              message: attachmentResult.message
            })

            // Save vCard message with REAL GUID
            if (realVCardGuid) {
              const { error: vCardDbError } = await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  body: '\ufffc', // Unicode object replacement character for attachments
                  direction: 'outbound',
                  delivery_status: 'sent',
                  sender_phone: recipient.phone,
                  guid: realVCardGuid,
                  is_read: true,
                  is_contact_card: true,
                  created_at: new Date().toISOString()
                })

              if (vCardDbError) {
                console.error('⚠️ Error saving vCard to database:', vCardDbError)
              } else {
                console.log('✅ vCard message saved to database with GUID:', realVCardGuid)
              }
            }

          } catch (e) {
            console.log('⚠️ Attachment response not JSON:', responseText.substring(0, 200))
            
            // If we get a timeout/error, the message is likely queued
            if (responseText.includes('524') || !attachmentResponse.ok) {
              console.log('⚠️ Message queued - webhook will update when it sends')
              
              // Save with temp GUID, webhook will update it
              const tempVCardGuid = `temp-vcard-${Date.now()}`
              
              const { error: vCardDbError } = await supabase
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
              
              if (vCardDbError) {
                console.error('⚠️ Error saving temp vCard:', vCardDbError)
              } else {
                console.log('✅ vCard saved with temp GUID, waiting for webhook')
              }
            }
          }

        } catch (fetchError) {
          clearTimeout(timeoutId)
          
          if (fetchError.name === 'AbortError') {
            console.log('⏱️ Timeout - BlueBubbles processing in background')
            
            // Save with temp GUID
            const tempVCardGuid = `temp-vcard-${Date.now()}`
            
            const { error: vCardDbError } = await supabase
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
            
            if (vCardDbError) {
              console.error('⚠️ Error saving timeout vCard:', vCardDbError)
            } else {
              console.log('✅ vCard queued, saved with temp GUID')
            }
          } else {
            console.error('❌ Fetch error:', fetchError)
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

        console.log('✅ Intro send complete for', recipient.name)

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

    console.log('📊 Send intro summary:', {
      totalSent: successCount,
      totalFailed: recipients.length - successCount,
      results
    })

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

// 🔥 COMPLETE FIXED VCARD GENERATION WITH LINE FOLDING
function generateVCard(contact, logoBase64) {
  console.log('🔧 Generating vCard...', {
    hasLogo: !!logoBase64,
    logoLength: logoBase64?.length || 0
  })

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

  // Address with PO Box
  if (contact.address) {
    const { street, poBox, city, state, zip, country } = contact.address
    lines.push(`ADR;TYPE=WORK:;;${poBox};${city};${state};${zip};${country}`)
  }

  // 🔥 CRITICAL FIX: Properly fold the PHOTO line according to vCard 3.0 spec
  // The vCard 3.0 spec (RFC 2426) requires lines to be wrapped at 75 characters
  // Continuation lines must start with a space
  if (logoBase64) {
    console.log('📸 Adding photo to vCard with line folding...')
    
    const photoPrefix = 'PHOTO;ENCODING=b;TYPE=PNG:'
    const maxLineLength = 75
    const foldedLines = []
    
    let remainingData = logoBase64
    
    // First line: can be up to 75 characters total (including prefix)
    const firstChunkLength = maxLineLength - photoPrefix.length
    if (remainingData.length > firstChunkLength) {
      // Photo data is longer than one line - need to fold
      const firstChunk = remainingData.substring(0, firstChunkLength)
      foldedLines.push(photoPrefix + firstChunk)
      remainingData = remainingData.substring(firstChunkLength)
      
      // Subsequent lines: space + 74 characters (total 75)
      while (remainingData.length > 0) {
        const chunkLength = Math.min(74, remainingData.length)
        const chunk = remainingData.substring(0, chunkLength)
        foldedLines.push(' ' + chunk) // CRITICAL: Space at beginning for continuation
        remainingData = remainingData.substring(chunkLength)
      }
      
      console.log('📸 Photo folded into', foldedLines.length, 'lines')
    } else {
      // Photo data fits on one line
      foldedLines.push(photoPrefix + remainingData)
      console.log('📸 Photo fits on one line')
    }
    
    // Add all folded lines to the vCard
    lines.push(...foldedLines)
    
    console.log('📸 Photo added:', {
      photoDataLength: logoBase64.length,
      totalPhotoLines: foldedLines.length,
      firstLineLength: foldedLines[0].length,
      lastLineLength: foldedLines[foldedLines.length - 1].length,
      sampleFirstLine: foldedLines[0].substring(0, 80) + '...',
      sampleSecondLine: foldedLines.length > 1 ? foldedLines[1].substring(0, 80) + '...' : 'N/A'
    })
  } else {
    console.log('⚠️ No logo provided - vCard will not have photo')
  }

  lines.push('END:VCARD')

  const vCardContent = lines.join('\r\n')
  
  console.log('📝 vCard generation complete:', {
    totalLines: lines.length,
    hasPhoto: !!logoBase64,
    contentLength: vCardContent.length,
    linesWithPhoto: logoBase64 ? lines.filter(l => l.startsWith('PHOTO') || l.startsWith(' ')).length : 0
  })

  return vCardContent
}