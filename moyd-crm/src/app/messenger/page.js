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
      
      // 🔥 CRITICAL FIX: Setup Supabase Realtime subscription instead of polling
      setupRealtimeSubscription()
      
      // Cleanup on unmount
      return () => {
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current)
        }
      }
    }
  }, [memberId])

  // 🔥 NEW: Setup Supabase Realtime subscription for instant updates
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
        if (Array.isArray(parsed)) {
          return parsed.map(c => c.name || c).join(', ')
        }
        return committee
      } catch {
        return committee
      }
    }
    if (Array.isArray(committee)) {
      return committee.map(c => (c && typeof c === 'object' && c.name) ? c.name : c).filter(Boolean).join(', ')
    }
    return committee
  }

  const loadGroupFilterOptions = () => {
    if (!members.length) return

    let options = new Set()

    members.forEach(member => {
      switch (groupFilterType) {
        case 'county':
          const county = parseJSON(member.county)
          if (county) options.add(county)
          break
        case 'district':
          const district = parseJSON(member.congressional_district || member.district)
          if (district) options.add(district)
          break
        case 'committee':
          const committees = member.committee
          if (Array.isArray(committees)) {
            committees.forEach(c => {
              const parsed = parseJSON(c)
              if (parsed) options.add(parsed)
            })
          } else if (committees) {
            const parsed = parseJSON(committees)
            if (parsed) options.add(parsed)
          }
          break
      }
    })

    setGroupFilterOptions([...options].sort())
  }

  const updateSelectedRecipients = () => {
    let filtered = members

    if (groupFilterType === 'all' || groupFilterValue === 'all') {
      filtered = members
    } else if (groupFilterType === 'opted_in') {
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

  const handleSendGroupMessage = async () => {
    if (!groupMessage.trim() || selectedRecipients.length === 0) return

    setSendingGroupMessage(true)
    setGroupMessageProgress({ sent: 0, total: selectedRecipients.length, failed: [] })

    const threads = []

    for (const recipient of selectedRecipients) {
      try {
        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: recipient.phone_e164,
            memberId: recipient.id,
            message: groupMessage
          }),
        })

        if (!response.ok) throw new Error('Failed to send')

        threads.push({
          memberId: recipient.id,
          phone: recipient.phone_e164,
          name: recipient.name
        })

        setGroupMessageProgress(prev => ({
          ...prev,
          sent: prev.sent + 1
        }))
      } catch (err) {
        console.error(`Failed to send to ${recipient.name}:`, err)
        setGroupMessageProgress(prev => ({
          ...prev,
          failed: [...prev.failed, recipient.name]
        }))
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    setSendingGroupMessage(false)
    setGroupMessageComplete(true)
    setGroupMessageThreads(threads)
  }

  // 🔥 FIXED: Handler for Send Intro button - NO optimistic messages
  // Let the backend save to database and realtime subscription will show everything
  const handleSendIntro = async () => {
    if (!phone || !memberId) return

    setSendingIntro(true)
    setError(null)

    try {
      const response = await fetch('/api/send-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{
            phone: phone,
            memberId: memberId,
            name: name
          }]
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send intro')
      }

      const result = await response.json()
      console.log('✅ Intro sent:', result)

      // Messages will appear automatically via realtime subscription
      // No need to manually add or remove anything!

    } catch (err) {
      console.error('❌ Send intro error:', err)
      setError(err.message || 'Failed to send intro')
    } finally {
      setSendingIntro(false)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if ((!message.trim() && !selectedFile && !replyingTo) || loading || uploadingFile) return

    setLoading(true)
    setError(null)

    // Store message content before clearing
    const messageToSend = message
    const fileToSend = selectedFile
    const replyToSend = replyingTo

    // Clear inputs immediately for better UX
    setMessage('')
    setSelectedFile(null)
    setReplyingTo(null)

    try {
      const payload = {
        phone,
        memberId
      }

      if (fileToSend) {
        setUploadingFile(true)
        
        const formData = new FormData()
        formData.append('file', fileToSend)
        formData.append('phone', phone)
        formData.append('memberId', memberId)
        
        if (messageToSend.trim()) {
          formData.append('message', messageToSend)
        }

        if (replyToSend) {
          formData.append('replyToGuid', replyToSend.guid)
          formData.append('partIndex', '0')
        }

        const response = await fetch('/api/send-attachment', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to send attachment')
        }

        setUploadingFile(false)
      } else {
        payload.message = messageToSend

        if (replyToSend) {
          payload.replyToGuid = replyToSend.guid
          payload.partIndex = 0
        }

        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  const handleReact = async (messageGuid, reactionType) => {
    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          memberId,
          reaction: reactionType.code,
          replyToGuid: messageGuid,
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
    if (msg.delivery_status === 'queued' || msg.delivery_status === 'sent') {
      return <Clock className="h-3 w-3 text-blue-300 ml-1 animate-pulse" />
    }

    if (msg.delivery_status === 'delivered' && msg.is_read) {
      return <span className="text-blue-300 ml-1">✓✓</span>
    }

    if (msg.delivery_status === 'delivered') {
      return <span className="text-blue-300 ml-1">✓</span>
    }

    if (msg.delivery_status === 'error') {
      return <AlertCircle className="h-3 w-3 text-red-300 ml-1" />
    }

    return null
  }

  const renderAttachment = (msg) => {
    // Handle contact cards specifically
    if (msg.is_contact_card || (msg.body === '\ufffc' && msg.direction === 'outbound')) {
      return (
        <div className="bg-blue-500 rounded-lg p-3 flex items-center gap-2">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <div className="text-white">
            <div className="font-medium text-sm">Contact Card</div>
            <div className="text-xs opacity-90">Missouri Young Democrats</div>
          </div>
        </div>
      )
    }

    if (!msg.media_url) return null

    const isImage = msg.media_url.includes('.jpg') || msg.media_url.includes('.jpeg') || 
                   msg.media_url.includes('.png') || msg.media_url.includes('.gif') ||
                   msg.media_url.includes('.webp')

    if (isImage) {
      return (
        <img 
          src={msg.media_url} 
          alt="Attachment" 
          className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition"
          onClick={() => window.open(msg.media_url, '_blank')}
          style={{ maxHeight: '300px' }}
        />
      )
    }

    return (
      <a 
        href={msg.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg hover:bg-gray-200 transition"
      >
        <Paperclip className="h-4 w-4" />
        <span className="text-sm">View Attachment</span>
      </a>
    )
  }

  // Group message UI
  if (mode === 'group' || showGroupComposer) {
    if (groupMessageComplete) {
      return (
        <div className="min-h-screen bg-gray-100">
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Group Message</h1>
                </div>
                <button
                  onClick={() => router.push('/messenger')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Messenger
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Group Message Sent!</h2>
              <p className="text-gray-600 mb-4">
                Successfully sent {groupMessageProgress.sent} messages
                {groupMessageProgress.failed.length > 0 && ` (${groupMessageProgress.failed.length} failed)`}
              </p>

              {groupMessageProgress.failed.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-900 mb-2">Failed to send to:</p>
                  <p className="text-sm text-red-700">{groupMessageProgress.failed.join(', ')}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    setGroupMessageComplete(false)
                    setShowGroupComposer(false)
                    setGroupMessage('')
                    setSelectedRecipients([])
                    router.push('/messenger')
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Back to Messenger
                </button>
                
                {groupMessageThreads.length > 0 && (
                  <button
                    onClick={() => {
                      const firstThread = groupMessageThreads[0]
                      router.push(`/messenger?phone=${firstThread.phone}&name=${firstThread.name}&memberId=${firstThread.memberId}`)
                    }}
                    className="px-6 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium"
                  >
                    Open First Conversation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Compose Group Message</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''} selected
                </p>
              </div>
              <button
                onClick={() => {
                  setShowGroupComposer(false)
                  router.push('/messenger')
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Filter section */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Recipients</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter Type</label>
                <select
                  value={groupFilterType}
                  onChange={(e) => {
                    setGroupFilterType(e.target.value)
                    setGroupFilterValue('all')
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Members</option>
                  <option value="county">County</option>
                  <option value="district">Congressional District</option>
                  <option value="committee">Committee</option>
                  <option value="opted_in">Opted In Status</option>
                </select>
              </div>

              {groupFilterType !== 'all' && groupFilterType !== 'opted_in' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter Value</label>
                  <select
                    value={groupFilterValue}
                    onChange={(e) => setGroupFilterValue(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All {groupFilterType}</option>
                    {groupFilterOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              )}

              {groupFilterType === 'opted_in' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={groupFilterValue}
                    onChange={(e) => setGroupFilterValue(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Members</option>
                    <option value="Yes">Opted In (Yes)</option>
                    <option value="No">Opted Out (No)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Message composer */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Message</h3>
            
            <textarea
              value={groupMessage}
              onChange={(e) => setGroupMessage(e.target.value)}
              placeholder="Type your group message here..."
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {groupMessage.length} characters
              </p>
              
              <button
                onClick={handleSendGroupMessage}
                disabled={!groupMessage.trim() || selectedRecipients.length === 0 || sendingGroupMessage}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sendingGroupMessage ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending {groupMessageProgress.sent}/{groupMessageProgress.total}...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send to {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview section */}
          {selectedRecipients.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recipients Preview</h3>
              <div className="max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedRecipients.slice(0, 12).map(member => (
                    <div key={member.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {member.name?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                        <p className="text-xs text-gray-500 truncate">{member.phone_e164}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedRecipients.length > 12 && (
                  <p className="text-sm text-gray-600 mt-3 text-center">
                    And {selectedRecipients.length - 12} more...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Regular 1-on-1 chat UI
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/conversations')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{name || 'Unknown'}</h2>
            <p className="text-sm text-gray-500">{phone}</p>
            {isTyping && (
              <p className="text-xs text-blue-600 italic">typing...</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSendIntro}
            disabled={sendingIntro}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition disabled:opacity-50"
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
                <div className={`relative max-w-xs lg:max-w-md ${isOutbound ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm`}>
                  {showReplyInfo && (
                    <div className="text-xs opacity-70 mb-1 pb-1 border-b border-current/20">
                      Replying to: {messages.find(m => m.guid === msg.thread_originator_guid)?.body?.substring(0, 30)}...
                    </div>
                  )}

                  <div>
                    {msg.media_url || msg.body === '\ufffc' || msg.is_contact_card ? (
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
                      onClick={() => setShowReactionPicker(msg.guid)}
                      className="text-xs opacity-70 hover:opacity-100"
                    >
                      React
                    </button>
                  </div>

                  {showReactionPicker === msg.guid && (
                    <div className="absolute mt-2 bg-white rounded-lg shadow-lg p-2 flex gap-1 z-20">
                      {REACTIONS.map(reaction => (
                        <button
                          key={reaction.type}
                          onClick={() => handleReact(msg.guid, reaction)}
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
            accept="image/*,video/*,.pdf,.doc,.docx"
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