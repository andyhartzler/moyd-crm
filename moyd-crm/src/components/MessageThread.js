'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function MessageThread({ conversation, onMessageSent }) {
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (conversation?.messages) {
      const sorted = [...conversation.messages].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      )
      setMessages(sorted)
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [conversation])

  async function sendMessage() {
    if (!messageText.trim() || !conversation?.member?.phone_e164) return

    setSending(true)
    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: conversation.member.phone_e164,
          message: messageText,
          conversationId: conversation.id,
        }),
      })

      if (!response.ok) throw new Error('Failed to send message')

      setMessageText('')
      onMessageSent()
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const memberName = conversation?.member?.name || 'Unknown'

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{memberName}</h2>
        <p className="text-sm text-gray-500">{conversation?.member?.phone}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const isOutbound = msg.direction === 'outbound'
            const time = format(new Date(msg.created_at), 'h:mm a')

            return (
              <div
                key={msg.id}
                className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    isOutbound
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  <p className="text-sm break-words">{msg.body}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isOutbound ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {time}
                    {isOutbound && msg.delivery_status === 'delivered' && ' ✓'}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex space-x-3">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !messageText.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}