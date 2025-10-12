import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

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

    console.log('📄 File details:', {
      name: file.name,
      type: file.type,
      size: `${(file.size / 1024).toFixed(1)} KB`
    })

    // Format chat GUID
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    // ==========================================
    // Convert file to Base64 with MIME type
    // ==========================================
    console.log('🔄 Converting file to Base64...')
    
    const fileBuffer = await file.arrayBuffer()
    const base64File = Buffer.from(fileBuffer).toString('base64')
    
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
      payload.partIndex = partIndex
    }

    console.log('📤 Sending to BlueBubbles:', {
      endpoint: '/api/v1/message/attachment',
      chatGuid,
      fileName: file.name,
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
    console.log('📥 BlueBubbles response:', responseText.substring(0, 200))

    if (!response.ok) {
      console.error('❌ BlueBubbles error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
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
      // If response is not JSON, that's okay
      data = { success: true }
    }

    console.log('✅ Attachment sent successfully!')
    console.log('   Response data:', data)

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

export const config = {
  api: {
    bodyParser: false,  // Disable default body parser for file uploads
  },
}