import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Maximum file size: ~7.5MB (BlueBubbles/iMessage limit)
const MAX_FILE_SIZE = 7.5 * 1024 * 1024

export async function POST(request) {
  try {
    console.log('📎 Send attachment request received')

    const formData = await request.formData()
    const file = formData.get('file')
    const phone = formData.get('phone')
    const memberId = formData.get('memberId')
    const message = formData.get('message') || ''  // Optional text with attachment
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
      size: `${(file.size / 1024).toFixed(1)} KB`,
      maxSize: `${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)} MB`
    })

    // Format chat GUID
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    // ==========================================
    // Convert file to Base64 with MIME type
    // ==========================================
    console.log('🔄 Converting file to Base64...')
    
    const fileBuffer = await file.arrayBuffer()
    const base64File = Buffer.from(fileBuffer).toString('base64')
    
    // Validate base64 length
    if (base64File.length > 10000000) {
      return NextResponse.json(
        { error: 'File encoding resulted in payload too large' },
        { status: 400 }
      )
    }
    
    // Add MIME type prefix (required by BlueBubbles)
    const base64WithPrefix = `data:${file.type};base64,${base64File}`
    
    console.log('✅ Base64 conversion complete')
    console.log('   MIME type:', file.type)
    console.log('   Base64 length:', base64File.length)
    console.log('   Full data URL length:', base64WithPrefix.length)

    // ==========================================
    // Build request payload
    // ==========================================
    const payload = {
      chatGuid: chatGuid,
      attachmentData: base64WithPrefix,  // Full data URL format
      attachmentName: file.name,
      method: 'private-api'
    }

    // Add optional text message
    if (message && message.trim()) {
      payload.message = message.trim()
    }

    // Add reply reference if replying
    if (replyToGuid) {
      payload.selectedMessageGuid = replyToGuid
      payload.partIndex = parseInt(partIndex) || 0
    }

    console.log('📤 Sending to BlueBubbles:', {
      endpoint: '/api/v1/message/attachment',
      chatGuid,
      fileName: file.name,
      fileSize: file.size,
      hasMessage: !!message,
      isReply: !!replyToGuid
    })

    // ==========================================
    // Send to BlueBubbles
    // ==========================================
    const response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    const responseText = await response.text()
    console.log('📥 BlueBubbles response status:', response.status)
    console.log('📥 BlueBubbles response preview:', responseText.substring(0, 200))

    if (!response.ok) {
      console.error('❌ BlueBubbles error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText.substring(0, 500)
      })
      
      // Try to parse error
      let errorMessage = 'Failed to send attachment'
      try {
        const errorData = JSON.parse(responseText)
        errorMessage = errorData.message || errorData.error || errorMessage
      } catch (e) {
        errorMessage = responseText || errorMessage
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    // Parse success response
    let data
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      // If response is not JSON, that's okay for success
      data = { success: true }
    }

    console.log('✅ Attachment sent successfully!')
    console.log('   Response data:', data)

    // Save to database
    if (memberId) {
      await saveAttachmentToDatabase(memberId, chatGuid, phone, data, file.name, message)
    }

    return NextResponse.json({
      success: true,
      message: 'Attachment sent successfully',
      data: data
    })

  } catch (error) {
    console.error('❌ Send attachment error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

async function saveAttachmentToDatabase(memberId, chatGuid, phone, result, fileName, messageText) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .single()

    let conversationId = existingConv?.id

    if (!conversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          chat_identifier: chatGuid,
          status: 'Active',
          last_message_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (convError) {
        console.error('Error creating conversation:', convError)
        return
      }
      conversationId = newConv.id
    } else {
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    // Create message record with attachment
    if (conversationId) {
      const messageBody = messageText || '\ufffc' // Unicode attachment placeholder
      
      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        body: messageBody,
        direction: 'outbound',
        delivery_status: 'sent',
        sender_phone: phone,
        guid: result.data?.guid || `temp_${Date.now()}`,
        is_read: false,
        // Note: media_url will be populated by webhook when message is confirmed
      })

      if (msgError) {
        console.error('Error creating message record:', msgError)
      } else {
        console.log('Attachment message saved to database')
      }
    }
  } catch (error) {
    console.error('Database error:', error)
  }
}

export const config = {
  api: {
    bodyParser: false,  // Disable default body parser for file uploads
  },
}