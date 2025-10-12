import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

export async function POST(request) {
  try {
    const body = await request.json()
    const { phone, message, memberId, reaction, replyToGuid, partIndex } = body

    console.log('Send message request:', {
      phone,
      hasMessage: !!message,
      hasReaction: !!reaction,
      hasReply: !!replyToGuid,
      memberId,
      timestamp: new Date().toISOString()
    })

    // Validate required fields
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone is required' },
        { status: 400 }
      )
    }

    // For reactions, we don't need message text
    // For regular messages, we do
    if (!reaction && !message) {
      return NextResponse.json(
        { error: 'Message or reaction is required' },
        { status: 400 }
      )
    }

    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    // Handle reactions differently from regular messages
    if (reaction) {
      return await sendReaction(chatGuid, replyToGuid, reaction, partIndex || 0, phone, memberId)
    } else if (replyToGuid) {
      return await sendReply(chatGuid, message, replyToGuid, phone, memberId, partIndex || 0)
    } else {
      return await sendRegularMessage(chatGuid, message, phone, memberId)
    }
  } catch (error) {
    console.error('Error in send-message API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Send a regular message
async function sendRegularMessage(chatGuid, message, phone, memberId) {
  console.log('Sending regular message via BlueBubbles:', {
    host: BB_HOST,
    chatGuid,
    messageLength: message.length
  })

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
    console.error('BlueBubbles API error:', result)
    return NextResponse.json(
      {
        error: result.error?.message || result.message || 'Failed to send message',
        details: result
      },
      { status: response.status || 500 }
    )
  }

  console.log('Message sent successfully via BlueBubbles')

  // Save to database
  if (memberId) {
    await saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound')
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message: 'Message sent successfully'
  })
}

// Send a reply to a specific message
async function sendReply(chatGuid, message, replyToGuid, phone, memberId, partIndex) {
  console.log('Sending reply via BlueBubbles:', {
    host: BB_HOST,
    chatGuid,
    replyToGuid,
    partIndex,
    messageLength: message.length
  })

  // Send the reply with selectedMessageGuid and partIndex
  const response = await fetch(
    `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        message: message,
        method: 'private-api',
        selectedMessageGuid: replyToGuid,
        partIndex: parseInt(partIndex) || 0
      }),
    }
  )

  const result = await response.json()

  if (!response.ok || result.status !== 200) {
    console.error('BlueBubbles API error:', result)
    return NextResponse.json(
      {
        error: result.error?.message || result.message || 'Failed to send reply',
        details: result
      },
      { status: response.status || 500 }
    )
  }

  console.log('Reply sent successfully via BlueBubbles')

  // Save to database with thread info
  if (memberId) {
    await saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound', replyToGuid)
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message: 'Reply sent successfully'
  })
}

// Send a reaction/tapback
async function sendReaction(chatGuid, messageGuid, reactionType, partIndex, phone, memberId) {
  console.log('Sending reaction via BlueBubbles:', {
    host: BB_HOST,
    chatGuid,
    messageGuid,
    reactionType,
    partIndex
  })

  // Validate reaction type
  const validReactions = [
    'love', 'like', 'dislike', 'laugh', 'emphasize', 'question',
    '-love', '-like', '-dislike', '-laugh', '-emphasize', '-question'
  ]

  const normalizedReaction = reactionType.toLowerCase()
  
  if (!validReactions.includes(normalizedReaction)) {
    return NextResponse.json(
      { error: `Invalid reaction type: ${reactionType}. Must be one of: ${validReactions.join(', ')}` },
      { status: 400 }
    )
  }

  // Map reaction names to codes (for database storage)
  const reactionMap = {
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

  const reactionCode = reactionMap[normalizedReaction]

  // Send to BlueBubbles - use string reaction type, not code
  const reactionPayload = {
    chatGuid: chatGuid,
    selectedMessageGuid: messageGuid,
    reaction: normalizedReaction,
    partIndex: parseInt(partIndex) || 0,
    method: 'private-api'
  }

  console.log('Reaction payload:', reactionPayload)

  const response = await fetch(
    `${BB_HOST}/api/v1/message/react?password=${BB_PASSWORD}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reactionPayload),
    }
  )

  const result = await response.json()

  console.log('BlueBubbles reaction response:', {
    status: response.status,
    ok: response.ok,
    result: result
  })

  if (!response.ok || result.status !== 200) {
    console.error('BlueBubbles API error:', result)
    return NextResponse.json(
      {
        error: result.error?.message || result.message || 'Failed to send reaction',
        details: result
      },
      { status: response.status || 500 }
    )
  }

  console.log('Reaction sent successfully via BlueBubbles')

  // Save reaction to database
  if (memberId) {
    await saveReactionToDatabase(memberId, chatGuid, phone, result, messageGuid, reactionCode)
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message: 'Reaction sent successfully'
  })
}

// Helper function to save message to database
async function saveMessageToDatabase(memberId, chatGuid, messageBody, phone, result, direction, threadOriginatorGuid = null) {
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

    // Create message record
    if (conversationId) {
      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        body: messageBody,
        direction: direction,
        delivery_status: 'sent',
        sender_phone: phone,
        guid: result.data?.guid || `temp_${Date.now()}`,
        thread_originator_guid: threadOriginatorGuid,
        is_read: false
      })

      if (msgError) {
        console.error('Error creating message record:', msgError)
      } else {
        console.log('Message saved to database')
      }
    }
  } catch (error) {
    console.error('Database error:', error)
  }
}

// Helper function to save reaction to database
async function saveReactionToDatabase(memberId, chatGuid, phone, result, associatedMessageGuid, associatedMessageType) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // Find conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .single()

    if (!existingConv) {
      console.error('Conversation not found')
      return
    }

    // Create reaction record (stored as a message with association)
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: existingConv.id,
      body: '', // Reactions don't have body text
      direction: 'outbound',
      delivery_status: 'sent',
      sender_phone: phone,
      guid: result.data?.guid || `temp_${Date.now()}`,
      associated_message_guid: associatedMessageGuid,
      associated_message_type: associatedMessageType,
      is_read: false
    })

    if (msgError) {
      console.error('Error creating reaction record:', msgError)
    } else {
      console.log('Reaction saved to database')
    }
  } catch (error) {
    console.error('Database error:', error)
  }
}