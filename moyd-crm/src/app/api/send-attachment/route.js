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

    // ==========================================
    // CORRECT METHOD: multipart/form-data with 'attachment' field
    // Based on .NET client and BlueBubbles server code
    // ==========================================
    console.log('📤 Sending attachment via multipart/form-data...')
    
    const fileBuffer = await file.arrayBuffer()
    const blob = new Blob([fileBuffer], { type: file.type })
    
    const attachmentFormData = new FormData()
    attachmentFormData.append('chatGuid', chatGuid)
    attachmentFormData.append('attachment', blob, file.name)
    attachmentFormData.append('method', 'private-api')
    
    if (message && message.trim()) {
      attachmentFormData.append('message', message.trim())
    }

    if (replyToGuid) {
      attachmentFormData.append('selectedMessageGuid', replyToGuid)
      attachmentFormData.append('partIndex', partIndex)
    }

    const response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        body: attachmentFormData,
        // Don't set Content-Type header - let fetch set it with boundary
      }
    )

    const responseText = await response.text()
    console.log('BlueBubbles response status:', response.status)
    console.log('BlueBubbles response:', responseText.substring(0, 500))

    if (!response.ok) {
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

    let result
    try {
      result = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse response JSON:', e)
      return NextResponse.json(
        { error: 'Invalid response from BlueBubbles server' },
        { status: 500 }
      )
    }

    console.log('✅ Attachment sent successfully!')

    // Save to database
    await saveAttachmentToDatabase(memberId, chatGuid, phone, result, file.name, message)

    return NextResponse.json({
      success: true,
      message: 'Attachment sent successfully',
      data: result.data
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
      // Update last message time
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    // Create message record
    if (conversationId) {
      const messageBody = messageText || '\ufffc' // Unicode attachment character
      
      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        body: messageBody,
        direction: 'outbound',
        delivery_status: 'sent',
        sender_phone: phone,
        guid: result.data?.guid || `temp_${Date.now()}`,
        is_read: false,
      })

      if (msgError) {
        console.error('Error creating message record:', msgError)
      } else {
        console.log('✅ Attachment message saved to database')
      }
    }
  } catch (error) {
    console.error('❌ Database error:', error)
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}