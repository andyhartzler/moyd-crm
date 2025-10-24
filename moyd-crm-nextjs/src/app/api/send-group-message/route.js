import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Spam prevention settings
const MESSAGES_PER_MINUTE = 10 // Max messages per minute to avoid carrier spam flags
const DELAY_BETWEEN_MESSAGES = Math.ceil(60000 / MESSAGES_PER_MINUTE) // ~6 seconds between messages
const BATCH_SIZE = 5 // Send in small batches
const DELAY_BETWEEN_BATCHES = 30000 // 30 second delay between batches

export async function POST(request) {
  try {
    const body = await request.json()
    const { message, recipients } = body

    console.log('📬 Group message request:', {
      messageLength: message?.length,
      recipientCount: recipients?.length,
      timestamp: new Date().toISOString()
    })

    // Validate required fields
    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients are required' },
        { status: 400 }
      )
    }

    // Validate recipients have required fields
    const validRecipients = recipients.filter(r => r.id && r.name && r.phone)
    if (validRecipients.length === 0) {
      return NextResponse.json(
        { error: 'No valid recipients found' },
        { status: 400 }
      )
    }

    console.log(`📤 Preparing to send to ${validRecipients.length} recipients with spam prevention`)

    const progress = {
      sent: 0,
      total: validRecipients.length,
      failed: []
    }

    const threads = []

    // Send messages with delays to prevent spam filtering
    for (let i = 0; i < validRecipients.length; i++) {
      const recipient = validRecipients[i]
      
      try {
        // Prepare chat GUID
        const chatGuid = recipient.phone.includes(';') 
          ? recipient.phone 
          : `iMessage;-;${recipient.phone}`

        console.log(`📨 Sending to ${recipient.name} (${i + 1}/${validRecipients.length})`)

        // Send message via BlueBubbles
        const response = await fetch(
          `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatGuid: chatGuid,
              message: message,
              method: 'private-api',
            }),
          }
        )

        const result = await response.json()

        if (!response.ok || result.status !== 200) {
          console.error(`❌ Failed to send to ${recipient.name}:`, result)
          progress.failed.push({
            name: recipient.name,
            phone: recipient.phone,
            error: result.error?.message || result.message || 'Unknown error'
          })
        } else {
          console.log(`✅ Sent to ${recipient.name}`)
          progress.sent++
          
          // Add to threads for easy access
          threads.push({
            memberId: recipient.id,
            name: recipient.name,
            phone: recipient.phone
          })
        }

        // Implement smart delays to avoid spam detection
        if (i < validRecipients.length - 1) {
          // Check if we need a batch delay
          if ((i + 1) % BATCH_SIZE === 0) {
            console.log(`⏸️  Batch complete. Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`)
            await sleep(DELAY_BETWEEN_BATCHES)
          } else {
            // Regular delay between messages
            console.log(`⏸️  Waiting ${DELAY_BETWEEN_MESSAGES / 1000}s before next message...`)
            await sleep(DELAY_BETWEEN_MESSAGES)
          }
        }

      } catch (error) {
        console.error(`❌ Error sending to ${recipient.name}:`, error)
        progress.failed.push({
          name: recipient.name,
          phone: recipient.phone,
          error: error.message || 'Failed to send'
        })
      }
    }

    console.log('✅ Group message complete:', progress)

    return NextResponse.json({
      success: true,
      progress: progress,
      threads: threads,
      message: `Successfully sent ${progress.sent} of ${progress.total} messages`
    })

  } catch (error) {
    console.error('❌ Error in send-group-message API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}