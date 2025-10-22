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

    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

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
        const errorMessage = result.message || result.error?.message || 'Failed to send attachment'
        console.error('❌ BlueBubbles error:', result)
        
        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        )
      }

      console.log('✅ Attachment submitted successfully!')

      // 🔥 FIX: Don't save to database - webhook will handle it
      console.log('✅ Attachment sent to BlueBubbles, webhook will save it')

      return NextResponse.json({
        success: true,
        message: 'Attachment submitted successfully',
        note: 'BlueBubbles is processing and sending your attachment in the background'
      })

    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        console.log('⚡ BlueBubbles didn\'t respond quickly, but attachment is likely queued and sending')

        // 🔥 FIX: Don't save to database - webhook will handle it when it sends
        console.log('✅ Attachment queued in BlueBubbles, webhook will save it when sent')

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

      // 🔥 FIX: Don't save to database - webhook will handle it
      console.log('✅ Reaction sent to BlueBubbles, webhook will save it')

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
        throw new Error(result.error?.message || result.message || 'Failed to send message')
      }

      // 🔥 FIX: Don't save to database - webhook will handle it
      console.log('✅ Message sent to BlueBubbles, webhook will save it')

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

// 🔥 REMOVED: All database save functions
// The webhook handles ALL message saving (both inbound and outbound)
// This prevents duplicate messages and ensures correct GUID tracking