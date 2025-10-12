import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const phone = formData.get('phone')
    const memberId = formData.get('memberId')
    const message = formData.get('message') // Optional caption
    const replyToGuid = formData.get('replyToGuid') // Optional reply
    const partIndex = formData.get('partIndex') || '0'

    if (!file || !phone || !memberId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log('Sending attachment:', {
      fileName: file.name,
      fileSize: file.size,
      phone
    })

    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`
    
    // Prepare BlueBubbles FormData
    const bbFormData = new FormData()
    bbFormData.append('chatGuid', chatGuid)
    bbFormData.append('attachment', file)
    bbFormData.append('name', file.name)
    bbFormData.append('method', 'private-api')
    
    if (message) {
      bbFormData.append('message', message)
    }

    if (replyToGuid) {
      bbFormData.append('selectedMessageGuid', replyToGuid)
      bbFormData.append('partIndex', partIndex)
    }

    const tempGuid = `temp-${Date.now()}`
    bbFormData.append('tempGuid', tempGuid)

    // Send to BlueBubbles
    const bbResponse = await fetch(
      `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        body: bbFormData,
      }
    )

    if (!bbResponse.ok) {
      const errorData = await bbResponse.json()
      console.error('BlueBubbles error:', errorData)
      throw new Error(errorData.message || 'Upload failed')
    }

    const bbData = await bbResponse.json()
    console.log('Attachment sent successfully')

    return NextResponse.json({
      success: true,
      guid: bbData.data?.guid || tempGuid,
    })
  } catch (error) {
    console.error('Error sending attachment:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}