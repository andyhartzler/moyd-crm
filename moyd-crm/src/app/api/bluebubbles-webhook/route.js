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
    const body = await request.json()
    console.log('Webhook received:', body.type, 'at', new Date().toISOString())

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
    console.error('Webhook error:', error)
    // Return 200 even on error so BlueBubbles doesn't retry
    return NextResponse.json({ 
      success: true, 
      error: error.message 
    })
  }
}

async function handleNewMessage(data) {
  try {
    const message = data
    
    console.log('📨 New message received:', {
      guid: message.guid?.substring(0, 20),
      isFromMe: message.isFromMe,
      hasAttachments: message.hasAttachments,
      associatedMessageType: message.associatedMessageType,
      text: message.text?.substring(0, 50)
    })

    // ⚠️ CRITICAL: Check if this is a REACTION first (before checking isFromMe)
    // Reactions can be from us OR from them
    if (message.associatedMessageGuid && message.associatedMessageType >= 2000) {
      console.log('🎭 Processing reaction:', {
        type: message.associatedMessageType,
        targetGuid: message.associatedMessageGuid,
        isFromMe: message.isFromMe
      })
      await handleIncomingReaction(message)
      return
    }

    // Skip regular messages if it's from us (but reactions are already handled above)
    if (message.isFromMe) {
      console.log('Skipping our own message')
      return
    }

    console.log('Processing incoming message:', message.guid?.substring(0, 20))

    // Extract phone number from chatGuid or handle
    let phone = null
    
    // Try to get from handle first
    if (message.handle?.address) {
      phone = message.handle.address
    } else if (message.chats?.[0]?.chatIdentifier) {
      // Extract from chat identifier (format: iMessage;-;+1234567890)
      const chatId = message.chats[0].chatIdentifier
      if (chatId.includes(';-;')) {
        phone = chatId.split(';-;')[1]
      } else {
        phone = chatId
      }
    }

    if (!phone) {
      console.log('No phone found in message')
      return
    }

    // Normalize phone number to E.164 format
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('1') && normalizedPhone.length === 11) {
        normalizedPhone = '+' + normalizedPhone
      } else {
        normalizedPhone = '+1' + normalizedPhone
      }
    }

    console.log('Looking for member with phone:', normalizedPhone)

    // Find the member by phone
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('phone_e164', normalizedPhone)
      .limit(1)

    if (!members || members.length === 0) {
      console.log('No member found for phone:', normalizedPhone)
      return
    }

    const memberId = members[0].id
    console.log('Found member:', memberId)

    // Find or create conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', memberId)
      .single()

    const chatGuid = message.chats?.[0]?.guid || `iMessage;-;${normalizedPhone}`

    if (!conversation) {
      console.log('Creating new conversation')
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          member_id: memberId,
          chat_identifier: chatGuid,
          status: 'Active',
          last_message_at: new Date(message.dateCreated).toISOString(),
          is_typing: false,
          typing_since: null
        })
        .select('id')
        .single()

      if (error) {
        console.error('Error creating conversation:', error)
        return
      }
      conversation = newConv
    } else {
      // Update last message time and clear typing indicator
      console.log('Updating existing conversation')
      await supabase
        .from('conversations')
        .update({ 
          last_message_at: new Date(message.dateCreated).toISOString(),
          is_typing: false,
          typing_since: null
        })
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

    // Handle attachments - construct media URL
    let mediaUrl = null
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0]
      mediaUrl = `${BB_HOST}/api/v1/attachment/${attachment.guid}/download?password=${BB_PASSWORD}`
      console.log('Message has attachment:', attachment.guid)
    }

    // Get message text - check for attachment placeholder
    let messageBody = message.text || ''
    
    // ⚠️ IMPORTANT: Handle attachment-only messages
    if (message.hasAttachments && (!messageBody || messageBody.trim() === '')) {
      messageBody = '\ufffc' // Unicode attachment character
      console.log('Set body to attachment placeholder')
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
    } else if (message.chats?.[0]?.chatIdentifier) {
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
      .single()

    if (!members) {
      console.log('Member not found for reaction')
      return
    }

    // Find conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('member_id', members.id)
      .single()

    if (!conversation) {
      console.log('Conversation not found for reaction')
      return
    }

    // Check if reaction already exists
    const { data: existingReaction } = await supabase
      .from('messages')
      .select('id')
      .eq('guid', message.guid)
      .single()

    if (existingReaction) {
      console.log('Reaction already exists:', message.guid)
      return
    }

    // Save reaction as a message with association
    const reactionData = {
      conversation_id: conversation.id,
      body: '', // Reactions don't have body text
      direction: message.isFromMe ? 'outbound' : 'inbound',
      delivery_status: 'delivered',
      sender_phone: normalizedPhone,
      guid: message.guid,
      associated_message_guid: message.associatedMessageGuid,
      associated_message_type: message.associatedMessageType,
      is_read: true,
      created_at: new Date(message.dateCreated).toISOString()
    }

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
    console.log('Updating message:', message.guid?.substring(0, 20))

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
        console.log('Message updated successfully:', message.guid?.substring(0, 20))
      }
    }
  } catch (error) {
    console.error('Error handling message update:', error)
  }
}

async function handleTypingIndicator(data) {
  try {
    console.log('Typing indicator data:', data)

    // Extract phone from chat identifier
    // Format can be: "iMessage;-;+1234567890" or just the phone
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
      console.log('Could not extract phone from typing indicator')
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

    console.log('Typing indicator for phone:', normalizedPhone)

    // Find member
    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('phone_e164', normalizedPhone)
      .single()

    if (!members) {
      console.log('Member not found for typing indicator')
      return
    }

    // The 'display' field indicates if typing (true) or stopped typing (false)
    const isTyping = data.display === true

    console.log('Setting typing status to:', isTyping)

    // Update conversation typing status
    const { error } = await supabase
      .from('conversations')
      .update({
        is_typing: isTyping,
        typing_since: isTyping ? new Date().toISOString() : null
      })
      .eq('member_id', members.id)

    if (error) {
      console.error('Error updating typing status:', error)
    } else {
      console.log('Typing status updated successfully')
    }
  } catch (error) {
    console.error('Error handling typing indicator:', error)
  }
}

async function handleReadReceipt(data) {
  try {
    const { guid } = data
    console.log('Message read:', guid?.substring(0, 20))

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
    console.log('Message delivered:', guid?.substring(0, 20))

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

async function handleSendError(data) {
  try {
    const { guid, error: errorMessage } = data
    console.log('Message send error:', guid?.substring(0, 20), errorMessage)

    // Update message status to failed
    await supabase
      .from('messages')
      .update({
        delivery_status: 'failed',
        error: errorMessage || 'Failed to send'
      })
      .eq('guid', guid)
  } catch (error) {
    console.error('Error handling send error:', error)
  }
}

async function handleGroupNameChange(data) {
  try {
    console.log('Group name changed:', data)
    // Implement if you need to track group name changes
  } catch (error) {
    console.error('Error handling group name change:', error)
  }
}

async function handleParticipantChange(data, type) {
  try {
    console.log('Participant change:', type, data)
    // Implement if you need to track participant additions/removals
  } catch (error) {
    console.error('Error handling participant change:', error)
  }
}