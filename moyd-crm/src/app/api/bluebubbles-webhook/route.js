import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const BB_HOST = process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST
const BB_PASSWORD = process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD

// Opt-out keywords (case insensitive)
const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'opt out', 'optout', 'opt-out', 'cancel', 'end', 'quit']

// Opt-in keywords (case insensitive)
const OPT_IN_KEYWORDS = ['start', 'yes', 'subscribe', 'opt in', 'optin', 'opt-in', 'resume', 'rejoin']

export async function POST(request) {
  try {
    const body = await request.json()
    console.log('🔔 Webhook received:', body.type, 'at', new Date().toISOString())

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

      case 'message-send-error':
        await handleSendError(data)
        break

      case 'group-name-change':
        await handleGroupNameChange(data)
        break

      case 'participant-added':
      case 'participant-removed':
        await handleParticipantChange(data, type)
        break

      default:
        console.log('Unknown webhook type:', type)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('💥 Webhook error:', error)
    // Return 200 even on error so BlueBubbles doesn't retry
    return NextResponse.json({ 
      success: true, 
      error: error.message 
    })
  }
}

// 🔥 IMPROVED: Better GUID matching and status update logic
async function findAndUpdateMessage(blueBubblesMessage) {
  try {
    const { guid, text, dateCreated } = blueBubblesMessage
    
    // Strategy 1: Try to find by exact GUID
    let { data: existingMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('guid', guid)
      .maybeSingle()

    if (existingMessage) {
      console.log('✅ Found message by exact GUID')
      return existingMessage
    }

    // Strategy 2: Find by temp GUID pattern and match by content + time
    const recentTime = new Date(Date.now() - 60000).toISOString() // Last 60 seconds
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('direction', 'outbound')
      .gte('created_at', recentTime)
      .or('guid.like.%temp%,delivery_status.eq.sending,delivery_status.eq.sent')
      .order('created_at', { ascending: false })
      .limit(20)

    if (recentMessages && recentMessages.length > 0) {
      // Try to match by body content
      const matchedMessage = recentMessages.find(m => {
        // Handle empty body for attachments
        if (!text || text === '\ufffc') {
          return m.body === text || m.body === '' || m.body === '\ufffc'
        }
        return m.body === text
      })
      
      if (matchedMessage) {
        console.log('✅ Matched message by content! Updating GUID from', matchedMessage.guid, 'to', guid)
        
        // Update the GUID to the real one
        await supabase
          .from('messages')
          .update({ guid: guid })
          .eq('id', matchedMessage.id)
        
        return { ...matchedMessage, guid: guid }
      }

      // Strategy 3: If we have a contact card intro send, match by time proximity
      if (text === '\ufffc' || !text) {
        const messageTime = new Date(dateCreated).getTime()
        const timeMatchedMessage = recentMessages.find(m => {
          const msgTime = new Date(m.created_at).getTime()
          const timeDiff = Math.abs(messageTime - msgTime)
          return timeDiff < 5000 && (m.body === '' || m.body === '\ufffc')
        })

        if (timeMatchedMessage) {
          console.log('✅ Matched attachment message by time proximity')
          await supabase
            .from('messages')
            .update({ guid: guid })
            .eq('id', timeMatchedMessage.id)
          
          return { ...timeMatchedMessage, guid: guid }
        }
      }
    }

    console.log('⚠️ Could not find existing message to update')
    return null
  } catch (error) {
    console.error('❌ Error in findAndUpdateMessage:', error)
    return null
  }
}

// Check if message is an opt-out or opt-in request
async function checkOptOutOptIn(message, normalizedPhone, memberId) {
  if (!message.text || typeof message.text !== 'string') return
  
  const messageText = message.text.trim().toLowerCase()
  
  // Check for opt-out keywords
  const isOptOut = OPT_OUT_KEYWORDS.some(keyword => {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i')
    return pattern.test(messageText) || messageText === keyword
  })
  
  // Check for opt-in keywords
  const isOptIn = OPT_IN_KEYWORDS.some(keyword => {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i')
    return pattern.test(messageText) || messageText === keyword
  })
  
  if (isOptOut) {
    console.log('🚫 Opt-out detected from:', normalizedPhone)
    
    // Update member opt_out status
    const { error: updateError } = await supabase
      .from('members')
      .update({ opt_out: true })
      .eq('id', memberId)
    
    if (updateError) {
      console.error('Error updating opt-out status:', updateError)
    } else {
      console.log('✅ Member opted out successfully')
      
      // Send confirmation message
      await sendOptOutConfirmation(normalizedPhone)
    }
  } else if (isOptIn) {
    console.log('✅ Opt-in detected from:', normalizedPhone)
    
    // Update member opt_out status
    const { error: updateError } = await supabase
      .from('members')
      .update({ opt_out: false })
      .eq('id', memberId)
    
    if (updateError) {
      console.error('Error updating opt-in status:', updateError)
    } else {
      console.log('✅ Member opted in successfully')
      
      // Send confirmation message
      await sendOptInConfirmation(normalizedPhone)
    }
  }
}

// Send opt-out confirmation
async function sendOptOutConfirmation(phone) {
  try {
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`
    
    const confirmationMessage = `You've been unsubscribed from MO Young Democrats messages. You won't receive any more messages from us.

To opt back in at any time, just reply with START or YES.`

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

// Send opt-in confirmation
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

    // 🔥 CRITICAL: Check if this is OUR outbound message coming back via webhook
    if (message.isFromMe) {
      console.log('📤 This is an outbound message we sent, updating status')
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

    console.log('Normalized phone:', normalizedPhone)

    // Find or create member
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, opt_out')
      .eq('phone_e164', normalizedPhone)
      .maybeSingle()

    if (!members) {
      console.log('Member not found, cannot process message')
      return
    }

    // Check for opt-out/opt-in keywords
    await checkOptOutOptIn(message, normalizedPhone, members.id)

    // Get or create conversation
    let conversation = null
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', members.id)
      .maybeSingle()

    const messageBody = message.text || (message.attachments && message.attachments.length > 0 ? '\ufffc' : '')

    if (existingConv) {
      console.log('Updating existing conversation')
      await supabase
        .from('conversations')
        .update({
          last_message: messageBody,
          last_message_at: new Date(message.dateCreated).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConv.id)
      
      conversation = existingConv
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

    // Construct media URL
    let mediaUrl = null
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0]
      mediaUrl = `${BB_HOST}/api/v1/attachment/${attachment.guid}/download?password=${BB_PASSWORD}`
      console.log('Message has attachment:', attachment.guid)
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
    if (mediaUrl) {
      messageData.media_url = mediaUrl
      console.log('Saved media URL to message')
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

// 🔥 IMPROVED: Handle outbound messages with better GUID matching
async function handleOutboundMessageUpdate(message) {
  try {
    console.log('📤 Processing outbound message update:', message.guid?.substring(0, 20))

    // Use improved finding logic
    const existingMessage = await findAndUpdateMessage(message)

    if (existingMessage) {
      // Update the message with delivery status
      const updateData = {
        delivery_status: 'delivered'
      }

      if (message.dateDelivered) {
        updateData.date_delivered = new Date(message.dateDelivered).toISOString()
      }

      if (message.dateRead) {
        updateData.is_read = true
        updateData.date_read = new Date(message.dateRead).toISOString()
      }

      // Add media URL if it's an attachment message
      if (message.attachments && message.attachments.length > 0 && !existingMessage.media_url) {
        const attachment = message.attachments[0]
        updateData.media_url = `${BB_HOST}/api/v1/attachment/${attachment.guid}/download?password=${BB_PASSWORD}`
      }

      const { error } = await supabase
        .from('messages')
        .update(updateData)
        .eq('id', existingMessage.id)

      if (error) {
        console.error('Error updating outbound message:', error)
      } else {
        console.log('✅ Outbound message status updated successfully')
      }
    } else {
      console.log('⚠️ Could not find existing message to update - creating new record')
      
      // If we can't find it, treat it as a new outbound message
      // This might happen if the send API didn't save to DB properly
      // We should still record it
      let phone = null
      if (message.chats && message.chats.length > 0) {
        const chatId = message.chats[0].chatIdentifier
        phone = chatId.includes(';-;') ? chatId.split(';-;')[1] : chatId
      }

      if (phone) {
        let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = normalizedPhone.startsWith('1') && normalizedPhone.length === 11 
            ? '+' + normalizedPhone 
            : '+1' + normalizedPhone
        }

        const { data: member } = await supabase
          .from('members')
          .select('id')
          .eq('phone_e164', normalizedPhone)
          .maybeSingle()

        if (member) {
          const { data: conversation } = await supabase
            .from('conversations')
            .select('id')
            .eq('member_id', member.id)
            .maybeSingle()

          if (conversation) {
            await supabase
              .from('messages')
              .insert({
                conversation_id: conversation.id,
                body: message.text || '',
                direction: 'outbound',
                delivery_status: 'delivered',
                sender_phone: normalizedPhone,
                guid: message.guid,
                is_read: true,
                created_at: new Date(message.dateCreated).toISOString(),
                date_delivered: message.dateDelivered ? new Date(message.dateDelivered).toISOString() : null
              })
            console.log('✅ Created new outbound message record')
          }
        }
      }
    }
  } catch (error) {
    console.error('Error handling outbound message update:', error)
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
      console.log('No phone found in reaction')
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

    // Check if reaction already exists
    const { data: existingReaction } = await supabase
      .from('messages')
      .select('id')
      .eq('guid', message.guid)
      .maybeSingle()

    if (existingReaction) {
      console.log('Reaction already exists:', message.guid)
      return
    }

    // Strip partIndex from associatedMessageGuid if present
    let cleanAssociatedGuid = message.associatedMessageGuid
    if (cleanAssociatedGuid && cleanAssociatedGuid.startsWith('p:')) {
      const parts = cleanAssociatedGuid.split('/')
      if (parts.length > 1) {
        cleanAssociatedGuid = parts.slice(1).join('/')
        console.log('🔧 Cleaned GUID from', message.associatedMessageGuid, 'to', cleanAssociatedGuid)
      }
    }

    // Ensure we have a numeric reaction type
    if (typeof message.associatedMessageType !== 'number') {
      console.error('❌ Reaction type is not numeric:', message.associatedMessageType)
      return
    }

    // Save reaction as a message with association
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

    console.log('💾 Saving reaction to database:', {
      guid: reactionData.guid,
      associated_guid: reactionData.associated_message_guid,
      type: reactionData.associated_message_type
    })

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
    } else if (message.isRead !== undefined) {
      updateData.is_read = message.isRead
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('messages')
        .update(updateData)
        .eq('guid', message.guid)

      if (error) {
        console.error('Error updating message:', error)
      } else {
        console.log('✅ Message updated successfully:', message.guid?.substring(0, 20))
      }
    }
  } catch (error) {
    console.error('Error handling message update:', error)
  }
}

async function handleTypingIndicator(data) {
  try {
    console.log('⌨️ Typing indicator data:', data)

    // Extract phone from chat identifier
    let phone = null
    
    if (data.chat) {
      if (data.chat.includes(';-;')) {
        phone = data.chat.split(';-;')[1]
      } else {
        phone = data.chat
      }
    } else if (data.chatGuid) {
      if (data.chatGuid.includes(';-;')) {
        phone = data.chatGuid.split(';-;')[1]
      } else {
        phone = data.chatGuid
      }
    }

    if (!phone) {
      console.log('No phone found in typing indicator')
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
      console.log('Member not found for typing indicator')
      return
    }

    // Update typing status
    const isTyping = data.display === true || data.typing === true

    const { error } = await supabase
      .from('members')
      .update({ 
        is_typing: isTyping,
        last_typing_at: isTyping ? new Date().toISOString() : null
      })
      .eq('id', members.id)

    if (error) {
      console.error('Error updating typing status:', error)
    } else {
      console.log('✅ Typing status updated successfully')
    }
  } catch (error) {
    console.error('Error handling typing indicator:', error)
  }
}

async function handleReadReceipt(data) {
  try {
    const { guid } = data
    console.log('👁️ Message read:', guid?.substring(0, 20))

    // Update message as read
    const { error } = await supabase
      .from('messages')
      .update({
        is_read: true,
        date_read: new Date().toISOString()
      })
      .eq('guid', guid)

    if (error) {
      console.error('Error handling read receipt:', error)
    } else {
      console.log('✅ Read receipt processed')
    }
  } catch (error) {
    console.error('Error handling read receipt:', error)
  }
}

async function handleMessageDelivered(data) {
  try {
    const { guid } = data
    console.log('✅ Message delivered:', guid?.substring(0, 20))

    // Update message delivery status
    const { error } = await supabase
      .from('messages')
      .update({
        delivery_status: 'delivered',
        date_delivered: new Date().toISOString()
      })
      .eq('guid', guid)

    if (error) {
      console.error('Error handling delivery receipt:', error)
    } else {
      console.log('✅ Delivery status updated')
    }
  } catch (error) {
    console.error('Error handling delivery receipt:', error)
  }
}

async function handleSendError(data) {
  try {
    const { guid, error: errorMessage } = data
    console.log('❌ Message send error:', guid?.substring(0, 20), errorMessage)

    // Update message status to failed
    const { error } = await supabase
      .from('messages')
      .update({
        delivery_status: 'failed',
        error: errorMessage || 'Failed to send'
      })
      .eq('guid', guid)

    if (error) {
      console.error('Error handling send error:', error)
    } else {
      console.log('✅ Error status updated')
    }
  } catch (error) {
    console.error('Error handling send error:', error)
  }
}

async function handleGroupNameChange(data) {
  try {
    console.log('📝 Group name changed:', data)
    // Implement if you need to track group name changes
  } catch (error) {
    console.error('Error handling group name change:', error)
  }
}

async function handleParticipantChange(data, type) {
  try {
    console.log('👥 Participant change:', type, data)
    // Implement if you need to track participant additions/removals
  } catch (error) {
    console.error('Error handling participant change:', error)
  }
}