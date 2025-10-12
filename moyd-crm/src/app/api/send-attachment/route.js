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
      size: `${(file.size / 1024).toFixed(1)} KB`,
      maxSize: `${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)} MB`
    })

    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    // Convert file to Base64
    console.log('🔄 Converting file to Base64...')
    const fileBuffer = await file.arrayBuffer()
    const base64File = Buffer.from(fileBuffer).toString('base64')
    
    console.log('✅ Base64 conversion complete')
    console.log('   Base64 length:', base64File.length)

    // ==========================================
    // ATTEMPT 1: Try with just base64 (no prefix) and separate mimeType
    // ==========================================
    console.log('📤 ATTEMPT 1: Sending with base64 + mimeType fields...')
    
    let payload = {
      chatGuid: chatGuid,
      attachment: base64File,     // Raw base64
      name: file.name,
      mimeType: file.type,        // Separate MIME type
      method: 'private-api'
    }

    if (message && message.trim()) {
      payload.message = message.trim()
    }

    if (replyToGuid) {
      payload.selectedMessageGuid = replyToGuid
      payload.partIndex = parseInt(partIndex) || 0
    }

    let response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    if (response.ok) {
      const data = await response.json()
      console.log('✅ ATTEMPT 1 SUCCESS!')
      await saveAttachmentToDatabase(memberId, chatGuid, phone, data, file.name, message)
      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        data: data
      })
    }

    console.log('❌ ATTEMPT 1 failed:', response.status)

    // ==========================================
    // ATTEMPT 2: Try with data URI prefix
    // ==========================================
    console.log('📤 ATTEMPT 2: Sending with data URI prefix...')
    
    const base64WithPrefix = `data:${file.type};base64,${base64File}`
    payload.attachment = base64WithPrefix

    response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    if (response.ok) {
      const data = await response.json()
      console.log('✅ ATTEMPT 2 SUCCESS!')
      await saveAttachmentToDatabase(memberId, chatGuid, phone, data, file.name, message)
      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        data: data
      })
    }

    console.log('❌ ATTEMPT 2 failed:', response.status)

    // ==========================================
    // ATTEMPT 3: Try different field name (attachmentData)
    // ==========================================
    console.log('📤 ATTEMPT 3: Sending with attachmentData field...')
    
    payload = {
      chatGuid: chatGuid,
      attachmentData: base64File,  // Different field name
      name: file.name,
      mimeType: file.type,
      method: 'private-api'
    }

    if (message && message.trim()) {
      payload.message = message.trim()
    }

    if (replyToGuid) {
      payload.selectedMessageGuid = replyToGuid
      payload.partIndex = parseInt(partIndex) || 0
    }

    response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    if (response.ok) {
      const data = await response.json()
      console.log('✅ ATTEMPT 3 SUCCESS!')
      await saveAttachmentToDatabase(memberId, chatGuid, phone, data, file.name, message)
      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        data: data
      })
    }

    console.log('❌ ATTEMPT 3 failed:', response.status)

    // ==========================================
    // ATTEMPT 4: Try multipart/form-data
    // ==========================================
    console.log('📤 ATTEMPT 4: Sending with multipart form-data...')
    
    const formDataPayload = new FormData()
    formDataPayload.append('chatGuid', chatGuid)
    formDataPayload.append('attachment', new Blob([fileBuffer], { type: file.type }), file.name)
    formDataPayload.append('method', 'private-api')
    
    if (message && message.trim()) {
      formDataPayload.append('message', message.trim())
    }

    if (replyToGuid) {
      formDataPayload.append('selectedMessageGuid', replyToGuid)
      formDataPayload.append('partIndex', partIndex)
    }

    response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        body: formDataPayload,
      }
    )

    if (response.ok) {
      const data = await response.json()
      console.log('✅ ATTEMPT 4 SUCCESS!')
      await saveAttachmentToDatabase(memberId, chatGuid, phone, data, file.name, message)
      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        data: data
      })
    }

    console.log('❌ ATTEMPT 4 failed:', response.status)

    // ==========================================
    // ATTEMPT 5: Try with 'file' field instead of 'attachment'
    // ==========================================
    console.log('📤 ATTEMPT 5: Sending with file field...')
    
    payload = {
      chatGuid: chatGuid,
      file: base64File,           // 'file' instead of 'attachment'
      name: file.name,
      mimeType: file.type,
      method: 'private-api'
    }

    if (message && message.trim()) {
      payload.message = message.trim()
    }

    if (replyToGuid) {
      payload.selectedMessageGuid = replyToGuid
      payload.partIndex = parseInt(partIndex) || 0
    }

    response = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    if (response.ok) {
      const data = await response.json()
      console.log('✅ ATTEMPT 5 SUCCESS!')
      await saveAttachmentToDatabase(memberId, chatGuid, phone, data, file.name, message)
      return NextResponse.json({
        success: true,
        message: 'Attachment sent successfully',
        data: data
      })
    }

    console.log('❌ ATTEMPT 5 failed:', response.status)

    // ==========================================
    // All attempts failed - return last error
    // ==========================================
    const responseText = await response.text()
    console.error('❌ ALL ATTEMPTS FAILED')
    console.error('Last response:', responseText.substring(0, 500))

    let errorMessage = 'Failed to send attachment - all methods failed'
    try {
      const errorData = JSON.parse(responseText)
      errorMessage = errorData.message || errorData.error?.message || errorMessage
    } catch (e) {
      errorMessage = responseText || errorMessage
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        hint: 'Check BlueBubbles server logs or documentation for correct attachment format'
      },
      { status: response.status }
    )

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

    if (conversationId) {
      const messageBody = messageText || '\ufffc'
      
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
        console.log('Attachment message saved to database')
      }
    }
  } catch (error) {
    console.error('Database error:', error)
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}