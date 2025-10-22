import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

export async function POST(request) {
  try {
    const { type, data } = await request.json()
    
    console.log('🔔 Webhook received:', type, 'at', new Date().toISOString())

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
      default:
        console.log('Unknown webhook type:', type)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🔥 FIXED: Create outbound messages instead of trying to update temp messages
async function handleOutboundMessageUpdate(message) {
  try {
    console.log('📤 Processing outbound message:', message.guid?.substring(0, 20))

    // Check if this message already exists in database
    const { data: existingMessage } = await supabase
      .from('messages')
      .select('id')
      .eq('guid', message.guid)
      .maybeSingle()

    if (existingMessage) {
      console.log('✅ Message already exists, skipping')
      return
    }

    // This is a new outbound message - create it just like an inbound message
    // Extract phone number from chat
    let phone = null

    if (message.handle?.address) {
      phone = message.handle.address
    } else if (message.chats && message.chats.length > 0 && message.chats[0]?.chatIdentifier) {
      const chatId = message.chats[0].chatIdentifier
      if (chatId.includes(';-;')) {
        phone = chatId.split(';-;')[1]
      } else {
        phone = chatId
      }
    }

    if (!phone) {
      console.log('Could not extract phone from outbound message')
      return
    }

    // Normalize phone
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('1') && normalizedPhone.length === 11) {
        normalizedPhone = '+' + normalizedPhone
      } else {
        normalizedPhone = '+1' + normalizedPhone
      }
    }

    console.log('Looking for member with phone:', normalizedPhone)

    // Find member
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('phone_e164', normalizedPhone)
      .maybeSingle()

    if (!members) {
      console.log('Member not found for outbound message:', normalizedPhone)
      return
    }

    // Get message text for last_message field
    let messageBody = message.text || ''

    // Handle attachment-only messages
    if (message.hasAttachments && (!messageBody || messageBody.trim() === '')) {
      messageBody = '\ufffc' // Unicode attachment character
    }

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', members.id)
      .maybeSingle()

    let conversation
    if (existingConv) {
      console.log('Updating existing conversation')
      const { data: updatedConv } = await supabase
        .from('conversations')
        .update({
          updated_at: new Date().toISOString(),
          last_message: messageBody,
          last_message_at: new Date(message.dateCreated).toISOString()
        })
        .eq('id', existingConv.id)
        .select()
        .single()

      conversation = updatedConv

    } else {
      console.log('Creating new conversation')
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          member_id: members.id,
          last_message: messageBody,
          last_message_at: new Date(message.dateCreated).toISOString()
        })
        .select()
        .single()

      conversation = newConv
    }

    if (!conversation) {
      console.log('Failed to get/create conversation')
      return
    }

    // Create the outbound message
    const messageData = {
      conversation_id: conversation.id,
      body: messageBody,
      direction: 'outbound',
      delivery_status: 'delivered',
      is_read: true,
      sender_phone: normalizedPhone,
      guid: message.guid,
      created_at: new Date(message.dateCreated).toISOString()
    }

    // Add optional fields
    if (message.associatedMessageGuid) {
      messageData.associated_message_guid = message.associatedMessageGuid
    }
    if (message.associatedMessageType !== null && message.associatedMessageType !== undefined) {
      messageData.associated_message_type = message.associatedMessageType
    }
    if (message.threadOriginatorGuid) {
      messageData.thread_originator_guid = message.threadOriginatorGuid
    }
    if (message.dateDelivered) {
      messageData.date_delivered = new Date(message.dateDelivered).toISOString()
    }
    if (message.dateRead) {
      messageData.date_read = new Date(message.dateRead).toISOString()
    }

    const { error } = await supabase
      .from('messages')
      .insert(messageData)

    if (error) {
      console.error('Error creating outbound message:', error)
    } else {
      console.log('✅ Outbound message created successfully:', message.guid?.substring(0, 20))
    }
  } catch (error) {
    console.error('Error handling outbound message:', error)
  }
}

async function handleIncomingReaction(message) {
  try {
    console.log('🎭 Processing incoming reaction:', {
      guid: message.guid,
      associatedGuid: message.associatedMessageGuid,
      type: message.associatedMessageType,
      isFromMe: message.isFromMe
    })

    // Get the phone number to find the member/conversation
    let phone = null
    
    if (message.handle?.address) {
      phone = message.handle.address
    } else if (message.chats && message.chats.length > 0 && message.chats[0]?.chatIdentifier) {
      const chatId = message.chats[0].chatIdentifier
      if (chatId.includes(';-;')) {
        phone = chatId.split(';-;')[1]
      } else {
        phone = chatId
      }
    }

    if (!phone) {
      console.log('Could not extract phone from reaction')
      return
    }

    // Normalize phone
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('1') && normalizedPhone.length === 11) {
        normalizedPhone = '+' + normalizedPhone
      } else {
        normalizedPhone = '+1' + normalizedPhone
      }
    }

    // Find member
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('phone_e164', normalizedPhone)
      .maybeSingle()

    if (!members) {
      console.log('Member not found for reaction')
      return
    }

    // Find conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', members.id)
      .maybeSingle()

    if (!conversation) {
      console.log('Conversation not found for reaction')
      return
    }

    // Clean the associated GUID (remove part index if present)
    const cleanAssociatedGuid = message.associatedMessageGuid?.split(':')[0]

    const reactionData = {
      conversation_id: conversation.id,
      body: '',
      direction: message.isFromMe ? 'outbound' : 'inbound',
      delivery_status: 'delivered',
      sender_phone: normalizedPhone,
      guid: message.guid,
      associated_message_guid: cleanAssociatedGuid,
      associated_message_type: message.associatedMessageType,
      is_read: true,
      created_at: new Date(message.dateCreated).toISOString()
    }

    console.log('💾 Saving reaction to database')

    const { error } = await supabase
      .from('messages')
      .insert(reactionData)

    if (error) {
      console.error('Error saving reaction:', error)
    } else {
      console.log('✅ Reaction saved successfully')
    }
  } catch (error) {
    console.error('Error handling incoming reaction:', error)
  }
}

async function checkOptOutOptIn(message, phone, memberId) {
  const text = message.text?.toLowerCase().trim()
  
  if (!text) return

  const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'end', 'quit']
  const optInKeywords = ['start', 'unstop', 'subscribe', 'yes', 'resume']

  if (optOutKeywords.includes(text)) {
    console.log('🛑 Opt-out detected from:', phone)
    
    await supabase
      .from('members')
      .update({ opted_out: true, opted_out_at: new Date().toISOString() })
      .eq('id', memberId)
    
    await supabase
      .from('opt_out_log')
      .insert({
        member_id: memberId,
        action: 'opt_out',
        message_text: message.text,
        timestamp: new Date().toISOString()
      })
    
    await sendOptOutConfirmation(phone)
  }

  if (optInKeywords.includes(text)) {
    console.log('✅ Opt-in detected from:', phone)
    
    await supabase
      .from('members')
      .update({ opted_out: false, opted_out_at: null })
      .eq('id', memberId)
    
    await supabase
      .from('opt_out_log')
      .insert({
        member_id: memberId,
        action: 'opt_in',
        message_text: message.text,
        timestamp: new Date().toISOString()
      })
    
    await sendOptInConfirmation(phone)
  }
}

async function sendOptOutConfirmation(phone) {
  try {
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`
    
    const confirmationMessage = `You have been unsubscribed from MO Young Democrats messages.

Reply START to resume receiving messages.`

    await fetch(`${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        message: confirmationMessage,
        method: 'private-api',
        tempGuid: `optout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }),
    })
    
    console.log('📤 Opt-out confirmation sent')
  } catch (error) {
    console.error('Error sending opt-out confirmation:', error)
  }
}

async function sendOptInConfirmation(phone) {
  try {
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`
    
    const confirmationMessage = `Welcome back! You've been re-subscribed to MO Young Democrats messages. 🎉

We're glad to have you back!`

    await fetch(`${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        message: confirmationMessage,
        method: 'private-api',
        tempGuid: `optin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }),
    })
    
    console.log('📤 Opt-in confirmation sent')
  } catch (error) {
    console.error('Error sending opt-in confirmation:', error)
  }
}

async function handleNewMessage(message) {
  try {
    console.log('📨 New message received:', message.guid?.substring(0, 20))

    // Check if it's a reaction (associatedMessageType != null)
    if (message.associatedMessageType !== null && message.associatedMessageType !== undefined) {
      return await handleIncomingReaction(message)
    }

    // 🔥 CRITICAL FIX: Check if this is OUR outbound message coming back via webhook
    if (message.isFromMe) {
      console.log('📤 This is an outbound message we sent, handling specially')
      return await handleOutboundMessageUpdate(message)
    }

    // Regular inbound message handling
    let phone = null
    
    if (message.handle?.address) {
      phone = message.handle.address
    } else if (message.chats && message.chats.length > 0 && message.chats[0]?.chatIdentifier) {
      const chatId = message.chats[0].chatIdentifier
      if (chatId.includes(';-;')) {
        phone = chatId.split(';-;')[1]
      } else {
        phone = chatId
      }
    }

    if (!phone) {
      console.log('Could not extract phone from message')
      return
    }

    // Normalize phone
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('1') && normalizedPhone.length === 11) {
        normalizedPhone = '+' + normalizedPhone
      } else {
        normalizedPhone = '+1' + normalizedPhone
      }
    }

    console.log('Looking for member with phone:', normalizedPhone)

    // Find member
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, name')
      .eq('phone_e164', normalizedPhone)
      .single()

    if (memberError || !members) {
      console.log('Member not found:', normalizedPhone)
      return
    }

    console.log('Found member:', members.id)

    // Check for opt-out/opt-in keywords BEFORE saving message
    await checkOptOutOptIn(message, normalizedPhone, members.id)

    // Get message text for last_message field
    let messageBody = message.text || ''
    
    // Handle attachment-only messages
    if (message.hasAttachments && (!messageBody || messageBody.trim() === '')) {
      messageBody = '\ufffc' // Unicode attachment character
    }

    // Find or create conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', members.id)
      .maybeSingle()

    let conversation
    if (existingConv) {
      console.log('Updating existing conversation')
      const { data: updatedConv } = await supabase
        .from('conversations')
        .update({ 
          updated_at: new Date().toISOString(),
          last_message: messageBody,
          last_message_at: new Date(message.dateCreated).toISOString()
        })
        .eq('id', existingConv.id)
        .select()
        .single()
      
      conversation = updatedConv

    } else {
      console.log('Creating new conversation')
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          member_id: members.id,
          last_message: messageBody,
          last_message_at: new Date(message.dateCreated).toISOString()
        })
        .select()
        .single()
      
      conversation = newConv
    }

    if (!conversation) {
      console.log('Failed to get/create conversation')
      return
    }

    // Create the message
    const messageData = {
      conversation_id: conversation.id,
      body: messageBody,
      direction: 'inbound',
      delivery_status: 'delivered',
      is_read: false,
      sender_phone: normalizedPhone,
      guid: message.guid,
      created_at: new Date(message.dateCreated).toISOString()
    }

    // Add optional fields if present
    if (message.associatedMessageGuid) {
      messageData.associated_message_guid = message.associatedMessageGuid
    }
    if (message.associatedMessageType) {
      messageData.associated_message_type = message.associatedMessageType
    }
    if (message.threadOriginatorGuid) {
      messageData.thread_originator_guid = message.threadOriginatorGuid
    }
    if (message.dateDelivered) {
      messageData.date_delivered = new Date(message.dateDelivered).toISOString()
    }
    if (message.dateRead) {
      messageData.date_read = new Date(message.dateRead).toISOString()
      messageData.is_read = true
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert(messageData)

    if (msgError) {
      console.error('Error creating message:', msgError)
    } else {
      console.log('Message saved successfully:', message.guid?.substring(0, 20))
    }
  } catch (error) {
    console.error('Error handling new message:', error)
  }
}

async function handleUpdatedMessage(data) {
  try {
    const message = data
    console.log('🔄 Updating message:', message.guid?.substring(0, 20))

    const updateData = {}

    // Update text if changed
    if (message.text !== undefined) {
      updateData.body = message.text
    }

    // Update delivery status
    if (message.dateDelivered) {
      updateData.delivery_status = 'delivered'
      updateData.date_delivered = new Date(message.dateDelivered).toISOString()
    }

    // Update read status
    if (message.dateRead) {
      updateData.is_read = true
      updateData.date_read = new Date(message.dateRead).toISOString()
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('messages')
        .update(updateData)
        .eq('guid', message.guid)

      if (error) {
        console.error('Error updating message:', error)
      } else {
        console.log('✅ Message updated successfully')
      }
    }
  } catch (error) {
    console.error('Error handling updated message:', error)
  }
}

async function handleTypingIndicator(data) {
  try {
    const { display, typing } = data
    
    if (!display) return

    console.log('⌨️ Typing indicator:', display, typing)

    // Extract phone number from display
    let phone = display.replace(/^iMessage;-;/, '')
    
    // Normalize phone
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('1') && normalizedPhone.length === 11) {
        normalizedPhone = '+' + normalizedPhone
      } else {
        normalizedPhone = '+1' + normalizedPhone
      }
    }

    // Find member
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('phone_e164', normalizedPhone)
      .maybeSingle()

    if (!members) {
      console.log('Member not found for typing indicator')
      return
    }

    // Update typing status
    const { error } = await supabase
      .from('members')
      .update({
        is_typing: typing,
        last_typing_at: typing ? new Date().toISOString() : null
      })
      .eq('id', members.id)

    if (error) {
      console.error('Error updating typing status:', error)
    }
  } catch (error) {
    console.error('Error handling typing indicator:', error)
  }
}