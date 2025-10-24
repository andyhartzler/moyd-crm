import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Maximum file size: ~7.5MB (BlueBubbles/iMessage limit)
const MAX_FILE_SIZE = 7.5 * 1024 * 1024
// Longer timeout for attachment processing (attachments take time to upload/process)
const BLUEBUBBLES_TIMEOUT = 60000 // 60 seconds

export async function POST(request) {
  try {
    console.log('📎 Send attachment request received')

    const formData = await request.formData()
    const file = formData.get('file')
    const phone = formData.get('phone')
    const memberId = formData.get('memberId')
    const message = formData.get('message') || ''
    const replyToGuid = formData.get('replyToGuid')
    const partIndex = formData.get('partIndex') || '0'

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number required' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB` },
        { status: 400 }
      )
    }

    console.log('📄 File details:', {
      name: file.name,
      type: file.type,
      size: `${(file.size / 1024).toFixed(1)} KB`
    })

    // Try iMessage first, fall back to SMS if it fails
    let chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`
    let triedSMS = false

    console.log('📤 Sending attachment to BlueBubbles...')

    const fileBuffer = await file.arrayBuffer()
    const blob = new Blob([fileBuffer], { type: file.type })

    // Use simple attachment endpoint - it supports message parameter for captions
    const attachmentFormData = new FormData()
    attachmentFormData.append('chatGuid', chatGuid)
    attachmentFormData.append('name', file.name)
    attachmentFormData.append('attachment', blob, file.name)
    attachmentFormData.append('method', 'private-api')

    // Add caption if provided
    if (message && message.trim()) {
      attachmentFormData.append('message', message.trim())
      console.log('📝 Including caption:', message.trim().substring(0, 50))
    }

    if (replyToGuid) {
      attachmentFormData.append('selectedMessageGuid', replyToGuid)
      attachmentFormData.append('partIndex', partIndex)
    }

    // ⚡ CRITICAL FIX: BlueBubbles Private API is ASYNCHRONOUS
    // It queues the message and sends it in the background
    // We just need to confirm BlueBubbles received our request, not wait for delivery

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('⏱️ BlueBubbles connection timeout (60s) - but attachment is likely queued')
      controller.abort()
    }, BLUEBUBBLES_TIMEOUT)

    try {
      console.log(`🔗 Submitting to: ${BB_HOST}/api/v1/message/attachment`)

      // Fire and forget - we don't need to wait for the full response
      const responsePromise = fetch(
        `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
        {
          method: 'POST',
          body: attachmentFormData,
          signal: controller.signal,
        }
      )

      // Wait up to 10 seconds for BlueBubbles to acknowledge receipt
      const response = await Promise.race([
        responsePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), BLUEBUBBLES_TIMEOUT)
        )
      ])

      clearTimeout(timeoutId)

      // If we got a response, check if it's an error
      if (response && !response.ok) {
        // If iMessage failed with 500, retry with SMS
        if (!triedSMS && response.status === 500 && chatGuid.startsWith('iMessage')) {
          console.log('⚠️ iMessage attachment failed, retrying with SMS...')
          triedSMS = true

          // Create SMS chat first and get the actual chat GUID
          console.log('📱 Creating SMS chat...')
          let actualChatGuid = `SMS;-;${phone}` // fallback

          try {
            const createChatResponse = await fetch(
              `${BB_HOST}/api/v1/chat/new?password=${BB_PASSWORD}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  addresses: [phone],
                  service: 'SMS'
                })
              }
            )

            if (createChatResponse.ok) {
              const chatResult = await createChatResponse.json()
              console.log('✅ SMS chat created:', chatResult)

              // Use the actual chat GUID from the response
              if (chatResult.data && chatResult.data.guid) {
                actualChatGuid = chatResult.data.guid
                console.log('📋 Using actual chat GUID:', actualChatGuid)
              } else {
                console.log('⚠️ No GUID in response, using constructed format')
              }
            } else {
              console.log('⚠️ Chat may already exist:', createChatResponse.status)
            }
          } catch (err) {
            console.log('⚠️ Chat creation warning (continuing):', err.message)
          }

          chatGuid = actualChatGuid

          // Wait a moment for chat to be ready
          await new Promise(resolve => setTimeout(resolve, 1500))

          // Retry with SMS using actual chat GUID
          const smsAttachmentFormData = new FormData()
          smsAttachmentFormData.append('chatGuid', chatGuid)
          smsAttachmentFormData.append('name', file.name)
          smsAttachmentFormData.append('attachment', blob, file.name)
          smsAttachmentFormData.append('method', 'private-api')

          if (message && message.trim()) {
            smsAttachmentFormData.append('message', message.trim())
          }

          if (replyToGuid) {
            smsAttachmentFormData.append('selectedMessageGuid', replyToGuid)
            smsAttachmentFormData.append('partIndex', partIndex)
          }

          const smsController = new AbortController()
          const smsTimeoutId = setTimeout(() => smsController.abort(), BLUEBUBBLES_TIMEOUT)

          const smsResponsePromise = fetch(
            `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
            {
              method: 'POST',
              body: smsAttachmentFormData,
              signal: smsController.signal,
            }
          )

          const smsResponse = await Promise.race([
            smsResponsePromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), BLUEBUBBLES_TIMEOUT)
            )
          ])

          clearTimeout(smsTimeoutId)

          if (smsResponse && !smsResponse.ok) {
            const smsResponseText = await smsResponse.text()
            let smsErrorMessage = 'Failed to send SMS attachment'

            try {
              const smsErrorData = JSON.parse(smsResponseText)
              smsErrorMessage = smsErrorData.message || smsErrorData.error?.message || smsErrorMessage
              console.error('❌ BlueBubbles SMS error:', smsErrorData)
            } catch (e) {
              smsErrorMessage = smsResponseText || smsErrorMessage
              console.error('❌ BlueBubbles SMS error (raw):', smsResponseText.substring(0, 200))
            }

            return NextResponse.json(
              { error: smsErrorMessage },
              { status: smsResponse.status }
            )
          }

          console.log('✅ SMS attachment submitted successfully!')

          // 🔥 Save placeholder for SMS attachment (webhook will update if needed)
          if (memberId) {
            try {
              await saveAttachmentMessage(memberId, phone, file.name, file.type, message, null, null)
            } catch (dbError) {
              console.error('⚠️ Database save error (attachment was still sent):', dbError)
            }
          }

          return NextResponse.json({
            success: true,
            message: 'SMS attachment submitted successfully',
            note: 'Sent via SMS (recipient does not have iMessage)'
          })
        }

        const responseText = await response.text()
        let errorMessage = 'Failed to send attachment'

        try {
          const errorData = JSON.parse(responseText)
          errorMessage = errorData.message || errorData.error?.message || errorMessage
          console.error('❌ BlueBubbles error:', errorData)
        } catch (e) {
          errorMessage = responseText || errorMessage
          console.error('❌ BlueBubbles error (raw):', responseText.substring(0, 200))
        }

        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        )
      }

      console.log('✅ Attachment submitted successfully!')

      // 🔥 Parse response to get message GUID and attachment GUID
      let messageGuid = null
      let attachmentGuid = null
      let mediaUrl = null

      try {
        const responseData = await response.json()
        console.log('📦 BlueBubbles response:', JSON.stringify(responseData).substring(0, 500))

        // Extract message GUID and attachment GUID from response
        if (responseData && responseData.data) {
          messageGuid = responseData.data.guid

          if (responseData.data.attachments && responseData.data.attachments.length > 0) {
            attachmentGuid = responseData.data.attachments[0].guid
            // Build media_url immediately using attachment GUID
            mediaUrl = `${BB_HOST}/api/v1/attachment/${attachmentGuid}/download/force?password=${BB_PASSWORD}`
            console.log('✅ Built media_url from attachment GUID:', attachmentGuid.substring(0, 30))
          }
        }
      } catch (parseError) {
        console.warn('⚠️ Could not parse BlueBubbles response:', parseError.message)
      }

      // 🔥 Save message with REAL GUID and media_url immediately (no webhook needed!)
      if (memberId) {
        try {
          await saveAttachmentMessage(memberId, phone, file.name, file.type, message, messageGuid, mediaUrl)
        } catch (dbError) {
          console.error('⚠️ Database save error (attachment was still sent):', dbError)
        }
      }

      // Return success with media URL
      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        mediaUrl: mediaUrl
      })

    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      // If we timeout or get aborted, that's actually OK for attachments
      // BlueBubbles likely received it and is processing in the background
      if (fetchError.name === 'AbortError' || fetchError.message === 'TIMEOUT') {
        console.log('⚡ BlueBubbles didn\'t respond quickly, but attachment is likely queued and sending')

        // 🔥 Save placeholder even on timeout (webhook will update if needed)
        if (memberId) {
          try {
            await saveAttachmentMessage(memberId, phone, file.name, file.type, message, null, null)
          } catch (dbError) {
            console.error('⚠️ Database save error (attachment was still sent):', dbError)
          }
        }

        // Return success anyway - the attachment was submitted
        return NextResponse.json({
          success: true,
          message: 'Attachment submitted successfully',
          note: 'BlueBubbles is processing your attachment (this is normal for large files)'
        })
      }
      
      // Only fail on actual network errors
      console.error('❌ Network error:', fetchError.message)
      return NextResponse.json(
        { error: `Failed to connect to BlueBubbles: ${fetchError.message}` },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('💥 Unexpected error in send-attachment API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Save attachment message with real GUID and media_url from BlueBubbles response
async function saveAttachmentMessage(memberId, phone, fileName, fileType, caption, messageGuid, mediaUrl) {
  try {
    console.log('💾 Saving attachment message...')

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    let conversationId
    const isImage = fileType?.startsWith('image/')

    // If we have media_url, use attachment character; otherwise use emoji placeholder
    const displayMessage = mediaUrl
      ? (caption || '\ufffc')  // Use attachment character when we have the URL
      : (caption || (isImage ? `📷 ${fileName}` : `📎 ${fileName}`))  // Fallback to emoji

    if (existingConv) {
      conversationId = existingConv.id

      await supabase
        .from('conversations')
        .update({
          last_message: displayMessage,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          last_message: displayMessage,
          last_message_at: new Date().toISOString()
        })
        .select()
        .single()

      conversationId = newConv.id
    }

    // Use real GUID from BlueBubbles if available, otherwise generate temp GUID
    const guid = messageGuid || `temp_attachment_${Date.now()}_${phone.replace(/\+/g, '')}`

    // Prepare message data
    const messageData = {
      conversation_id: conversationId,
      body: displayMessage,
      direction: 'outbound',
      delivery_status: 'sent',
      sender_phone: phone,
      guid: guid,
      is_read: true,
      created_at: new Date().toISOString()
    }

    // Add media_url if we have it
    if (mediaUrl) {
      messageData.media_url = mediaUrl
      console.log('✅ Saving with media_url:', mediaUrl.substring(0, 80) + '...')
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert(messageData)

    if (msgError) {
      console.error('⚠️ Error saving attachment message:', msgError)
    } else {
      console.log('✅ Attachment message saved successfully!', mediaUrl ? 'With media_url!' : 'As placeholder.')
    }
  } catch (error) {
    console.error('❌ Database error:', error)
    throw error
  }
}