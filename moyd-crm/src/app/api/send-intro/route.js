import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Contact information for MO Young Democrats
const CONTACT_INFO = {
  firstName: 'Missouri',
  lastName: 'Young Democrats',
  name: 'Missouri Young Democrats',
  organization: 'Missouri Young Democrats',
  phone: '+18165300773',
  email: 'info@moyoungdemocrats.org',
  website: 'https://moyoungdemocrats.org',
  address: {
    poBox: '',
    street: '',
    city: 'Kansas City',
    state: 'Missouri',
    zip: '64101',
    country: 'United States'
  }
}

// Simple intro message - contact details are in the vCard
const INTRO_MESSAGE = `Hi! Thanks for connecting with MO Young Democrats. 

Tap the contact card below to save our info.

Reply STOP to opt out of future messages.`

export async function POST(request) {
  try {
    const { recipients } = await request.json()

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients array is required' },
        { status: 400 }
      )
    }

    console.log(`📧 Sending intro to ${recipients.length} recipient(s)`)

    const results = []
    let successCount = 0
    let failCount = 0

    // Generate vCard once (will be reused for all recipients)
    const vCardBlob = generateVCard()
    
    // Convert Blob to base64 for BlueBubbles API
    const vCardArrayBuffer = await vCardBlob.arrayBuffer()
    const vCardBase64 = Buffer.from(vCardArrayBuffer).toString('base64')

    for (const recipient of recipients) {
      try {
        const chatGuid = recipient.phone.includes(';') 
          ? recipient.phone 
          : `iMessage;-;${recipient.phone}`

        console.log(`📤 Sending intro to ${recipient.name} (${recipient.phone})`)

        // First, send the text message
        const textResponse = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              message: INTRO_MESSAGE,
              method: 'private-api',
              tempGuid: `intro_text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }),
          }
        )

        if (!textResponse.ok) {
          throw new Error('Failed to send intro message')
        }

        // Small delay between text and attachment
        await new Promise(resolve => setTimeout(resolve, 500))

        // Then, send the vCard as an attachment
        const attachmentResponse = await fetch(
          `${BB_HOST}/api/v1/message/attachment?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              attachment: vCardBase64,
              name: 'Missouri Young Democrats.vcf',
              method: 'private-api',
              tempGuid: `intro_vcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }),
          }
        )

        if (!attachmentResponse.ok) {
          throw new Error('Failed to send contact card')
        }

        console.log(`✅ Intro sent successfully to ${recipient.name}`)
        
        results.push({
          recipient: recipient.name,
          phone: recipient.phone,
          success: true
        })
        successCount++

        // Delay between recipients to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`❌ Failed to send intro to ${recipient.name}:`, error)
        results.push({
          recipient: recipient.name,
          phone: recipient.phone,
          success: false,
          error: error.message
        })
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Intro sent to ${successCount} recipient(s)${failCount > 0 ? ` (${failCount} failed)` : ''}`,
      results
    })

  } catch (error) {
    console.error('💥 Error in send-intro API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send intro' },
      { status: 500 }
    )
  }
}

function generateVCard() {
  try {
    // Read and encode logo
    const logoPath = join(process.cwd(), 'public', 'moyd-logo.png')
    let logoBase64 = ''
    
    try {
      const logoBuffer = readFileSync(logoPath)
      logoBase64 = logoBuffer.toString('base64')
      console.log('✅ Logo loaded successfully')
    } catch (logoError) {
      console.warn('⚠️ Could not load logo, continuing without it:', logoError.message)
    }

    // Build vCard content
    const vCardLines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${CONTACT_INFO.name}`,
      `N:${CONTACT_INFO.lastName};${CONTACT_INFO.firstName};;;`,
      `ORG:${CONTACT_INFO.organization}`,
      `TEL;TYPE=CELL:${CONTACT_INFO.phone}`,
      `EMAIL;TYPE=INTERNET:${CONTACT_INFO.email}`,
      `URL:${CONTACT_INFO.website}`,
      `ADR;TYPE=WORK:${CONTACT_INFO.address.poBox};${CONTACT_INFO.address.street};${CONTACT_INFO.address.city};${CONTACT_INFO.address.state};${CONTACT_INFO.address.zip};${CONTACT_INFO.address.country}`
    ]

    // Add photo if logo was loaded successfully
    if (logoBase64) {
      vCardLines.push('PHOTO;ENCODING=BASE64;TYPE=PNG:' + logoBase64)
    }

    vCardLines.push('END:VCARD')

    const vCardContent = vCardLines.join('\r\n')

    // Create Blob
    return new Blob([vCardContent], { type: 'text/vcard' })
  } catch (error) {
    console.error('Error generating vCard:', error)
    throw error
  }
}