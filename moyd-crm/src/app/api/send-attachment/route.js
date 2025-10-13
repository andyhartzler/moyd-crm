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

    console.log('📤 Sending attachment via multipart/form-data...')
    
    const fileBuffer = await file.arrayBuffer()
    const blob = new Blob([fileBuffer], { type: file.type })
    
    const attachmentFormData = new FormData()
    attachmentFormData.append('chatGuid', chatGuid)
    attachmentFormData.append('name', file.name)  // Required field
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

    // ⚠️ DON'T save to database here - let the webhook handle it
    // The webhook will receive the sent message and save it properly
    // This prevents timeout issues

    return NextResponse.json({
      success: true,
      data: result.data,
      message: 'Attachment sent successfully'
    })
  } catch (error) {
    console.error('Error in send-attachment API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}