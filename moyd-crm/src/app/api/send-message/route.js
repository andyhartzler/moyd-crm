import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Maximum file size: ~7.5MB (BlueBubbles/iMessage limit)
const MAX_FILE_SIZE = 7.5 * 1024 * 1024
const BLUEBUBBLES_TIMEOUT = 15000 // Increased to 15 seconds

// Generate unique GUID for each message
function generateTempGuid() {
  return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export async function POST(request) {
  try {
    // Check content type BEFORE trying to parse body
    const contentType = request.headers.get('content-type') || ''
    const isFormData = contentType.includes('multipart/form-data')

    console.log('📨 Send message request:', {
      contentType,
      isFormData,
      timestamp: new Date().toISOString()
    })

    if (isFormData) {
      // Handle file attachment
      return await handleAttachment(request)
    } else {
      // Handle regular message or reaction
      return await handleTextMessage(request)
    }
  } catch (error) {
    console.error('❌ Error in send-message API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle file attachments with FormData
async function handleAttachment(request) {
  try {
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
    
    // 🔥 CRITICAL FIX: Convert file properly for BlueBubbles
    const fileBuffer = await file.arrayBuffer()
    const blob = new Blob([fileBuffer], { type: file.type || 'application/octet-stream' })
    
    const attachmentFormData = new FormData()
    attachmentFormData.append('chatGuid', chatGuid)
    attachmentFormData.append('name', file.name)
    attachmentFormData.append('attachment', blob, file.name)
    attachmentFormData.append('method', 'private-api')
    
    if (message && message.trim()) {
      attachmentFormData.append('message', message.trim())
    }

    if (replyToGuid) {
      attachmentFormData.append('selectedMessageGuid', replyToGuid)
      attachmentFormData.append('partIndex', partIndex)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('⏱️ BlueBubbles connection timeout - but attachment is likely queued')
      controller.abort()
    }, BLUEBUBBLES_TIMEOUT)

    try {
      console.log(`🔗 Submitting to: ${BB_HOST}/api/v1/message/attachment`)
      
      const response = await fetch(
        `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
        {
          method: 'POST',
          body: attachmentFormData,
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)
      
      // 🔥 CRITICAL FIX: Handle non-JSON responses properly
      const responseText = await response.text()
      let result
      
      try {
        result = JSON.parse(responseText)
      } catch (e) {
        console.log('⚠️ Response is not JSON:', responseText.substring(0, 200))
        
        // If response was successful but not JSON, treat as success
        if (response.ok || response.status === 200) {
          result = { status: 200, message: 'Attachment sent successfully' }
        } else {
          return NextResponse.json(
            { error: 'BlueBubbles returned non-JSON error response' },
            { status: response.status }
          )
        }
      }

      // Check if it's an error response
      if (!response.ok && result.status !== 200) {
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

          const smsResponse = await fetch(
            `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
            {
              method: 'POST',
              body: smsAttachmentFormData,
              signal: smsController.signal,
            }
          )

          clearTimeout(smsTimeoutId)

          const smsResponseText = await smsResponse.text()
          let smsResult

          try {
            smsResult = JSON.parse(smsResponseText)
          } catch (e) {
            if (smsResponse.ok || smsResponse.status === 200) {
              smsResult = { status: 200, message: 'SMS attachment sent successfully' }
            } else {
              return NextResponse.json(
                { error: 'BlueBubbles SMS returned non-JSON error response' },
                { status: smsResponse.status }
              )
            }
          }

          if (!smsResponse.ok && smsResult.status !== 200) {
            const errorMessage = smsResult.message || smsResult.error?.message || 'Failed to send SMS attachment'
            console.error('❌ SMS attachment error:', smsResult)

            return NextResponse.json(
              { error: errorMessage },
              { status: smsResponse.status }
            )
          }

          console.log('✅ SMS attachment submitted successfully!')

          // Save to database in background if memberId provided
          if (memberId) {
            saveAttachmentToDatabase(memberId, chatGuid, phone, file.name, message)
              .catch(err => console.error('⚠️ Background DB save error:', err))
          }

          return NextResponse.json({
            success: true,
            message: 'SMS attachment submitted successfully',
            note: 'Sent via SMS (recipient does not have iMessage)'
          })
        }

        const errorMessage = result.message || result.error?.message || 'Failed to send attachment'
        console.error('❌ BlueBubbles error:', result)

        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        )
      }

      console.log('✅ Attachment submitted successfully!')

      // Save to database in background if memberId provided
      if (memberId) {
        saveAttachmentToDatabase(memberId, chatGuid, phone, file.name, message)
          .catch(err => console.error('⚠️ Background DB save error:', err))
      }

      return NextResponse.json({
        success: true,
        message: 'Attachment submitted successfully',
        note: 'BlueBubbles is processing and sending your attachment in the background'
      })

    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        console.log('⚡ BlueBubbles didn\'t respond quickly, but attachment is likely queued and sending')
        
        // Save to database anyway since it's likely queued
        if (memberId) {
          saveAttachmentToDatabase(memberId, chatGuid, phone, file.name, message)
            .catch(err => console.error('⚠️ Background DB save error:', err))
        }
        
        return NextResponse.json({
          success: true,
          message: 'Attachment submitted successfully',
          note: 'BlueBubbles is processing your attachment (this is normal for large files)'
        })
      }
      
      console.error('❌ Network error:', fetchError.message)
      return NextResponse.json(
        { error: `Failed to connect to BlueBubbles: ${fetchError.message}` },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error('💥 Unexpected error handling attachment:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle text messages, reactions, and replies
async function handleTextMessage(request) {
  const body = await request.json()
  const { phone, message, memberId, reaction, replyToGuid, partIndex } = body

  console.log('📨 Text message request:', {
    phone,
    hasMessage: !!message,
    hasReaction: !!reaction,
    hasReply: !!replyToGuid,
    memberId
  })

  // Validate required fields
  if (!phone) {
    return NextResponse.json(
      { error: 'Phone is required' },
      { status: 400 }
    )
  }

  if (!reaction && !message) {
    return NextResponse.json(
      { error: 'Message or reaction is required' },
      { status: 400 }
    )
  }

  // Try iMessage first, fall back to SMS if it fails
  let chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`
  let triedSMS = false

  try {
    // Handle reactions
    if (reaction) {
      console.log(`💙 Sending ${reaction} reaction...`)
      
      if (!replyToGuid) {
        return NextResponse.json(
          { error: 'replyToGuid required for reactions' },
          { status: 400 }
        )
      }

      const reactionCode = parseInt(reaction)
      if (isNaN(reactionCode)) {
        return NextResponse.json(
          { error: 'Invalid reaction code' },
          { status: 400 }
        )
      }

      const messageGuid = replyToGuid
      const part = parseInt(partIndex) || 0

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(
        `${BB_HOST}/api/v1/message/react?password=${BB_PASSWORD}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatGuid,
            selectedMessageGuid: messageGuid,
            reaction: reactionCode,
            partIndex: part
          }),
          signal: controller.signal
        }
      )

      clearTimeout(timeoutId)

      const result = await response.json()

      if (!response.ok || result.status !== 200) {
        throw new Error(result.error?.message || result.message || 'Failed to send reaction')
      }

      // Save reaction to database in background
      if (memberId) {
        saveReactionToDatabase(memberId, chatGuid, phone, result, messageGuid, reactionCode)
          .catch(err => console.error('⚠️ Background DB save error:', err))
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        message: 'Reaction sent successfully'
      })
    }

    // Handle regular messages and replies
    if (message) {
      console.log(`💬 Sending message${replyToGuid ? ' (reply)' : ''}...`)

      let threadOriginatorGuid = null
      
      if (replyToGuid) {
        console.log('📎 This is a reply to:', replyToGuid)
        threadOriginatorGuid = replyToGuid
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const requestBody = {
        chatGuid,
        message,
        method: 'private-api',
        tempGuid: generateTempGuid()
      }

      if (replyToGuid) {
        requestBody.selectedMessageGuid = replyToGuid
        requestBody.partIndex = parseInt(partIndex) || 0
      }

      const response = await fetch(
        `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )

      clearTimeout(timeoutId)

      const result = await response.json()

      if (!response.ok || result.status !== 200) {
        // If iMessage failed with 500, retry with SMS
        if (!triedSMS && response.status === 500 && chatGuid.startsWith('iMessage')) {
          console.log('⚠️ iMessage failed, retrying with SMS...')
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
          const smsRequestBody = {
            chatGuid,
            message,
            method: 'private-api',
            tempGuid: generateTempGuid()
          }

          if (replyToGuid) {
            smsRequestBody.selectedMessageGuid = replyToGuid
            smsRequestBody.partIndex = parseInt(partIndex) || 0
          }

          const smsController = new AbortController()
          const smsTimeoutId = setTimeout(() => smsController.abort(), 10000)

          const smsResponse = await fetch(
            `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(smsRequestBody),
              signal: smsController.signal
            }
          )

          clearTimeout(smsTimeoutId)

          const smsResult = await smsResponse.json()

          if (!smsResponse.ok || smsResult.status !== 200) {
            throw new Error(smsResult.error?.message || smsResult.message || 'Failed to send SMS')
          }

          // Save SMS message to database in background
          if (memberId) {
            saveMessageToDatabase(memberId, chatGuid, message, phone, smsResult, 'outbound', threadOriginatorGuid)
              .catch(err => console.error('⚠️ Background DB save error:', err))
          }

          console.log('✅ SMS sent successfully!')

          return NextResponse.json({
            success: true,
            data: smsResult.data,
            message: 'SMS sent successfully',
            note: 'Sent via SMS (recipient does not have iMessage)'
          })
        }

        throw new Error(result.error?.message || result.message || 'Failed to send message')
      }

      // Save message to database in background
      if (memberId) {
        saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound', threadOriginatorGuid)
          .catch(err => console.error('⚠️ Background DB save error:', err))
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        message: 'Message sent successfully'
      })
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('⏱️ Request timeout')
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 408 }
      )
    }

    throw error
  }
}

// Save message to database
async function saveMessageToDatabase(memberId, chatGuid, messageBody, phone, result, direction, threadOriginatorGuid = null) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    console.log('💾 Saving message to database...')

    // Find existing conversation or create one
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    let conversationId
    if (existingConv) {
      conversationId = existingConv.id
      
      // Update conversation
      await supabase
        .from('conversations')
        .update({
          last_message: messageBody,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          last_message: messageBody,
          last_message_at: new Date().toISOString()
        })
        .select()
        .single()
      
      conversationId = newConv.id
    }

    // Save message (🔥 REMOVED has_attachments field)
    const messageData = {
      conversation_id: conversationId,
      body: messageBody,
      direction: direction,
      delivery_status: direction === 'outbound' ? 'sent' : 'delivered',
      sender_phone: phone,
      guid: result.data?.guid || `temp_${Date.now()}`,
      is_read: direction === 'outbound',
      created_at: new Date().toISOString()
    }

    if (threadOriginatorGuid) {
      messageData.thread_originator_guid = threadOriginatorGuid
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert(messageData)

    if (msgError) {
      console.error('⚠️ Error creating message:', msgError)
    } else {
      console.log('✅ Message saved to database!')
    }
  } catch (error) {
    console.error('❌ Database error (message was still sent):', error)
  }
}

// Save attachment to database (🔥 REMOVED has_attachments field)
async function saveAttachmentToDatabase(memberId, chatGuid, phone, fileName, message) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    console.log('💾 Saving attachment message to database...')

    // Find existing conversation or create one
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    let conversationId
    const displayMessage = message || `📎 ${fileName}`
    
    if (existingConv) {
      conversationId = existingConv.id
      
      // Update conversation
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

    // Save message with attachment indicator (🔥 REMOVED has_attachments field)
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        body: message || '',
        direction: 'outbound',
        delivery_status: 'sent',
        sender_phone: phone,
        guid: `temp_attachment_${Date.now()}`,
        is_read: true,
        created_at: new Date().toISOString()
      })

    if (msgError) {
      console.error('⚠️ Error creating attachment message:', msgError)
    } else {
      console.log('✅ Attachment message saved to database!')
    }
  } catch (error) {
    console.error('❌ Database error (attachment was still sent):', error)
  }
}

// Save reaction to database
async function saveReactionToDatabase(memberId, chatGuid, phone, result, associatedMessageGuid, associatedMessageType) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // Find conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (!existingConv) {
      console.warn('⚠️ Conversation not found for reaction')
      return
    }

    // Create reaction record
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: existingConv.id,
      body: '',
      direction: 'outbound',
      delivery_status: 'sent',
      sender_phone: phone,
      guid: result.data?.guid || `temp_reaction_${Date.now()}`,
      associated_message_guid: associatedMessageGuid,
      associated_message_type: associatedMessageType,
      is_read: false
    })

    if (msgError) {
      console.error('⚠️ Error creating reaction record:', msgError)
    } else {
      console.log('✅ Reaction saved to database!')
    }
  } catch (error) {
    console.error('❌ Database error (reaction was still sent):', error)
  }
}