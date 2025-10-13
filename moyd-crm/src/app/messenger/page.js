'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Paperclip, Image as ImageIcon, X, Send, ArrowLeft } from 'lucide-react'

const REACTIONS = [
  { type: 'love', emoji: '❤️', label: 'Love', code: 2000 },
  { type: 'like', emoji: '👍', label: 'Like', code: 2001 },
  { type: 'dislike', emoji: '👎', label: 'Dislike', code: 2002 },
  { type: 'laugh', emoji: '😂', label: 'Laugh', code: 2003 },
  { type: 'emphasize', emoji: '‼️', label: 'Emphasize', code: 2004 },
  { type: 'question', emoji: '❓', label: 'Question', code: 2005 }
]

// Separate component that uses useSearchParams
function MessengerContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const phone = searchParams.get('phone')
  const name = searchParams.get('name')
  const memberId = searchParams.get('memberId')

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [showReactionPicker, setShowReactionPicker] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const userScrolledUp = useRef(false)
  const fileInputRef = useRef(null)

  // Member selector state
  const [members, setMembers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)

  const scrollToBottom = (force = false) => {
    if (force || !userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Track if user scrolled up
  const handleScroll = () => {
    if (!messagesContainerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    
    userScrolledUp.current = !isNearBottom
  }

  // Load members if no phone/name/memberId provided
  useEffect(() => {
    if (!phone && !name && !memberId) {
      loadMembers()
    }
  }, [phone, name, memberId])

  // Load messages if we have a memberId
  useEffect(() => {
    if (memberId) {
      loadMessages()
      scrollToBottom(true)
      
      pollIntervalRef.current = setInterval(() => {
        loadMessages()
        checkTypingStatus()
      }, 2000)
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }
      }
    }
  }, [memberId])

  // Only auto-scroll if user hasn't scrolled up
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadMembers = async () => {
    setLoadingMembers(true)
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, name, phone, phone_e164')
        .order('name', { ascending: true })
        .limit(100)

      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      console.error('Error loading members:', err)
    } finally {
      setLoadingMembers(false)
    }
  }

  const checkTypingStatus = async () => {
    if (!memberId) return
    
    try {
      // Get the conversation for this member
      const { data: convData } = await supabase
        .from('conversations')
        .select('is_typing, typing_since')
        .eq('member_id', memberId)
        .single()

      if (convData && convData.is_typing) {
        // Check if typing indicator is stale (more than 10 seconds old)
        const typingSince = new Date(convData.typing_since)
        const now = new Date()
        const secondsSince = (now - typingSince) / 1000

        if (secondsSince < 10) {
          setIsTyping(true)
        } else {
          setIsTyping(false)
          // Clear stale typing indicator
          await supabase
            .from('conversations')
            .update({ is_typing: false, typing_since: null })
            .eq('member_id', memberId)
        }
      } else {
        setIsTyping(false)
      }
    } catch (err) {
      console.error('Error checking typing status:', err)
    }
  }

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/messages?memberId=${memberId}`)
      if (response.ok) {
        const data = await response.json()
        const processedMessages = processMessages(data.messages || [])
        setMessages(processedMessages)
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const processMessages = (rawMessages) => {
    const messageMap = {}
    const processedMessages = []

    rawMessages.forEach(msg => {
      // Check if this is a reaction (associated_message_type >= 2000)
      if (msg.associated_message_guid && msg.associated_message_type >= 2000) {
        // This is a reaction, add it to the parent message
        if (!messageMap[msg.associated_message_guid]) {
          messageMap[msg.associated_message_guid] = { reactions: [] }
        }
        messageMap[msg.associated_message_guid].reactions.push({
          type: msg.associated_message_type,
          direction: msg.direction,
          created_at: msg.created_at
        })
      } else {
        // This is a regular message
        messageMap[msg.guid] = {
          ...msg,
          reactions: messageMap[msg.guid]?.reactions || []
        }
        processedMessages.push(messageMap[msg.guid])
      }
    })

    return processedMessages
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setSelectedFile(file)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    
    if (!message.trim() && !selectedFile && !replyingTo) return

    setLoading(true)
    setError(null)

    try {
      const payload = {
        phone,
        memberId,
      }

      // If we have a file, upload it first
      if (selectedFile) {
        setUploadingFile(true)
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('phone', phone)
        formData.append('memberId', memberId)
        
        if (message.trim()) {
          formData.append('message', message.trim())
        }
        
        if (replyingTo) {
          formData.append('replyToGuid', replyingTo.guid)
          formData.append('partIndex', '0')
        }

        const response = await fetch('/api/send-attachment', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send attachment')
        }

        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        // Send text message
        payload.message = message.trim()

        if (replyingTo) {
          payload.replyToGuid = replyingTo.guid
          payload.partIndex = 0
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
      }

      await loadMessages()
      setMessage('')
      setReplyingTo(null)
      scrollToBottom(true)
    } catch (err) {
      setError(err.message)
      console.error('Error sending message:', err)
    } finally {
      setLoading(false)
      setUploadingFile(false)
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
    const reaction = REACTIONS.find(r => r.code === type)
    return reaction ? reaction.emoji : ''
  }

  const getStatusIcon = (msg) => {
    if (msg.direction === 'inbound') return null
    
    if (msg.is_read) {
      return <span className="text-blue-500 text-xs ml-1">✓✓</span>
    } else if (msg.delivery_status === 'Delivered') {
      return <span className="text-gray-400 text-xs ml-1">✓✓</span>
    } else if (msg.delivery_status === 'Sent') {
      return <span className="text-gray-400 text-xs ml-1">✓</span>
    }
    return null
  }

  const findMessageByGuid = (guid) => {
    return messages.find(m => m.guid === guid)
  }

  const handleMemberSelect = (member) => {
    const memberPhone = member.phone_e164 || member.phone
    router.push(`/messenger?phone=${encodeURIComponent(memberPhone)}&name=${encodeURIComponent(member.name)}&memberId=${member.id}`)
  }

  const filteredMembers = members.filter(member => 
    member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.phone?.includes(searchTerm) ||
    member.phone_e164?.includes(searchTerm)
  )

  // Check if message has attachments
  const hasAttachments = (msg) => {
    return msg.body === '\ufffc' || msg.body?.includes('\ufffc') || msg.media_url
  }

  // Render attachment (image/video/file)
  const renderAttachment = (msg) => {
    if (!msg.media_url) {
      return <div className="text-sm opacity-75">📎 Attachment</div>
    }

    const url = msg.media_url
    const isImage = url.includes('image') || url.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i)
    const isVideo = url.includes('video') || url.match(/\.(mp4|mov|avi)$/i)

    if (isImage) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img 
            src={url} 
            alt="Attachment" 
            className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            style={{ maxHeight: '300px' }}
            loading="lazy"
          />
        </a>
      )
    } else if (isVideo) {
      return (
        <video 
          controls 
          className="max-w-full rounded-lg"
          style={{ maxHeight: '300px' }}
        >
          <source src={url} type="video/mp4" />
          Your browser doesn't support video playback.
        </video>
      )
    } else {
      return (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm hover:underline"
        >
          <Paperclip className="h-4 w-4" />
          <span>View Attachment</span>
        </a>
      )
    }
  }

  // If no parameters, show member selector
  if (!phone || !name || !memberId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* FIXED: Added back button */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Select a Member</h1>
                <p className="text-sm text-gray-500">Choose who you want to message</p>
              </div>
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search members by name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Members List */}
            {loadingMembers ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading members...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No members found</p>
              </div>
            ) : (
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <ul className="divide-y divide-gray-200">
                  {filteredMembers.map((member) => (
                    <li key={member.id}>
                      <button
                        onClick={() => handleMemberSelect(member)}
                        className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {member.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {member.phone_e164 || member.phone}
                            </p>
                          </div>
                          <div className="text-sm text-blue-600">
                            Message →
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Show messenger interface if we have parameters
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header - FIXED: Added back button and improved text color */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.push('/messenger')}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="border-l border-gray-300 h-6"></div>
              <div>
                <h1 className="text-base font-semibold text-gray-900">{name}</h1>
                <p className="text-xs text-gray-600">{phone}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ maxHeight: 'calc(100vh - 180px)' }}
      >
        <div className="max-w-4xl mx-auto space-y-2">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs text-gray-400 mt-1">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isOutbound = msg.direction === 'outbound'
              const repliedMessage = msg.thread_originator_guid 
                ? findMessageByGuid(msg.thread_originator_guid) 
                : null

              return (
                <div
                  key={msg.guid || index}
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group`}
                >
                  <div className={`max-w-xs lg:max-w-md relative`}>
                    {/* Reply Preview */}
                    {repliedMessage && (
                      <div className={`text-xs mb-1 px-3 py-1.5 rounded-lg ${
                        isOutbound 
                          ? 'bg-blue-100 border-l-2 border-blue-500' 
                          : 'bg-gray-200 border-l-2 border-gray-400'
                      }`}>
                        <div className="font-medium text-gray-700">
                          {repliedMessage.direction === 'outbound' ? 'You' : name}
                        </div>
                        <div className="truncate text-gray-600">
                          {hasAttachments(repliedMessage) ? '📎 Attachment' : repliedMessage.body}
                        </div>
                      </div>
                    )}

                    {/* Message Bubble - FIXED: Better text contrast */}
                    <div
                      className={`px-3 py-2 ${
                        isOutbound
                          ? 'bg-blue-500 text-white rounded-2xl rounded-tr-sm'
                          : 'bg-white text-gray-900 rounded-2xl rounded-tl-sm shadow-sm'
                      }`}
                    >
                      {hasAttachments(msg) ? (
                        <div className="space-y-1">
                          {renderAttachment(msg)}
                          {msg.body && msg.body !== '\ufffc' && (
                            <p className="text-sm mt-2">{msg.body}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm break-words whitespace-pre-wrap">{msg.body}</p>
                      )}
                    </div>

                    {/* Timestamp and Status */}
                    <div className={`flex items-center mt-0.5 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <p className="text-xs text-gray-500">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                      {getStatusIcon(msg)}
                    </div>

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className={`flex gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        {msg.reactions.map((reaction, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-1.5 py-0.5 bg-white border border-gray-200 rounded-full text-xs shadow-sm"
                          >
                            {getReactionEmoji(reaction.type)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Hover Actions */}
                    <div className={`absolute top-0 ${isOutbound ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 px-2`}>
                      <button
                        onClick={() => setReplyingTo(msg)}
                        className="p-1.5 bg-white rounded-full shadow-md hover:bg-gray-100 text-sm border border-gray-200"
                        title="Reply"
                      >
                        ↩️
                      </button>
                      <button
                        onClick={() => setShowReactionPicker(showReactionPicker === msg.guid ? null : msg.guid)}
                        className="p-1.5 bg-white rounded-full shadow-md hover:bg-gray-100 text-sm border border-gray-200"
                        title="React"
                      >
                        ❤️
                      </button>
                    </div>

                    {/* Reaction Picker */}
                    {showReactionPicker === msg.guid && (
                      <div 
                        className={`absolute ${isOutbound ? 'right-0' : 'left-0'} mt-2 p-2 bg-white rounded-xl shadow-xl border border-gray-200 flex gap-2 z-50`}
                        style={{ minWidth: '280px' }}
                      >
                        {REACTIONS.map(reaction => (
                          <button
                            key={reaction.type}
                            onClick={() => handleReaction(msg.guid, reaction.type)}
                            className="text-2xl hover:scale-125 transition-transform p-1"
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

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm shadow-sm px-4 py-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {/* Error Display */}
          {error && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-800">{error}</p>
            </div>
          )}

          {/* File Preview */}
          {selectedFile && (
            <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {selectedFile.type.startsWith('image/') ? (
                  <ImageIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                ) : (
                  <Paperclip className="h-4 w-4 text-gray-500 flex-shrink-0" />
                )}
                <span className="text-xs text-gray-700 truncate">{selectedFile.name}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Reply Preview */}
          {replyingTo && (
            <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-600 font-medium">
                  Replying to {replyingTo.direction === 'outbound' ? 'yourself' : name}
                </p>
                <p className="text-xs text-gray-700 truncate">
                  {hasAttachments(replyingTo) ? '📎 Attachment' : replyingTo.body}
                </p>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Attach file"
              disabled={loading || uploadingFile}
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <div className="flex-1 bg-gray-100 rounded-full px-4 py-2 flex items-center">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={selectedFile ? "Add a message (optional)" : (replyingTo ? "Reply..." : "iMessage")}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-900 placeholder-gray-500"
                disabled={loading || uploadingFile}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage(e)
                  }
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || uploadingFile || (!message.trim() && !selectedFile && !replyingTo)}
              className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {uploadingFile ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// Main export wrapped in Suspense
export default function MessengerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading messenger...</p>
        </div>
      </div>
    }>
      <MessengerContent />
    </Suspense>
  )
}