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

    // 🔥 DETAILED LOGGING for attachment debugging
    if (data && data.message) {
      const msg = data.message
      console.log('📋 Webhook message details:', {
        guid: msg.guid?.substring(0, 30),
        text: msg.text?.substring(0, 50) || '(empty)',
        isFromMe: msg.isFromMe,
        hasAttachments: msg.hasAttachments,
        attachmentCount: msg.attachments?.length || 0,
        attachments: msg.attachments?.map(a => ({
          guid: a.guid?.substring(0, 30),
          mimeType: a.mimeType,
          transferName: a.transferName,
          totalBytes: a.totalBytes
        }))
      })
    }

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

// 🔥 IMPROVED: Better outbound message matching logic
async function handleOutboundMessageUpdate(message) {
  try {
    console.log('📤 Processing outbound message update:', message.guid?.substring(0, 20))
    const hasAttachments = message.hasAttachments && message.attachments?.length > 0
    const hasText = message.text && message.text.trim().length > 0

    console.log('Message details:', {
      text: message.text?.substring(0, 50) || '(empty)',
      hasText,
      hasAttachments,
      attachmentCount: message.attachments?.length || 0,
      attachments: message.attachments?.map(a => ({ guid: a.guid, mimeType: a.mimeType, transferName: a.transferName }))
    })

    // Try to find the message by GUID first
    let { data: existingMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('guid', message.guid)
      .maybeSingle()

    // If not found by real GUID, try to find by matching temp message
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
        // 🔥 IMPROVED MATCHING LOGIC
        
        // Strategy 1: Match attachment-only messages (empty, \ufffc body, or emoji prefixes)
        if (hasAttachments && !hasText) {
          console.log('🔍 Looking for temp attachment message (empty/attachment body/emoji prefix)...')

          // Find temp messages with empty body, attachment character, or emoji prefixes
          existingMessage = recentMessages.find(m =>
            ((!m.body || m.body.trim() === '' || m.body === '\ufffc' || m.body?.startsWith('📷 ') || m.body?.startsWith('📎 ')) &&
            (m.guid.includes('temp-intro-vcard') || m.guid.includes('temp_attachment')))
          )

          if (existingMessage) {
            console.log('✅ Matched ATTACHMENT message by body pattern:', existingMessage.body)
          }
        }
        
        // Strategy 2: Match text messages by exact content
        if (!existingMessage && hasText) {
          console.log('🔍 Looking for temp text message by content...')
          
          // Match by exact text content
          existingMessage = recentMessages.find(m => 
            m.body && m.body.trim() === message.text.trim()
          )
          
          if (existingMessage) {
            console.log('✅ Matched TEXT message by exact content')
          }
        }
        
        // Strategy 3: Match by GUID pattern (intro-text vs intro-vcard)
        if (!existingMessage) {
          console.log('🔍 Looking for temp message by GUID pattern...')

          if (hasAttachments && !hasText) {
            // Look for vcard temp messages OR attachment placeholders
            existingMessage = recentMessages.find(m =>
              m.guid.includes('temp-intro-vcard') ||
              m.guid.includes('temp_attachment') ||
              (m.guid.includes('temp') && (!m.body || m.body.trim() === '' || m.body === '\ufffc' || m.body?.startsWith('📷 ') || m.body?.startsWith('📎 ')))
            )
            if (existingMessage) {
              console.log('✅ Matched by vcard/attachment GUID pattern:', existingMessage.body)
            }
          } else if (hasText) {
            // Look for text temp messages (avoid matching ones with empty body)
            existingMessage = recentMessages.find(m => 
              m.guid.includes('temp-intro-text') ||
              (m.guid.includes('temp') && m.body && m.body.trim().length > 0 && m.body !== '\ufffc')
            )
            if (existingMessage) {
              console.log('✅ Matched by text GUID pattern')
            }
          }
        }

        // Strategy 4: Last resort - match by timing and type
        if (!existingMessage && recentMessages.length > 0) {
          console.log('⚠️ Using timing match as last resort')
          
          // Filter to messages that match the type (text vs attachment)
          const matchingTypeMessages = recentMessages.filter(m => {
            if (hasAttachments && !hasText) {
              // Incoming is attachment-only, match to empty/\ufffc body messages
              return !m.body || m.body.trim() === '' || m.body === '\ufffc'
            } else if (hasText) {
              // Incoming has text, match to non-empty body messages  
              return m.body && m.body.trim().length > 0 && m.body !== '\ufffc'
            }
            return true
          })
          
          if (matchingTypeMessages.length > 0) {
            existingMessage = matchingTypeMessages[0]
            console.log('⚠️ Matched message by timing (most recent of matching type)')
          }
        }

        // Update the GUID if we found a match
        if (existingMessage) {
          console.log('🔧 Updating GUID from', existingMessage.guid, 'to', message.guid)
          
          await supabase
            .from('messages')
            .update({ guid: message.guid })
            .eq('id', existingMessage.id)
        }
      }
    }

    // Now update the message with delivery status
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

      // 🔥 Add attachment URL if message has attachments and we don't have it yet
      if (message.hasAttachments && message.attachments && message.attachments.length > 0 && !existingMessage.media_url) {
        const firstAttachment = message.attachments[0]
        console.log('📎 Updating outbound message with attachment:', {
          guid: firstAttachment.guid,
          mimeType: firstAttachment.mimeType,
          transferName: firstAttachment.transferName
        })

        // Construct attachment URL using BlueBubbles API - use /force to ensure download
        updateData.media_url = `${BB_HOST}/api/v1/attachment/${firstAttachment.guid}/download/force?password=${BB_PASSWORD}`

        // Clear temp placeholder body (📷/📎) and replace with caption or attachment character
        if (existingMessage.body?.startsWith('📷 ') || existingMessage.body?.startsWith('📎 ')) {
          updateData.body = message.text || '\ufffc'
          console.log('🧹 Clearing temp placeholder, new body:', updateData.body)
        }
      }

      console.log('💾 Updating message with data:', updateData)

      const { error } = await supabase
        .from('messages')
        .update(updateData)
        .eq('id', existingMessage.id)

      if (error) {
        console.error('❌ Error updating outbound message:', error)
      } else {
        console.log('✅ Outbound message updated successfully with:', {
          media_url: updateData.media_url ? 'SET' : 'not set',
          body: updateData.body,
          delivery_status: updateData.delivery_status
        })
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

    // 🔥 FIX: Use correct column names from schema
    await supabase
      .from('members')
      .update({
        opt_out: true,
        opt_out_date: new Date().toISOString(),
        opt_out_reason: `User replied: ${message.text}`
      })
      .eq('id', memberId)

    await supabase
      .from('opt_out_log')
      .insert({
        member_id: memberId,
        action: 'opt_out',
        message_text: message.text,
        timestamp: new Date().toISOString()
      })

    await sendOptOutConfirmation(phone, memberId)
  }

  if (optInKeywords.includes(text)) {
    console.log('✅ Opt-in detected from:', phone)

    // 🔥 FIX: Use correct column names from schema
    await supabase
      .from('members')
      .update({
        opt_out: false,
        opt_in_date: new Date().toISOString(),
        opt_out_date: null,
        opt_out_reason: null
      })
      .eq('id', memberId)

    await supabase
      .from('opt_out_log')
      .insert({
        member_id: memberId,
        action: 'opt_in',
        message_text: message.text,
        timestamp: new Date().toISOString()
      })

    await sendOptInConfirmation(phone, memberId)
  }
}

async function sendOptOutConfirmation(phone, memberId) {
  try {
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    const confirmationMessage = `You have been unsubscribed from MO Young Democrats messages.

Reply START to resume receiving messages.`

    const tempGuid = `optout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const response = await fetch(`${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        message: confirmationMessage,
        method: 'private-api',
        tempGuid: tempGuid
      }),
    })

    console.log('📤 Opt-out confirmation sent')

    // 🔥 FIX: Save confirmation message to database so it appears in UI
    try {
      // Get or create conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('member_id', memberId)
        .maybeSingle()

      if (conversation) {
        // Update conversation with last message
        await supabase
          .from('conversations')
          .update({
            last_message: confirmationMessage,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', conversation.id)

        // Get actual GUID from response if available
        let messageGuid = tempGuid
        if (response.ok) {
          const result = await response.json()
          if (result.data?.guid) {
            messageGuid = result.data.guid
          }
        }

        // Save the outbound confirmation message
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            body: confirmationMessage,
            direction: 'outbound',
            delivery_status: 'sent',
            sender_phone: phone,
            guid: messageGuid,
            is_read: true,
            created_at: new Date().toISOString()
          })

        console.log('✅ Opt-out confirmation saved to database')
      }
    } catch (dbError) {
      console.error('⚠️ Error saving opt-out confirmation to database:', dbError)
    }
  } catch (error) {
    console.error('Error sending opt-out confirmation:', error)
  }
}

async function sendOptInConfirmation(phone, memberId) {
  try {
    const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`

    const confirmationMessage = `Welcome back! You've been re-subscribed to MO Young Democrats messages. 🎉

We're glad to have you back!`

    const tempGuid = `optin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const response = await fetch(`${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: chatGuid,
        message: confirmationMessage,
        method: 'private-api',
        tempGuid: tempGuid
      }),
    })

    console.log('📤 Opt-in confirmation sent')

    // 🔥 FIX: Save confirmation message to database so it appears in UI
    try {
      // Get or create conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('member_id', memberId)
        .maybeSingle()

      if (conversation) {
        // Update conversation with last message
        await supabase
          .from('conversations')
          .update({
            last_message: confirmationMessage,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', conversation.id)

        // Get actual GUID from response if available
        let messageGuid = tempGuid
        if (response.ok) {
          const result = await response.json()
          if (result.data?.guid) {
            messageGuid = result.data.guid
          }
        }

        // Save the outbound confirmation message
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            body: confirmationMessage,
            direction: 'outbound',
            delivery_status: 'sent',
            sender_phone: phone,
            guid: messageGuid,
            is_read: true,
            created_at: new Date().toISOString()
          })

        console.log('✅ Opt-in confirmation saved to database')
      }
    } catch (dbError) {
      console.error('⚠️ Error saving opt-in confirmation to database:', dbError)
    }
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

    // 🔥 Add attachment URL if message has attachments
    if (message.hasAttachments && message.attachments && message.attachments.length > 0) {
      const firstAttachment = message.attachments[0]
      console.log('📎 Message has attachment:', {
        guid: firstAttachment.guid,
        mimeType: firstAttachment.mimeType,
        transferName: firstAttachment.transferName
      })

      // Construct attachment URL using BlueBubbles API - use /force to ensure download
      // Format: /api/v1/attachment/{guid}/download/force
      messageData.media_url = `${BB_HOST}/api/v1/attachment/${firstAttachment.guid}/download/force?password=${BB_PASSWORD}`
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