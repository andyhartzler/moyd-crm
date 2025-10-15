import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Maximum file size: ~7.5MB (BlueBubbles/iMessage limit)
const MAX_FILE_SIZE = 7.5 * 1024 * 1024
const BLUEBUBBLES_TIMEOUT = 10000

// Generate unique GUID for each message
function generateTempGuid() {
  return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export async function POST(request) {
  try {
    // ⚡ CRITICAL FIX: Check content type BEFORE trying to parse body
    // Once you call request.json() or request.formData(), the body is consumed!
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

    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    console.log('📤 Sending attachment to BlueBubbles...')
    
    const fileBuffer = await file.arrayBuffer()
    const blob = new Blob([fileBuffer], { type: file.type })
    
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
      console.log('⏱️ BlueBubbles connection timeout (10s) - but attachment is likely queued')
      controller.abort()
    }, BLUEBUBBLES_TIMEOUT)

    try {
      console.log(`🔗 Submitting to: ${BB_HOST}/api/v1/message/attachment`)
      
      const responsePromise = fetch(
        `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
        {
          method: 'POST',
          body: attachmentFormData,
          signal: controller.signal,
        }
      )

      const response = await Promise.race([
        responsePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), BLUEBUBBLES_TIMEOUT)
        )
      ])

      clearTimeout(timeoutId)
      
      // If we got a response, check if it's an error
      if (response && !response.ok) {
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
      
      if (fetchError.name === 'AbortError' || fetchError.message === 'TIMEOUT') {
        console.log('⚡ BlueBubbles didn\'t respond quickly, but attachment is likely queued and sending')
        
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

  const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

  // Route to appropriate handler
  if (reaction) {
    return await sendReaction(chatGuid, replyToGuid, reaction, partIndex, phone, memberId)
  } else if (replyToGuid) {
    return await sendReply(chatGuid, message, replyToGuid, phone, memberId, partIndex)
  } else {
    return await sendMessage(chatGuid, message, phone, memberId)
  }
}

// Send a regular message
async function sendMessage(chatGuid, message, phone, memberId) {
  console.log('📤 Sending message via BlueBubbles Private API')

  const tempGuid = generateTempGuid()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatGuid: chatGuid,
          message: message,
          method: 'private-api',
          tempGuid: tempGuid
        }),
      }
    )

    clearTimeout(timeoutId)

    const result = await response.json()

    if (!response.ok || result.status !== 200) {
      console.error('❌ BlueBubbles API error:', result)
      return NextResponse.json(
        {
          error: result.error?.message || result.message || 'Failed to send message',
          details: result
        },
        { status: response.status || 500 }
      )
    }

    console.log('✅ Message sent successfully via BlueBubbles!')

    // Save to database in background (non-blocking)
    if (memberId) {
      saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound')
        .catch(err => console.error('⚠️ Background DB save error:', err))
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      tempGuid: tempGuid,
      message: 'Message sent successfully'
    })
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error.name === 'AbortError') {
      console.error('⏱️ Request timeout')
      return NextResponse.json(
        { error: 'Request timeout - BlueBubbles server may be slow or unavailable' },
        { status: 408 }
      )
    }
    
    throw error
  }
}

// Send a reply
async function sendReply(chatGuid, message, replyToGuid, phone, memberId, partIndex) {
  console.log('📤 Sending reply via BlueBubbles Private API')

  const tempGuid = generateTempGuid()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatGuid: chatGuid,
          message: message,
          method: 'private-api',
          tempGuid: tempGuid,
          selectedMessageGuid: replyToGuid,
          partIndex: parseInt(partIndex) || 0
        }),
      }
    )

    clearTimeout(timeoutId)

    const result = await response.json()

    if (!response.ok || result.status !== 200) {
      console.error('❌ BlueBubbles API error:', result)
      return NextResponse.json(
        {
          error: result.error?.message || result.message || 'Failed to send reply',
          details: result
        },
        { status: response.status || 500 }
      )
    }

    console.log('✅ Reply sent successfully via BlueBubbles!')

    // Save to database in background
    if (memberId) {
      saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound', replyToGuid)
        .catch(err => console.error('⚠️ Background DB save error:', err))
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      tempGuid: tempGuid,
      message: 'Reply sent successfully'
    })
  } catch (error) {
    clearTimeout(timeoutId)
    
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

// Send a reaction (tapback)
async function sendReaction(chatGuid, messageGuid, reactionCode, partIndex, phone, memberId) {
  console.log('📤 Sending reaction via BlueBubbles Private API:', {
    messageGuid,
    reactionCode,
    partIndex
  })

  const tempGuid = generateTempGuid()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `${BB_HOST}/api/v1/message/react?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatGuid: chatGuid,
          selectedMessageGuid: messageGuid,
          reaction: reactionCode,
          partIndex: parseInt(partIndex) || 0
        }),
      }
    )

    clearTimeout(timeoutId)

    const result = await response.json()

    if (!response.ok || result.status !== 200) {
      console.error('❌ BlueBubbles API error:', result)
      return NextResponse.json(
        {
          error: result.error?.message || result.message || 'Failed to send reaction',
          details: result
        },
        { status: response.status || 500 }
      )
    }

    console.log('✅ Reaction sent successfully!')

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
  } catch (error) {
    clearTimeout(timeoutId)
    
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

    // Save message
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

// Save attachment to database
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

    // Save message with attachment indicator
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
        has_attachments: true,
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