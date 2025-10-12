'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

const REACTIONS = [
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'dislike', emoji: '👎', label: 'Dislike' },
  { type: 'laugh', emoji: '😂', label: 'Laugh' },
  { type: 'emphasize', emoji: '‼️', label: 'Emphasize' },
  { type: 'question', emoji: '❓', label: 'Question' }
]

export default function MessengerPage() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone')
  const name = searchParams.get('name')
  const memberId = searchParams.get('memberId')

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [showReactionPicker, setShowReactionPicker] = useState(null)
  const messagesEndRef = useRef(null)
  const pollIntervalRef = useRef(null)

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load messages
  useEffect(() => {
    if (memberId) {
      loadMessages()
      // Poll for new messages every 2 seconds
      pollIntervalRef.current = setInterval(loadMessages, 2000)
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }
      }
    }
  }, [memberId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/messages?memberId=${memberId}`)
      if (response.ok) {
        const data = await response.json()
        // Group messages with their reactions
        const processedMessages = processMessages(data.messages || [])
        setMessages(processedMessages)
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  // Process messages to group reactions with their parent messages
  const processMessages = (rawMessages) => {
    const messageMap = {}
    const processedMessages = []

    // First pass: organize all messages
    rawMessages.forEach(msg => {
      if (msg.associated_message_guid && msg.associated_message_type >= 2000) {
        // This is a reaction
        if (!messageMap[msg.associated_message_guid]) {
          messageMap[msg.associated_message_guid] = { reactions: [] }
        }
        messageMap[msg.associated_message_guid].reactions.push({
          type: msg.associated_message_type,
          direction: msg.direction,
          created_at: msg.created_at
        })
      } else {
        // Regular message or reply
        messageMap[msg.guid] = {
          ...msg,
          reactions: messageMap[msg.guid]?.reactions || []
        }
        processedMessages.push(messageMap[msg.guid])
      }
    })

    return processedMessages
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    
    if (!message.trim() && !replyingTo) return

    setLoading(true)
    setError(null)

    try {
      const payload = {
        phone,
        message: message.trim(),
        memberId,
      }

      if (replyingTo) {
        payload.replyToGuid = replyingTo.guid
      }

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }

      // Reload messages to show the new one
      await loadMessages()
      setMessage('')
      setReplyingTo(null)
    } catch (err) {
      setError(err.message)
      console.error('Error sending message:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleReaction = async (messageGuid, reactionType) => {
    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          memberId,
          reaction: reactionType,
          replyToGuid: messageGuid,
          partIndex: 0
        }),
      })

      if (response.ok) {
        await loadMessages()
        setShowReactionPicker(null)
      }
    } catch (err) {
      console.error('Error sending reaction:', err)
    }
  }

  const getReactionEmoji = (type) => {
    const reactionMap = {
      2000: '❤️', 2001: '👍', 2002: '👎', 2003: '😂', 2004: '‼️', 2005: '❓',
      3000: '', 3001: '', 3002: '', 3003: '', 3004: '', 3005: '' // Removed reactions
    }
    return reactionMap[type] || ''
  }

  const getStatusIcon = (msg) => {
    if (msg.direction === 'inbound') return null
    
    if (msg.is_read) {
      return <span className="text-blue-500 text-xs ml-1">✓✓</span>
    } else if (msg.delivery_status === 'delivered') {
      return <span className="text-gray-400 text-xs ml-1">✓✓</span>
    } else if (msg.delivery_status === 'sent') {
      return <span className="text-gray-400 text-xs ml-1">✓</span>
    }
    return null
  }

  const findMessageByGuid = (guid) => {
    return messages.find(m => m.guid === guid)
  }

  if (!phone || !name) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Request</h2>
          <p className="text-gray-600">Missing phone or name parameter</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{name}</h1>
              <p className="text-sm text-gray-500">{phone}</p>
            </div>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 py-6 h-full flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg, index) => {
                // Skip reaction messages (they're displayed on the parent)
                if (msg.associated_message_guid && msg.associated_message_type >= 2000) {
                  return null
                }

                const isOutbound = msg.direction === 'outbound'
                const repliedMessage = msg.thread_originator_guid 
                  ? findMessageByGuid(msg.thread_originator_guid) 
                  : null

                return (
                  <div
                    key={msg.guid || index}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xs lg:max-w-md relative group`}>
                      {/* Reply Preview */}
                      {repliedMessage && (
                        <div className={`text-xs text-gray-500 mb-1 px-3 py-1 bg-gray-100 rounded-t-lg border-l-2 ${
                          isOutbound ? 'border-blue-500' : 'border-gray-400'
                        }`}>
                          <div className="font-medium">
                            {repliedMessage.direction === 'outbound' ? 'You' : name}
                          </div>
                          <div className="truncate">{repliedMessage.body}</div>
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        className={`px-4 py-2 ${repliedMessage ? 'rounded-b-lg rounded-tr-lg' : 'rounded-lg'} ${
                          isOutbound
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <p className="text-sm break-words">{msg.body}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className={`text-xs ${
                            isOutbound ? 'text-blue-100' : 'text-gray-500'
                          }`}>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </p>
                          {getStatusIcon(msg)}
                        </div>
                      </div>

                      {/* Reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          {msg.reactions.map((reaction, idx) => (
                            <span
                              key={idx}
                              className="inline-block px-2 py-1 bg-white border border-gray-200 rounded-full text-sm shadow-sm"
                            >
                              {getReactionEmoji(reaction.type)}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons (shown on hover) */}
                      <div className={`absolute top-0 ${isOutbound ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 px-2`}>
                        {/* Reply Button */}
                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="p-1 bg-white rounded-full shadow hover:bg-gray-100 text-xs"
                          title="Reply"
                        >
                          ↩️
                        </button>
                        {/* React Button */}
                        <button
                          onClick={() => setShowReactionPicker(showReactionPicker === msg.guid ? null : msg.guid)}
                          className="p-1 bg-white rounded-full shadow hover:bg-gray-100 text-xs"
                          title="React"
                        >
                          ❤️
                        </button>
                      </div>

                      {/* Reaction Picker */}
                      {showReactionPicker === msg.guid && (
                        <div className={`absolute ${isOutbound ? 'left-0' : 'right-0'} mt-2 p-2 bg-white rounded-lg shadow-lg border border-gray-200 flex gap-2 z-10`}>
                          {REACTIONS.map(reaction => (
                            <button
                              key={reaction.type}
                              onClick={() => handleReaction(msg.guid, reaction.type)}
                              className="text-2xl hover:scale-125 transition-transform"
                              title={reaction.label}
                            >
                              {reaction.emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Reply Preview */}
          {replyingTo && (
            <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-blue-600 font-medium">
                  Replying to {replyingTo.direction === 'outbound' ? 'yourself' : name}
                </p>
                <p className="text-sm text-gray-700 truncate">{replyingTo.body}</p>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                ✕
              </button>
            </div>
          )}

          {/* Message Input Form */}
          <form onSubmit={handleSendMessage} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={replyingTo ? "Type your reply..." : "Type your message..."}
                className="flex-1 resize-none rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-gray-900 placeholder-gray-400"
                rows={3}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage(e)
                  }
                }}
              />
              <button
                type="submit"
                disabled={loading || (!message.trim() && !replyingTo)}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium self-end"
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Press Enter to send • Shift+Enter for new line • Hover messages to reply/react
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}