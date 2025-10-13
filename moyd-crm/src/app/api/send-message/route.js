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

  // ⚡ CRITICAL FIX: Send via private-api FIRST - this works even without existing chat
  const response = await fetch(
    `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        message: message,
        method: 'private-api', // This enables sending to new numbers
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

  console.log('✅ Message sent successfully via BlueBubbles')

  // THEN save to database in background (non-blocking pattern from Airtable)
  // We don't await this so the response returns immediately
  if (memberId) {
    saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound')
      .catch(err => console.error('Background DB save error:', err))
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

  console.log('✅ Reply sent successfully via BlueBubbles')

  // Save to database with thread info (non-blocking)
  if (memberId) {
    saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound', replyToGuid)
      .catch(err => console.error('Background DB save error:', err))
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
      { error: `Invalid reaction type: ${reactionType}. Valid types are: ${validReactions.join(', ')}` },
      { status: 400 }
    )
  }

  // Send reaction using private-api method
  const response = await fetch(
    `${BB_HOST}/api/v1/message/react?password=${BB_PASSWORD}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        selectedMessageGuid: messageGuid,
        partIndex: parseInt(partIndex) || 0,
        reaction: normalizedReaction
      }),
    }
  )

  const result = await response.json()

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

  console.log('✅ Reaction sent successfully via BlueBubbles')

  // Save reaction to database (non-blocking)
  if (memberId) {
    // Get the reaction type code for database
    const reactionCode = getReactionCode(normalizedReaction)
    saveReactionToDatabase(memberId, chatGuid, phone, result, messageGuid, reactionCode)
      .catch(err => console.error('Background DB save error:', err))
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message: 'Reaction sent successfully'
  })
}

// Helper to get reaction code
function getReactionCode(reactionType) {
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
  return reactionMap[reactionType.toLowerCase()] || 2000
}

// ⚡ CRITICAL FIX: Improved database save function following Airtable pattern
// - More resilient conversation creation
// - Always tries to save the message even if conversation creation has issues
// - Non-blocking execution (called without await)
async function saveMessageToDatabase(memberId, chatGuid, messageBody, phone, result, direction, threadOriginatorGuid = null) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // Try to find existing conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle() // Use maybeSingle instead of single to avoid errors

    let conversationId = existingConv?.id

    // If no conversation exists, try to create one
    if (!conversationId) {
      console.log('No existing conversation, creating new one for member:', memberId)
      
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          chat_identifier: chatGuid,
          status: 'Active',
          last_message_at: new Date().toISOString()
        })
        .select('id')
        .maybeSingle()

      if (convError) {
        console.error('⚠️ Error creating conversation (will retry):', convError)
        // Don't return early - we'll try to save the message anyway below
        // The webhook will eventually create the conversation when a reply comes in
      } else if (newConv) {
        conversationId = newConv.id
        console.log('✅ Created new conversation:', conversationId)
      }
    } else {
      // Update existing conversation timestamp
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(() => console.log('✅ Updated conversation timestamp'))
        .catch(err => console.error('Error updating conversation:', err))
    }

    // ⚡ CRITICAL: Always try to create the message record, even if we don't have a conversation yet
    // This ensures the message is tracked even if there are temporary database issues
    const messageData = {
      body: messageBody,
      direction: direction,
      delivery_status: 'sent',
      sender_phone: phone,
      guid: result.data?.guid || `temp_${Date.now()}`,
      thread_originator_guid: threadOriginatorGuid,
      is_read: false
    }

    // Add conversation_id if we have one, but don't fail if we don't
    if (conversationId) {
      messageData.conversation_id = conversationId
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert(messageData)

    if (msgError) {
      console.error('⚠️ Error creating message record:', msgError)
      // Log but don't throw - the message was already sent via BlueBubbles
    } else {
      console.log('✅ Message saved to database')
    }
  } catch (error) {
    console.error('❌ Database error (message was still sent):', error)
    // Don't throw - the message was already sent successfully via BlueBubbles
  }
}

// Helper function to save reaction to database (non-blocking)
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
      .maybeSingle()

    if (!existingConv) {
      console.warn('⚠️ Conversation not found for reaction, will be created when reply comes in')
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
      console.error('⚠️ Error creating reaction record:', msgError)
    } else {
      console.log('✅ Reaction saved to database')
    }
  } catch (error) {
    console.error('❌ Database error (reaction was still sent):', error)
  }
}