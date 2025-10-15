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

    // 🔥 CRITICAL FIX: Check if this is OUR outbound message coming back via webhook
    // BlueBubbles sends back messages WE send via the API
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

    // 🔥 CRITICAL FIX: Build attachments array properly
    let attachments = []
    if (message.attachments && message.attachments.length > 0) {
      attachments = message.attachments.map(att => ({
        guid: att.guid,
        transfer_name: att.transferName,
        mime_type: att.mimeType,
        total_bytes: att.totalBytes
      }))
      console.log('Message has', attachments.length, 'attachment(s)')
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
    if (attachments.length > 0) {
      messageData.attachments = attachments
      console.log('Saved', attachments.length, 'attachments to message')
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

// 🔥 CRITICAL FIX: Improved outbound message matching with attachment support
async function handleOutboundMessageUpdate(message) {
  try {
    console.log('📤 Processing outbound message update:', message.guid?.substring(0, 20))
    console.log('Message details:', {
      text: message.text?.substring(0, 50),
      hasAttachments: message.hasAttachments,
      attachmentCount: message.attachments?.length || 0
    })

    // Try to find the message by GUID first
    let { data: existingMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('guid', message.guid)
      .maybeSingle()

    // If not found by real GUID, try to find by tempGuid pattern
    if (!existingMessage) {
      console.log('🔍 Message not found by GUID, checking for recent temp messages')
      
      // Find messages from last 60 seconds with temp GUIDs
      const recentTime = new Date(Date.now() - 60000).toISOString()
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('direction', 'outbound')
        .gte('created_at', recentTime)
        .like('guid', '%temp%')
        .order('created_at', { ascending: false })
        .limit(20)

      console.log(`Found ${recentMessages?.length || 0} recent temp messages`)

      if (recentMessages && recentMessages.length > 0) {
        // Strategy 1: Match by body content (for text messages)
        if (message.text && message.text.trim()) {
          existingMessage = recentMessages.find(m => m.body === message.text)
          if (existingMessage) {
            console.log('✅ Matched message by text content')
          }
        }

        // Strategy 2: Match by attachment characteristics (for attachment messages)
        if (!existingMessage && message.hasAttachments && message.attachments?.length > 0) {
          // Look for intro messages (they have specific text pattern)
          const isIntroMessage = message.text?.includes('Thanks for connecting with MO Young Democrats')
          
          if (isIntroMessage) {
            // Match intro messages by the intro text pattern
            existingMessage = recentMessages.find(m => 
              m.guid.includes('temp-intro') && 
              m.body?.includes('Thanks for connecting with MO Young Democrats')
            )
            if (existingMessage) {
              console.log('✅ Matched INTRO message by text pattern')
            }
          } else {
            // Match other attachment messages by timing (most recent attachment message)
            existingMessage = recentMessages.find(m => 
              m.guid.includes('temp_attachment') || 
              (m.body === '' || m.body === null)
            )
            if (existingMessage) {
              console.log('✅ Matched ATTACHMENT message by pattern')
            }
          }
        }

        // Strategy 3: If still not found, match by timing (most recent message)
        if (!existingMessage && recentMessages.length > 0) {
          existingMessage = recentMessages[0]
          console.log('⚠️ Matched message by timing (most recent)')
        }
        
        if (existingMessage) {
          console.log('🔧 Updating GUID from', existingMessage.guid, 'to', message.guid)
          
          // Update the GUID to the real one
          await supabase
            .from('messages')
            .update({ guid: message.guid })
            .eq('id', existingMessage.id)
        }
      }
    }

    // Now update the message with delivery status AND attachments
    if (existingMessage) {
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

      // 🔥 CRITICAL FIX: Add attachments data if present
      if (message.hasAttachments && message.attachments && message.attachments.length > 0) {
        updateData.attachments = message.attachments.map(att => ({
          guid: att.guid,
          transfer_name: att.transferName,
          mime_type: att.mimeType,
          total_bytes: att.totalBytes
        }))
        console.log('📎 Adding', updateData.attachments.length, 'attachment(s) to message')
      }

      const { error } = await supabase
        .from('messages')
        .update(updateData)
        .eq('id', existingMessage.id)

      if (error) {
        console.error('Error updating outbound message:', error)
      } else {
        console.log('✅ Outbound message updated successfully with attachments')
      }
    } else {
      console.log('⚠️ Could not find existing message to update')
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