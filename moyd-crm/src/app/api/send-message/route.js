import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Maximum file size: ~7.5MB (BlueBubbles/iMessage limit)
const MAX_FILE_SIZE = 7.5 * 1024 * 1024
const BLUEBUBBLES_TIMEOUT = 15000 // 15 seconds

// Generate unique GUID for each message
function generateTempGuid() {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 🔥 FIX: Map reaction codes to string names for BlueBubbles API
const REACTION_CODE_TO_TYPE = {
  2000: 'love',
  2001: 'like',
  2002: 'dislike',
  2003: 'laugh',
  2004: 'emphasize',
  2005: 'question',
  3000: '-love',
  3001: '-like',
  3002: '-dislike',
  3003: '-laugh',
  3004: '-emphasize',
  3005: '-question'
}

// Helper function to save reaction to database
async function saveReactionToDatabase(memberId, chatGuid, phone, blueBubblesResponse, associatedMessageGuid, reactionType) {
  try {
    // Get conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (!conversation) {
      console.log('⚠️ No conversation found for reaction')
      return
    }

    // Save reaction as a message with associated_message_type
    const reactionData = {
      conversation_id: conversation.id,
      guid: blueBubblesResponse.data?.guid || generateTempGuid(),
      body: '', // Reactions have empty body
      direction: 'outbound',
      delivery_status: 'sent',
      associated_message_guid: associatedMessageGuid,
      associated_message_type: reactionType, // Store the code (2000, 2001, etc.)
      created_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('messages')
      .insert(reactionData)

    if (error) {
      console.error('❌ Error saving reaction to database:', error)
    } else {
      console.log('✅ Reaction saved to database')
    }
  } catch (err) {
    console.error('❌ Error in saveReactionToDatabase:', err)
  }
}

// Helper function to save attachment to database
async function saveAttachmentToDatabase(memberId, chatGuid, phone, fileName, message) {
  try {
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (!conversation) {
      console.log('⚠️ No conversation found')
      return
    }

    // 🔥 FIX: Detect if this is a vCard file
    const isVCard = fileName.toLowerCase().endsWith('.vcf')

    const messageData = {
      conversation_id: conversation.id,
      guid: generateTempGuid(),
      body: message || (isVCard ? 'Contact Card' : '\ufffc'),
      direction: 'outbound',
      delivery_status: 'sending',
      media_url: fileName,
      created_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('messages')
      .insert(messageData)

    if (error) {
      console.error('❌ Error saving attachment to database:', error)
    } else {
      console.log('✅ Attachment saved to database')
    }
  } catch (err) {
    console.error('❌ Error in saveAttachmentToDatabase:', err)
  }
}

// Helper function to save text message to database
async function saveTextMessageToDatabase(memberId, chatGuid, phone, blueBubblesResponse, messageText, replyToGuid) {
  try {
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (!conversation) {
      console.log('⚠️ No conversation found')
      return
    }

    const messageData = {
      conversation_id: conversation.id,
      guid: blueBubblesResponse.data?.guid || generateTempGuid(),
      body: messageText,
      direction: 'outbound',
      delivery_status: 'sent',
      created_at: new Date().toISOString()
    }

    // Add thread info if it's a reply
    if (replyToGuid) {
      messageData.thread_originator_guid = replyToGuid
    }

    const { error } = await supabase
      .from('messages')
      .insert(messageData)

    if (error) {
      console.error('❌ Error saving message to database:', error)
    } else {
      console.log('✅ Message saved to database')
    }
  } catch (err) {
    console.error('❌ Error in saveTextMessageToDatabase:', err)
  }
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

    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Prepare BlueBubbles attachment payload
    const attachmentPayload = new FormData()
    attachmentPayload.append('chatGuid', chatGuid)
    attachmentPayload.append('name', file.name)
    attachmentPayload.append('attachment', new Blob([buffer], { type: file.type }), file.name)
    attachmentPayload.append('method', 'private-api')
    attachmentPayload.append('tempGuid', generateTempGuid()) // 🔥 FIX: Added tempGuid
    
    if (message) {
      attachmentPayload.append('message', message)
    }

    if (replyToGuid) {
      attachmentPayload.append('selectedMessageGuid', replyToGuid)
      attachmentPayload.append('partIndex', partIndex)
    }

    console.log('📤 Submitting attachment to BlueBubbles...')

    // Set up abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BLUEBUBBLES_TIMEOUT)

    try {
      const response = await fetch(
        `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
        {
          method: 'POST',
          body: attachmentPayload,
          signal: controller.signal
        }
      )

      clearTimeout(timeoutId)

      const result = await response.json()
      console.log('📎 BlueBubbles attachment response:', result)

      if (!response.ok || result.status !== 200) {
        throw new Error(result.error?.message || result.message || 'Failed to send attachment')
      }

      // Save to database in background if memberId provided
      if (memberId) {
        saveAttachmentToDatabase(memberId, chatGuid, phone, file.name, message)
          .catch(err => console.error('⚠️ Background DB save error:', err))
      }

      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        data: result.data
      })

    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        console.log('⏱️ BlueBubbles timeout - attachment queued and sending in background')
        
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

  const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

  try {
    // Handle reactions with correct BlueBubbles API format
    if (reaction) {
      console.log(`💙 Sending ${reaction} reaction...`)
      
      if (!replyToGuid) {
        return NextResponse.json(
          { error: 'replyToGuid required for reactions' },
          { status: 400 }
        )
      }

      const reactionType = reaction.toLowerCase()
      const part = parseInt(partIndex) || 0

      console.log('🎯 Reaction details:', {
        chatGuid,
        selectedMessageGuid: replyToGuid,
        reactionType,
        partIndex: part
      })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), BLUEBUBBLES_TIMEOUT)

      try {
        const response = await fetch(
          `${BB_HOST}/api/v1/message/react?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid,
              selectedMessageGuid: replyToGuid,
              reactionType,
              partIndex: part
            }),
            signal: controller.signal
          }
        )

        clearTimeout(timeoutId)

        const result = await response.json()
        console.log('💙 Reaction response:', result)

        if (!response.ok || result.status !== 200) {
          throw new Error(result.error?.message || result.message || 'Failed to send reaction')
        }

        const REACTION_TYPE_TO_CODE = {
          'love': 2000,
          'like': 2001,
          'dislike': 2002,
          'laugh': 2003,
          'emphasize': 2004,
          'question': 2005,
          '-love': 3000,
          '-like': 3001,
          '-dislike': 3002,
          '-laugh': 3003,
          '-emphasize': 3004,
          '-question': 3005
        }

        const reactionCode = REACTION_TYPE_TO_CODE[reactionType] || 2000

        // Save reaction to database in background
        if (memberId) {
          saveReactionToDatabase(memberId, chatGuid, phone, result, replyToGuid, reactionCode)
            .catch(err => console.error('⚠️ Background DB save error:', err))
        }

        return NextResponse.json({
          success: true,
          data: result.data,
          message: 'Reaction sent successfully'
        })

      } catch (fetchError) {
        clearTimeout(timeoutId)
        
        if (fetchError.name === 'AbortError') {
          console.log('⏱️ BlueBubbles reaction timeout - may still be processing')
          return NextResponse.json({
            success: true,
            message: 'Reaction submitted (processing)',
            note: 'BlueBubbles is processing your reaction'
          })
        }
        
        throw fetchError
      }
    }

    // Handle regular messages and replies
    if (message) {
      console.log(`💬 Sending message${replyToGuid ? ' (reply)' : ''}...`)

      // 🔥 FIX: Use private-api method with tempGuid
      const messagePayload = {
        chatGuid,
        message,
        method: 'private-api',      // ✅ FIXED: Changed from 'apple-script'
        tempGuid: generateTempGuid() // ✅ FIXED: Added tempGuid
      }

      // Add reply info if present
      if (replyToGuid) {
        messagePayload.selectedMessageGuid = replyToGuid
        messagePayload.partIndex = parseInt(partIndex) || 0
      }

      console.log('📤 Message payload:', messagePayload)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), BLUEBUBBLES_TIMEOUT)

      try {
        const response = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messagePayload),
            signal: controller.signal
          }
        )

        clearTimeout(timeoutId)

        const result = await response.json()
        console.log('💬 Message response:', result)

        if (!response.ok || result.status !== 200) {
          throw new Error(result.error?.message || result.message || 'Failed to send message')
        }

        // Save to database in background
        if (memberId) {
          saveTextMessageToDatabase(memberId, chatGuid, phone, result, message, replyToGuid)
            .catch(err => console.error('⚠️ Background DB save error:', err))
        }

        return NextResponse.json({
          success: true,
          data: result.data,
          message: 'Message sent successfully'
        })

      } catch (fetchError) {
        clearTimeout(timeoutId)
        
        if (fetchError.name === 'AbortError') {
          console.log('⏱️ BlueBubbles message timeout - may still be processing')
          
          // Save to database anyway since it's likely queued
          if (memberId) {
            const fallbackResponse = { data: { guid: generateTempGuid() } }
            saveTextMessageToDatabase(memberId, chatGuid, phone, fallbackResponse, message, replyToGuid)
              .catch(err => console.error('⚠️ Background DB save error:', err))
          }
          
          return NextResponse.json({
            success: true,
            message: 'Message submitted successfully',
            note: 'BlueBubbles is processing your message'
          })
        }
        
        throw fetchError
      }
    }

  } catch (error) {
    console.error('❌ Error sending message:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    )
  }
}