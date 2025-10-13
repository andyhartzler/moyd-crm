import { NextResponse } from 'next/server'

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Generate unique GUID for each message
function generateTempGuid() {
  return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { phone, message, memberId, reaction, replyToGuid, partIndex } = body

    console.log('📨 Send message request:', {
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
    console.error('❌ Error in send-message API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Send a regular message
async function sendRegularMessage(chatGuid, message, phone, memberId) {
  console.log('📤 Sending regular message via BlueBubbles Private API:', {
    host: BB_HOST,
    chatGuid,
    messageLength: message.length
  })

  const tempGuid = generateTempGuid()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatGuid: chatGuid,
          message: message,
          method: 'private-api',
          tempGuid: tempGuid
        }),
      }
    )

    clearTimeout(timeoutId)

    const result = await response.json()

    console.log('📥 BlueBubbles response:', {
      status: result.status,
      ok: response.ok,
      hasData: !!result.data
    })

    if (!response.ok || result.status !== 200) {
      console.error('❌ BlueBubbles API error:', result)
      return NextResponse.json(
        {
          error: result.error?.message || result.message || 'Failed to send message',
          details: result
        },
        { status: response.status || 500 }
      )
    }

    console.log('✅ Message sent successfully via BlueBubbles!')

    // Save to database in background (non-blocking)
    if (memberId) {
      saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound')
        .catch(err => console.error('⚠️ Background DB save error:', err))
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      tempGuid: tempGuid,
      message: 'Message sent successfully'
    })
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error.name === 'AbortError') {
      console.error('⏱️ Request timeout')
      return NextResponse.json(
        { error: 'Request timeout - BlueBubbles server may be slow or unavailable' },
        { status: 408 }
      )
    }
    
    throw error
  }
}

// Send a reply
async function sendReply(chatGuid, message, replyToGuid, phone, memberId, partIndex) {
  console.log('📤 Sending reply via BlueBubbles Private API:', {
    host: BB_HOST,
    chatGuid,
    replyToGuid,
    partIndex
  })

  const tempGuid = generateTempGuid()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatGuid: chatGuid,
          message: message,
          method: 'private-api',
          tempGuid: tempGuid,
          selectedMessageGuid: replyToGuid,
          partIndex: parseInt(partIndex) || 0
        }),
      }
    )

    clearTimeout(timeoutId)

    const result = await response.json()

    if (!response.ok || result.status !== 200) {
      console.error('❌ BlueBubbles API error:', result)
      return NextResponse.json(
        {
          error: result.error?.message || result.message || 'Failed to send reply',
          details: result
        },
        { status: response.status || 500 }
      )
    }

    console.log('✅ Reply sent successfully via BlueBubbles!')

    // Save to database in background (non-blocking)
    if (memberId) {
      saveMessageToDatabase(memberId, chatGuid, message, phone, result, 'outbound', replyToGuid)
        .catch(err => console.error('⚠️ Background DB save error:', err))
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      tempGuid: tempGuid,
      message: 'Reply sent successfully'
    })
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 408 }
      )
    }
    
    throw error
  }
}

// Send a reaction/tapback
async function sendReaction(chatGuid, messageGuid, reactionType, partIndex, phone, memberId) {
  console.log('📤 Sending reaction via BlueBubbles:', {
    chatGuid,
    messageGuid,
    reactionType
  })

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

  const response = await fetch(
    `${BB_HOST}/api/v1/message/react?password=${BB_PASSWORD}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        selectedMessageGuid: messageGuid,
        reaction: normalizedReaction,
        partIndex: parseInt(partIndex) || 0,
        method: 'private-api'
      }),
    }
  )

  const result = await response.json()

  if (!response.ok || result.status !== 200) {
    console.error('❌ BlueBubbles API error:', result)
    return NextResponse.json(
      {
        error: result.error?.message || result.message || 'Failed to send reaction',
        details: result
      },
      { status: response.status || 500 }
    )
  }

  console.log('✅ Reaction sent successfully via BlueBubbles!')

  // Save reaction to database (non-blocking)
  if (memberId) {
    saveReactionToDatabase(memberId, chatGuid, phone, result, messageGuid, reactionCode)
      .catch(err => console.error('⚠️ Background DB save error:', err))
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message: 'Reaction sent successfully'
  })
}

// ⚡ FIXED: Save message to database (matches Supabase schema)
async function saveMessageToDatabase(memberId, chatGuid, messageBody, phone, result, direction, threadOriginatorGuid = null) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    console.log('💾 Saving message to database...')

    // Try to find existing conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    let conversationId = existingConv?.id

    // If no conversation exists, create one (matching webhook pattern)
    if (!conversationId) {
      console.log('🔧 Creating new conversation for member:', memberId)
      
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          chat_identifier: chatGuid,
          // ⚡ REMOVED status field - doesn't exist in Supabase schema
          last_message: messageBody,  // Added to match webhook pattern
          last_message_at: new Date().toISOString()
        })
        .select('id')
        .maybeSingle()

      if (convError) {
        console.error('⚠️ Error creating conversation:', convError)
        // Continue to save message anyway
      } else if (newConv) {
        conversationId = newConv.id
        console.log('✅ Created new conversation:', conversationId)
      }
    } else {
      // Update existing conversation (matching webhook pattern)
      await supabase
        .from('conversations')
        .update({ 
          last_message: messageBody,
          last_message_at: new Date().toISOString() 
        })
        .eq('id', conversationId)
        .then(() => console.log('✅ Updated conversation'))
        .catch(err => console.error('⚠️ Error updating conversation:', err))
    }

    // Always try to create the message record
    const messageData = {
      body: messageBody,
      direction: direction,
      delivery_status: 'sent',
      sender_phone: phone,
      guid: result.data?.guid || `temp_${Date.now()}`,
      thread_originator_guid: threadOriginatorGuid,
      is_read: false
    }

    // Only add conversation_id if we have one
    if (conversationId) {
      messageData.conversation_id = conversationId
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert(messageData)

    if (msgError) {
      console.error('⚠️ Error creating message record:', msgError)
    } else {
      console.log('✅ Message saved to database!')
    }
  } catch (error) {
    console.error('❌ Database error (message was still sent):', error)
  }
}

// Save reaction to database
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
      console.warn('⚠️ Conversation not found for reaction')
      return
    }

    // Create reaction record
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: existingConv.id,
      body: '',
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
      console.log('✅ Reaction saved to database!')
    }
  } catch (error) {
    console.error('❌ Database error (reaction was still sent):', error)
  }
}