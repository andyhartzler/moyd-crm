'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Paperclip, Image as ImageIcon, X, Send, ArrowLeft, Users, MessageCircle, CheckCircle, AlertCircle, Loader2, Sparkles, Clock } from 'lucide-react'

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
  const mode = searchParams.get('mode') // 'group' for group message mode

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [showReactionPicker, setShowReactionPicker] = useState(null)
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ top: 0, left: 0 })
  const [isTyping, setIsTyping] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [sendingIntro, setSendingIntro] = useState(false)
  
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [showGroupComposer, setShowGroupComposer] = useState(false)
  const [groupMessage, setGroupMessage] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState([])
  const [sendingGroupMessage, setSendingGroupMessage] = useState(false)
  const [groupMessageComplete, setGroupMessageComplete] = useState(false)
  const [groupMessageProgress, setGroupMessageProgress] = useState({ sent: 0, total: 0, failed: [] })
  const [groupMessageThreads, setGroupMessageThreads] = useState([])
  
  const [groupFilterType, setGroupFilterType] = useState('all')
  const [groupFilterValue, setGroupFilterValue] = useState('all')
  const [groupFilterOptions, setGroupFilterOptions] = useState([])
  const [showGroupFilterDropdown, setShowGroupFilterDropdown] = useState(false)

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const userScrolledUp = useRef(false)
  const fileInputRef = useRef(null)
  const conversationIdRef = useRef(null)
  const realtimeChannelRef = useRef(null)

  // Scroll behavior
  const scrollToBottom = (force = false) => {
    if (force || !userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleScroll = () => {
    if (!messagesContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    
    userScrolledUp.current = !isNearBottom
  }

  useEffect(() => {
    if (!phone && !name && !memberId) {
      loadMembers()
    }
  }, [phone, name, memberId])

  useEffect(() => {
    if (memberId) {
      loadMessages()
      scrollToBottom(true)
      
      // Setup Supabase Realtime subscription instead of polling
      setupRealtimeSubscription()
      
      // Cleanup on unmount
      return () => {
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current)
        }
      }
    }
  }, [memberId])

  // Setup Supabase Realtime subscription for instant updates
  const setupRealtimeSubscription = async () => {
    try {
      // Get conversation ID first
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('member_id', memberId)
        .maybeSingle()

      if (!conversation) {
        console.log('⚠️ No conversation found yet for realtime subscription')
        return
      }

      conversationIdRef.current = conversation.id

      // Create realtime channel for this conversation
      const channel = supabase
        .channel(`conversation_${conversation.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversation.id}`
          },
          (payload) => {
            console.log('📡 Realtime message update:', payload)
            
            if (payload.eventType === 'INSERT') {
              // New message inserted
              const newMessage = payload.new
              setMessages(prev => {
                // Check if message already exists (avoid duplicates)
                if (prev.some(m => m.id === newMessage.id || m.guid === newMessage.guid)) {
                  return prev
                }
                return [...prev, newMessage]
              })
              scrollToBottom()
            } else if (payload.eventType === 'UPDATE') {
              // Message updated (delivery status, read status, etc.)
              const updatedMessage = payload.new
              setMessages(prev => prev.map(m => 
                m.id === updatedMessage.id ? updatedMessage : m
              ))
            } else if (payload.eventType === 'DELETE') {
              // Message deleted
              setMessages(prev => prev.filter(m => m.id !== payload.old.id))
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 Realtime subscription status:', status)
        })

      realtimeChannelRef.current = channel
    } catch (error) {
      console.error('❌ Error setting up realtime subscription:', error)
    }
  }

  useEffect(() => {
    if (showGroupComposer) {
      loadMembers()
      loadGroupFilterOptions()
    }
  }, [showGroupComposer])

  useEffect(() => {
    if (groupFilterType || groupFilterValue) {
      loadGroupFilterOptions()
      updateSelectedRecipients()
    }
  }, [groupFilterType, groupFilterValue, members])

  // 🔥 FIX: Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showReactionPicker && !event.target.closest('.reaction-picker-wrapper')) {
        setShowReactionPicker(null)
      }
    }

    if (showReactionPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showReactionPicker])

  const loadMembers = async () => {
    setLoadingMembers(true)
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name')
      
      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      console.error('Error loading members:', err)
    } finally {
      setLoadingMembers(false)
    }
  }

  const parseJSON = (field) => {
    if (!field) return null
    if (typeof field === 'string') {
      try {
        const parsed = JSON.parse(field)
        return Array.isArray(parsed) ? parsed.map(item => 
          typeof item === 'object' && item !== null && item.name ? item.name : item
        ).filter(Boolean) : parsed
      } catch {
        return field
      }
    }
    if (Array.isArray(field)) {
      return field.map(item => 
        typeof item === 'object' && item !== null && item.name ? item.name : item
      ).filter(Boolean)
    }
    return field
  }

  const formatCommittees = (committee) => {
    if (!committee) return null
    if (typeof committee === 'string') {
      try {
        const parsed = JSON.parse(committee)
        return Array.isArray(parsed) 
          ? parsed.map(c => typeof c === 'object' ? c.name : c).filter(Boolean).join(', ')
          : parsed
      } catch {
        return committee
      }
    }
    if (Array.isArray(committee)) {
      return committee.map(c => typeof c === 'object' ? c.name : c).filter(Boolean).join(', ')
    }
    return committee
  }

  const loadGroupFilterOptions = async () => {
    if (groupFilterType === 'all') {
      setGroupFilterOptions([])
      return
    }

    const uniqueValues = new Set()
    
    members.forEach(member => {
      let value
      switch (groupFilterType) {
        case 'county':
          value = parseJSON(member.county)
          break
        case 'district':
          value = parseJSON(member.congressional_district || member.district)
          break
        case 'committee':
          const committees = parseJSON(member.committee)
          if (Array.isArray(committees)) {
            committees.forEach(c => uniqueValues.add(c))
            return
          } else if (committees) {
            uniqueValues.add(committees)
            return
          }
          break
      }
      if (value) uniqueValues.add(value)
    })

    setGroupFilterOptions(Array.from(uniqueValues).sort())
  }

  const updateSelectedRecipients = () => {
    let filtered = [...members]

    if (groupFilterType === 'opt_out') {
      if (groupFilterValue === 'Yes') {
        filtered = members.filter(m => !m.opt_out)
      } else if (groupFilterValue === 'No') {
        filtered = members.filter(m => m.opt_out)
      }
    } else if (groupFilterValue !== 'all') {
      filtered = members.filter(m => {
        switch (groupFilterType) {
          case 'county':
            return parseJSON(m.county) === groupFilterValue
          case 'district':
            return parseJSON(m.congressional_district || m.district) === groupFilterValue
          case 'committee':
            if (Array.isArray(m.committee)) {
              return m.committee.some(c => parseJSON(c) === groupFilterValue)
            }
            return parseJSON(m.committee) === groupFilterValue
          default:
            return true
        }
      })
    }

    setSelectedRecipients(filtered.filter(m => m.phone_e164))
  }

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/messages?memberId=${memberId}`)
      if (!response.ok) throw new Error('Failed to load messages')
      
      const data = await response.json()
      
      // Sort messages and enrich with reactions
      const enrichedMessages = await enrichMessagesWithReactions(data.messages || [])
      setMessages(enrichedMessages)
      
      if (!userScrolledUp.current) {
        setTimeout(() => scrollToBottom(true), 100)
      }
    } catch (err) {
      console.error('Error loading messages:', err)
      setError('Failed to load messages')
    }
  }

  // Enrich messages with their reactions
  const enrichMessagesWithReactions = async (messages) => {
    const messageMap = new Map(messages.map(m => [m.guid, { ...m, reactions: [] }]))
    
    // Find all reaction messages
    messages.forEach(msg => {
      if (msg.associated_message_type !== null && msg.associated_message_guid) {
        const originalMsg = messageMap.get(msg.associated_message_guid)
        if (originalMsg) {
          originalMsg.reactions.push({
            type: msg.associated_message_type,
            guid: msg.guid,
            direction: msg.direction
          })
        }
      }
    })
    
    // Filter out reaction messages from main list
    return Array.from(messageMap.values())
      .filter(m => m.associated_message_type === null || m.associated_message_type === undefined)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }

  const checkTypingStatus = async () => {
    try {
      const { data } = await supabase
        .from('members')
        .select('is_typing')
        .eq('id', memberId)
        .single()
      
      setIsTyping(data?.is_typing || false)
    } catch (err) {
      console.error('Error checking typing status:', err)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    
    if (loading || uploadingFile) return
    if (!message.trim() && !selectedFile) return

    setError(null)
    setLoading(true)

    // Save state to restore on error
    const messageToSend = message
    const fileToSend = selectedFile
    const replyToSend = replyingTo

    // Clear inputs immediately
    setMessage('')
    setSelectedFile(null)
    setReplyingTo(null)

    try {
      if (fileToSend) {
        // Send file
        setUploadingFile(true)
        const formData = new FormData()
        formData.append('file', fileToSend)
        formData.append('phone', phone)
        formData.append('memberId', memberId)
        if (messageToSend) formData.append('message', messageToSend)
        if (replyToSend) {
          formData.append('replyToGuid', replyToSend.guid)
          formData.append('partIndex', '0')
        }

        const response = await fetch('/api/send-message', {
          method: 'POST',
          body: formData,
        })

        setUploadingFile(false)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to send attachment')
        }
      } else {
        // Send text message
        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            message: messageToSend,
            memberId,
            ...(replyToSend && {
              replyToGuid: replyToSend.guid,
              partIndex: 0
            })
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to send message')
        }
      }

      // Message will appear automatically via realtime subscription
      scrollToBottom(true)

    } catch (err) {
      console.error('Error sending message:', err)
      setError(err.message || 'Failed to send message')
      
      // Restore inputs on error
      setMessage(messageToSend)
      setSelectedFile(fileToSend)
      setReplyingTo(replyToSend)
    } finally {
      setLoading(false)
    }
  }

  // 🔥 FIX: Updated handleReact to use correct parameter names and show picker properly
  const handleShowReactionPicker = (messageGuid, event) => {
    event.stopPropagation()
    
    // If already showing for this message, close it
    if (showReactionPicker === messageGuid) {
      setShowReactionPicker(null)
      return
    }

    // Get button position for proper picker placement
    const buttonRect = event.currentTarget.getBoundingClientRect()
    setReactionPickerPosition({
      top: buttonRect.bottom + window.scrollY + 5,
      left: buttonRect.left + window.scrollX
    })
    
    setShowReactionPicker(messageGuid)
  }

  // 🔥 FIX: Corrected API parameter names to match backend
  const handleReact = async (messageGuid, reactionType) => {
    try {
      console.log('Sending reaction:', { messageGuid, reactionType: reactionType.type })
      
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          memberId,
          reaction: reactionType.type, // ✅ Changed from reactionType to reaction
          replyToGuid: messageGuid,    // ✅ Changed from reactionToMessageGuid to replyToGuid
          partIndex: 0                 // ✅ Added partIndex
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send reaction')
      }

      setShowReactionPicker(null)
      // Realtime subscription will update the UI with the reaction
    } catch (err) {
      console.error('Error sending reaction:', err)
      setError(err.message || 'Failed to send reaction')
    }
  }

  const getReactionEmoji = (reaction) => {
    const reactionType = REACTIONS.find(r => r.code === reaction.type || r.code === reaction.associated_message_type)
    return reactionType?.emoji || '❓'
  }

  const getStatusIcon = (msg) => {
    if (msg.direction !== 'outbound') return null
    
    // Better status icons
    if (msg.delivery_status === 'sending' || msg.delivery_status === 'sent') {
      return <Clock className="h-3 w-3 text-blue-300 ml-1 animate-pulse" />
    }
    
    if (msg.delivery_status === 'delivered' && msg.is_read) {
      return <span className="text-blue-300 ml-1">✓✓</span>
    }
    
    if (msg.delivery_status === 'delivered') {
      return <span className="text-blue-300 ml-1">✓</span>
    }
    
    if (msg.delivery_status === 'failed') {
      return <AlertCircle className="h-3 w-3 text-red-500 ml-1" />
    }
    
    return null
  }

  // 🔥 FIX: Updated to detect vCard files without relying on is_contact_card column
  const isContactCard = (msg) => {
    if (!msg.media_url) return false
    
    // Check if filename ends with .vcf (case insensitive)
    const filename = msg.media_url.toLowerCase()
    return filename.endsWith('.vcf') || filename.includes('.vcf?')
  }

  const renderAttachment = (msg) => {
    // 🔥 FIX: Use function instead of non-existent column
    if (isContactCard(msg)) {
      return (
        <div className="bg-gray-100 p-3 rounded-lg">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-800">Contact Card</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {msg.media_url?.split('/').pop()?.split('?')[0] || 'Contact.vcf'}
          </p>
        </div>
      )
    }

    if (msg.media_url) {
      const isImage = msg.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      
      if (isImage) {
        return (
          <img 
            src={msg.media_url} 
            alt="Attachment" 
            className="max-w-full rounded-lg"
            style={{ maxHeight: '300px' }}
          />
        )
      }
      
      return (
        <a 
          href={msg.media_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
        >
          <Paperclip className="h-4 w-4" />
          <span className="text-sm underline">
            {msg.media_url.split('/').pop()?.split('?')[0] || 'Attachment'}
          </span>
        </a>
      )
    }

    return null
  }

  const handleSendIntro = async () => {
    setSendingIntro(true)
    setError(null)

    try {
      const response = await fetch('/api/send-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientIds: [memberId]
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send intro')
      }

      if (data.results?.[0]?.status === 'success') {
        console.log('✅ Intro sent successfully')
        // Message will appear via realtime subscription
        scrollToBottom(true)
      } else {
        throw new Error(data.results?.[0]?.message || 'Failed to send intro')
      }
    } catch (err) {
      console.error('Error sending intro:', err)
      setError(err.message || 'Failed to send intro')
    } finally {
      setSendingIntro(false)
    }
  }

  const handleSendGroupMessage = async () => {
    if (!groupMessage.trim() || selectedRecipients.length === 0) {
      setError('Please enter a message and select recipients')
      return
    }

    setSendingGroupMessage(true)
    setGroupMessageComplete(false)
    setGroupMessageProgress({ sent: 0, total: selectedRecipients.length, failed: [] })
    setError(null)

    try {
      const response = await fetch('/api/send-group-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: groupMessage,
          recipientIds: selectedRecipients.map(r => r.id)
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send group message')
      }

      setGroupMessageProgress({
        sent: data.results.filter(r => r.status === 'success').length,
        total: selectedRecipients.length,
        failed: data.results.filter(r => r.status === 'failed')
      })
      
      setGroupMessageThreads(data.results)
      setGroupMessageComplete(true)

      setTimeout(() => {
        setShowGroupComposer(false)
        setGroupMessage('')
        setSelectedRecipients([])
        setGroupFilterType('all')
        setGroupFilterValue('all')
      }, 2000)

    } catch (err) {
      console.error('Error sending group message:', err)
      setError(err.message || 'Failed to send group message')
    } finally {
      setSendingGroupMessage(false)
    }
  }

  if (showGroupComposer) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowGroupComposer(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Send Group Message</h1>
                <p className="text-blue-100 text-sm">Select recipients and compose your message</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Filter Selection */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter Recipients</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter Type
                </label>
                <select
                  value={groupFilterType}
                  onChange={(e) => {
                    setGroupFilterType(e.target.value)
                    setGroupFilterValue('all')
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Members</option>
                  <option value="county">By County</option>
                  <option value="district">By District</option>
                  <option value="committee">By Committee</option>
                  <option value="opt_out">By Opt-Out Status</option>
                </select>
              </div>

              {groupFilterType !== 'all' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {groupFilterType === 'opt_out' ? 'Include Opted-Out?' : 'Filter Value'}
                  </label>
                  {groupFilterType === 'opt_out' ? (
                    <select
                      value={groupFilterValue}
                      onChange={(e) => setGroupFilterValue(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All</option>
                      <option value="Yes">Only Non-Opted-Out</option>
                      <option value="No">Only Opted-Out</option>
                    </select>
                  ) : (
                    <select
                      value={groupFilterValue}
                      onChange={(e) => setGroupFilterValue(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All</option>
                      {loadingMembers ? (
                        <option disabled>Loading...</option>
                      ) : (
                        groupFilterOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>{selectedRecipients.length}</strong> recipient{selectedRecipients.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>

          {/* Message Composer */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Compose Message</h2>
            
            <textarea
              value={groupMessage}
              onChange={(e) => setGroupMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              disabled={sendingGroupMessage}
            />

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowGroupComposer(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                disabled={sendingGroupMessage}
              >
                Cancel
              </button>
              <button
                onClick={handleSendGroupMessage}
                disabled={sendingGroupMessage || !groupMessage.trim() || selectedRecipients.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sendingGroupMessage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending ({groupMessageProgress.sent}/{groupMessageProgress.total})...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send to {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>

            {groupMessageComplete && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">Message sent successfully!</p>
                    <p className="text-sm text-green-700 mt-1">
                      Sent to {groupMessageProgress.sent} of {groupMessageProgress.total} recipients
                    </p>
                    {groupMessageProgress.failed.length > 0 && (
                      <p className="text-sm text-red-600 mt-1">
                        Failed: {groupMessageProgress.failed.length}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Selected Recipients Preview */}
          {selectedRecipients.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Selected Recipients ({selectedRecipients.length})
              </h2>
              <div className="max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {selectedRecipients.slice(0, 10).map(recipient => (
                    <div key={recipient.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{recipient.name}</p>
                        <p className="text-xs text-gray-500">{recipient.phone_e164}</p>
                      </div>
                    </div>
                  ))}
                  {selectedRecipients.length > 10 && (
                    <p className="text-sm text-gray-500 text-center py-2">
                      ...and {selectedRecipients.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!phone || !memberId) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 shadow-lg">
          <h1 className="text-2xl font-bold">Messenger</h1>
          <p className="text-blue-100 text-sm">Select a member to start messaging</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
              </div>
              <button
                onClick={() => setShowGroupComposer(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition shadow-sm"
              >
                <Users className="h-5 w-5" />
                <span className="font-medium">Send Group Message</span>
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <Search className="h-5 w-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">Members</h2>
              </div>

              {loadingMembers ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No members found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.filter(m => m.phone_e164).map(member => (
                    <button
                      key={member.id}
                      onClick={() => router.push(`/messenger?phone=${encodeURIComponent(member.phone_e164)}&name=${encodeURIComponent(member.name)}&memberId=${member.id}`)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold">
                          {member.name?.charAt(0) || '?'}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-gray-900">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.phone_e164}</p>
                          {member.county && (
                            <p className="text-xs text-gray-400">{parseJSON(member.county)}</p>
                          )}
                        </div>
                      </div>
                      <MessageCircle className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/messenger')}
              className="p-2 hover:bg-white/20 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-semibold">
              {name?.charAt(0) || '?'}
            </div>
            <div>
              <h2 className="font-semibold text-lg">{name || 'Unknown'}</h2>
              <p className="text-sm text-blue-100">{phone}</p>
              {isTyping && (
                <p className="text-xs text-blue-200 italic">typing...</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSendIntro}
              disabled={sendingIntro}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition disabled:opacity-50"
            >
              {sendingIntro ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Send Intro
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOutbound = msg.direction === 'outbound'
            const showReplyInfo = msg.thread_originator_guid && messages.find(m => m.guid === msg.thread_originator_guid)

            return (
              <div
                key={msg.guid || msg.id || idx}
                className={`flex group ${isOutbound ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md ${isOutbound ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm relative`}>
                  {showReplyInfo && (
                    <div className="text-xs opacity-70 mb-1 pb-1 border-b border-current/20">
                      Replying to: {messages.find(m => m.guid === msg.thread_originator_guid)?.body?.substring(0, 30)}...
                    </div>
                  )}

                  <div>
                    {msg.media_url || msg.body === '\ufffc' || isContactCard(msg) ? (
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

                  <div className={`flex items-center mt-0.5 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs opacity-70">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {getStatusIcon(msg)}
                  </div>

                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {msg.reactions.map((reaction, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                          {getReactionEmoji(reaction)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex gap-2">
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="text-xs opacity-70 hover:opacity-100"
                    >
                      Reply
                    </button>
                    <button
                      onClick={(e) => handleShowReactionPicker(msg.guid, e)}
                      className="text-xs opacity-70 hover:opacity-100 reaction-picker-wrapper"
                    >
                      React
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 🔥 FIX: Fixed position reaction picker that doesn't scroll with messages */}
      {showReactionPicker && (
        <div 
          className="fixed bg-white rounded-lg shadow-xl p-2 flex gap-1 z-50 reaction-picker-wrapper border border-gray-200"
          style={{
            top: `${reactionPickerPosition.top}px`,
            left: `${reactionPickerPosition.left}px`
          }}
        >
          {REACTIONS.map(reaction => (
            <button
              key={reaction.type}
              onClick={() => handleReact(showReactionPicker, reaction)}
              className="text-2xl hover:scale-125 transition-transform p-2 hover:bg-gray-100 rounded"
              title={reaction.label}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-gray-200 p-4 sticky bottom-0">
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {replyingTo && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium text-blue-900">Replying to:</p>
              <p className="text-sm text-blue-700 truncate">{replyingTo.body}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-blue-600 hover:text-blue-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {selectedFile && (
          <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedFile.type.startsWith('image/') ? (
                <ImageIcon className="h-5 w-5 text-gray-600" />
              ) : (
                <Paperclip className="h-5 w-5 text-gray-600" />
              )}
              <span className="text-sm text-gray-700">{selectedFile.name}</span>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-gray-600 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,.pdf,.doc,.docx,.vcf"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={loading || uploadingFile}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={loading || uploadingFile || (!message.trim() && !selectedFile)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading || uploadingFile ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function MessengerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <MessengerContent />
    </Suspense>
  )
}