import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const body = await request.json()
    console.log('Webhook received:', body)

    const { type, data } = body

    switch (type) {
      case 'new-message':
        await handleNewMessage(data)
        break
      
      case 'updated-message':
        await handleUpdatedMessage(data)
        break
      
      case 'typing-indicator':
        await handleTypingIndicator(data)
        break
      
      case 'read-receipt':
        await handleReadReceipt(data)
        break
      
      case 'message-delivered':
        await handleMessageDelivered(data)
        break

      default:
        console.log('Unknown webhook type:', type)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

async function handleNewMessage(data) {
  try {
    const message = data
    
    // Skip if it's from us
    if (message.isFromMe) {
      console.log('Skipping our own message')
      return
    }

    console.log('Processing incoming message:', message.guid)

    // Extract phone number from chatGuid (format: iMessage;-;+1234567890)
    const chatGuid = message.chats?.[0]?.chatIdentifier || ''
    const phone = chatGuid.split(';-;')[1] || chatGuid

    // Find the member by phone
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('phone_e164', phone)
      .limit(1)

    if (!members || members.length === 0) {
      console.log('No member found for phone:', phone)
      return
    }

    const memberId = members[0].id

    // Find or create conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .single()

    if (!conversation) {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          chat_identifier: chatGuid,
          status: 'active',
          last_message_at: new Date(message.dateCreated).toISOString()
        })
        .select('id')
        .single()

      if (error) {
        console.error('Error creating conversation:', error)
        return
      }
      conversation = newConv
    } else {
      // Update last message time
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(message.dateCreated).toISOString() })
        .eq('id', conversation.id)
    }

    // Check if message already exists
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('guid', message.guid)
      .single()

    if (existing) {
      console.log('Message already exists:', message.guid)
      return
    }

    // Determine if it's a reaction
    const isReaction = message.associatedMessageGuid !== null

    // Create the message
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        body: message.text || '',
        direction: 'inbound',
        delivery_status: 'delivered',
        is_read: false,
        sender_phone: phone,
        guid: message.guid,
        associated_message_guid: message.associatedMessageGuid,
        associated_message_type: message.associatedMessageType,
        thread_originator_guid: message.threadOriginatorGuid,
        created_at: new Date(message.dateCreated).toISOString()
      })

    if (msgError) {
      console.error('Error creating message:', msgError)
    } else {
      console.log('Message saved successfully:', message.guid)
    }
  } catch (error) {
    console.error('Error handling new message:', error)
  }
}

async function handleUpdatedMessage(data) {
  try {
    const message = data
    console.log('Updating message:', message.guid)

    // Update the message in the database
    const { error } = await supabase
      .from('messages')
      .update({
        body: message.text || '',
        delivery_status: message.dateDelivered ? 'delivered' : 'sent',
        is_read: message.dateRead !== null,
        date_delivered: message.dateDelivered ? new Date(message.dateDelivered).toISOString() : null,
        date_read: message.dateRead ? new Date(message.dateRead).toISOString() : null
      })
      .eq('guid', message.guid)

    if (error) {
      console.error('Error updating message:', error)
    } else {
      console.log('Message updated successfully:', message.guid)
    }
  } catch (error) {
    console.error('Error handling message update:', error)
  }
}

async function handleTypingIndicator(data) {
  // Store typing status in a real-time table or use Supabase Realtime
  console.log('Typing indicator:', data)
  
  // You could update a typing_indicators table here
  // Or broadcast via Supabase Realtime
}

async function handleReadReceipt(data) {
  try {
    const { guid } = data
    console.log('Message read:', guid)

    // Update message as read
    await supabase
      .from('messages')
      .update({
        is_read: true,
        date_read: new Date().toISOString()
      })
      .eq('guid', guid)
  } catch (error) {
    console.error('Error handling read receipt:', error)
  }
}

async function handleMessageDelivered(data) {
  try {
    const { guid } = data
    console.log('Message delivered:', guid)

    // Update message delivery status
    await supabase
      .from('messages')
      .update({
        delivery_status: 'delivered',
        date_delivered: new Date().toISOString()
      })
      .eq('guid', guid)
  } catch (error) {
    console.error('Error handling delivery receipt:', error)
  }
}