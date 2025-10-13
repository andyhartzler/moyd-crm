'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Paperclip, Image as ImageIcon, X, Send, ArrowLeft, Users, MessageCircle, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

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
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const userScrolledUp = useRef(false)
  const fileInputRef = useRef(null)

  // Member selector state
  const [members, setMembers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Group message state
  const [showGroupComposer, setShowGroupComposer] = useState(mode === 'group')
  const [groupFilterType, setGroupFilterType] = useState('committee') // 'committee', 'county', 'congressional_district'
  const [groupFilterValue, setGroupFilterValue] = useState('')
  const [groupFilterOptions, setGroupFilterOptions] = useState([])
  const [selectedRecipients, setSelectedRecipients] = useState([])
  const [groupMessage, setGroupMessage] = useState('')
  const [sendingGroupMessage, setSendingGroupMessage] = useState(false)
  const [groupMessageProgress, setGroupMessageProgress] = useState({ sent: 0, total: 0, failed: [] })
  const [groupMessageComplete, setGroupMessageComplete] = useState(false)
  const [groupMessageThreads, setGroupMessageThreads] = useState([])

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

  // Load members
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

  // Load group filter options when filter type changes
  useEffect(() => {
    if (showGroupComposer && members.length > 0) {
      loadGroupFilterOptions()
    }
  }, [groupFilterType, members, showGroupComposer])

  // Auto-select recipients when filter value changes
  useEffect(() => {
    if (groupFilterValue && groupFilterValue !== 'all') {
      updateSelectedRecipients()
    }
  }, [groupFilterValue, groupFilterType, members])

  // Only auto-scroll if user hasn't scrolled up
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadMembers = async () => {
    setLoadingMembers(true)
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      
      // Parse members data
      const parsedMembers = (data || []).map(member => ({
        ...member,
        phone_e164: member.phone_e164 || member.phone,
        county: parseField(member.county),
        congressional_district: parseField(member.congressional_district || member.district),
        committee: formatCommittees(member.committee)
      }))
      
      setMembers(parsedMembers)
    } catch (err) {
      console.error('Error loading members:', err)
    } finally {
      setLoadingMembers(false)
    }
  }

  // Helper functions for parsing fields
  const parseField = (field) => {
    if (!field) return null
    if (typeof field === 'string') {
      const trimmed = field.trim()
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return field
      }
      try {
        const parsed = JSON.parse(field)
        if (parsed && typeof parsed === 'object' && parsed.name) {
          return parsed.name
        }
        if (Array.isArray(parsed)) {
          return parsed.map(item => 
            (item && typeof item === 'object' && item.name) ? item.name : item
          ).filter(Boolean)
        }
        return field
      } catch {
        return field
      }
    }
    if (field && typeof field === 'object' && field.name) {
      return field.name
    }
    if (Array.isArray(field)) {
      return field.map(item => 
        (item && typeof item === 'object' && item.name) ? item.name : item
      ).filter(Boolean)
    }
    return field
  }

  const formatCommittees = (committees) => {
    if (!committees || !Array.isArray(committees)) return []
    return committees.map(c => parseField(c)).filter(Boolean)
  }

  const loadGroupFilterOptions = () => {
    let options = []
    
    switch (groupFilterType) {
      case 'county':
        options = [...new Set(members.map(m => m.county).filter(Boolean))].sort()
        break
      case 'congressional_district':
        options = [...new Set(members.map(m => m.congressional_district).filter(Boolean))].sort()
        break
      case 'committee':
        const allCommittees = members.flatMap(m => m.committee || [])
        options = [...new Set(allCommittees)].sort()
        break
      default:
        options = []
    }
    
    setGroupFilterOptions(options)
    setGroupFilterValue(options.length > 0 ? options[0] : '')
  }

  const updateSelectedRecipients = () => {
    let filtered = []
    
    switch (groupFilterType) {
      case 'county':
        filtered = members.filter(m => m.county === groupFilterValue && m.phone_e164)
        break
      case 'congressional_district':
        filtered = members.filter(m => m.congressional_district === groupFilterValue && m.phone_e164)
        break
      case 'committee':
        filtered = members.filter(m => m.committee?.includes(groupFilterValue) && m.phone_e164)
        break
      default:
        filtered = []
    }
    
    setSelectedRecipients(filtered)
  }

  const handleSendGroupMessage = async () => {
    if (!groupMessage.trim() || selectedRecipients.length === 0) return
    
    setSendingGroupMessage(true)
    setGroupMessageProgress({ sent: 0, total: selectedRecipients.length, failed: [] })
    setGroupMessageComplete(false)
    
    try {
      const response = await fetch('/api/send-group-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: groupMessage,
          recipients: selectedRecipients.map(r => ({
            id: r.id,
            name: r.name,
            phone: r.phone_e164
          }))
        })
      })
      
      if (!response.ok) throw new Error('Failed to send group message')
      
      const result = await response.json()
      setGroupMessageProgress(result.progress)
      setGroupMessageThreads(result.threads || [])
      setGroupMessageComplete(true)
      setGroupMessage('')
    } catch (err) {
      console.error('Error sending group message:', err)
      setError('Failed to send group message. Please try again.')
    } finally {
      setSendingGroupMessage(false)
    }
  }

  const checkTypingStatus = async () => {
    if (!memberId) return
    
    try {
      const { data: convData } = await supabase
        .from('conversations')
        .select('is_typing, typing_since')
        .eq('member_id', memberId)
        .single()

      if (convData && convData.is_typing) {
        const typingSince = new Date(convData.typing_since)
        const now = new Date()
        const secondsSince = (now - typingSince) / 1000

        if (secondsSince < 10) {
          setIsTyping(true)
        } else {
          setIsTyping(false)
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
      if (msg.associated_message_guid && msg.associated_message_type >= 2000) {
        if (!messageMap[msg.associated_message_guid]) {
          messageMap[msg.associated_message_guid] = { reactions: [] }
        }
        messageMap[msg.associated_message_guid].reactions.push({
          type: msg.associated_message_type,
          direction: msg.direction,
          created_at: msg.created_at
        })
      } else {
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

      if (selectedFile) {
        setUploadingFile(true)
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('phone', phone)
        formData.append('memberId', memberId)
        
        if (message.trim()) {
          formData.append('message', message)
        }

        if (replyingTo) {
          formData.append('replyToGuid', replyingTo.guid)
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

        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        setMessage('')
        setReplyingTo(null)
        setUploadingFile(false)
      } else {
        payload.message = message

        if (replyingTo) {
          payload.replyToGuid = replyingTo.guid
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

        setMessage('')
        setReplyingTo(null)
      }

      await loadMessages()
      scrollToBottom(true)
    } catch (err) {
      console.error('Send message error:', err)
      setError(err.message || 'Failed to send message')
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

      if (!response.ok) throw new Error('Failed to send reaction')

      setShowReactionPicker(null)
      await loadMessages()
    } catch (err) {
      console.error('Reaction error:', err)
    }
  }

  const getReactionEmoji = (reaction) => {
    const reactionType = reaction.type
    const emoji = REACTIONS.find(r => r.code === reactionType)?.emoji
    return reaction.direction === 'outbound' ? '👤' + emoji : emoji
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

  const hasAttachments = (msg) => {
    return msg.body === '\ufffc' || msg.body?.includes('\ufffc') || msg.media_url
  }

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

  // Main Messenger Home - Show two buttons
  if (!phone && !name && !memberId && !showGroupComposer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Messenger</h1>
                <p className="text-sm text-gray-600 mt-1">Send individual or group messages</p>
              </div>
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-2xl w-full space-y-6">
            {/* Compose New Message Button */}
            <button
              onClick={() => {
                // This will load the member selector
                router.push('/messenger')
                loadMembers()
              }}
              className="w-full group relative overflow-hidden bg-white hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-600 border-2 border-blue-200 hover:border-blue-500 rounded-2xl p-8 transition-all duration-300 shadow-lg hover:shadow-2xl transform hover:-translate-y-1"
            >
              <div className="flex items-center gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-blue-100 group-hover:bg-white rounded-2xl flex items-center justify-center transition-colors">
                  <MessageCircle className="h-8 w-8 text-blue-600 group-hover:text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-2xl font-bold text-gray-900 group-hover:text-white transition-colors">
                    Compose New Message
                  </h2>
                  <p className="text-gray-600 group-hover:text-blue-100 mt-2 transition-colors">
                    Send a message to an individual member
                  </p>
                </div>
                <ArrowLeft className="h-6 w-6 text-blue-600 group-hover:text-white rotate-180 transform transition-all" />
              </div>
            </button>

            {/* Compose Group Message Button */}
            <button
              onClick={() => {
                setShowGroupComposer(true)
                if (members.length === 0) {
                  loadMembers()
                }
              }}
              className="w-full group relative overflow-hidden bg-white hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-600 border-2 border-purple-200 hover:border-purple-500 rounded-2xl p-8 transition-all duration-300 shadow-lg hover:shadow-2xl transform hover:-translate-y-1"
            >
              <div className="flex items-center gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-purple-100 group-hover:bg-white rounded-2xl flex items-center justify-center transition-colors">
                  <Users className="h-8 w-8 text-purple-600 group-hover:text-purple-600" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-2xl font-bold text-gray-900 group-hover:text-white transition-colors">
                    Compose Group Message
                  </h2>
                  <p className="text-gray-600 group-hover:text-purple-100 mt-2 transition-colors">
                    Send individual messages to a group by committee, county, or district
                  </p>
                </div>
                <ArrowLeft className="h-6 w-6 text-purple-600 group-hover:text-white rotate-180 transform transition-all" />
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Group Message Composer
  if (showGroupComposer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowGroupComposer(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <div className="border-l border-gray-300 h-6"></div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-600" />
                    Group Message Composer
                  </h1>
                  <p className="text-sm text-gray-600">Send messages to multiple members at once</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            {!groupMessageComplete ? (
              <div className="space-y-6">
                {/* Filter Selection Card */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Search className="h-5 w-5 text-purple-600" />
                    Select Recipients
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Filter Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter By
                      </label>
                      <select
                        value={groupFilterType}
                        onChange={(e) => setGroupFilterType(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 font-medium"
                      >
                        <option value="committee">Committee</option>
                        <option value="county">County</option>
                        <option value="congressional_district">Congressional District</option>
                      </select>
                    </div>

                    {/* Filter Value */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select {groupFilterType === 'committee' ? 'Committee' : groupFilterType === 'county' ? 'County' : 'District'}
                      </label>
                      <select
                        value={groupFilterValue}
                        onChange={(e) => setGroupFilterValue(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 font-medium"
                      >
                        {groupFilterOptions.length === 0 ? (
                          <option value="">No options available</option>
                        ) : (
                          groupFilterOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Recipient Count */}
                  {selectedRecipients.length > 0 && (
                    <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Users className="h-5 w-5 text-purple-600" />
                          <span className="text-sm font-medium text-gray-700">
                            Ready to send to {selectedRecipients.length} member{selectedRecipients.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="mt-2 text-xs text-gray-600">
                        Messages will be sent individually with delays to prevent spam filtering
                      </div>
                    </div>
                  )}
                </div>

                {/* Message Composer Card */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">
                    Compose Message
                  </h2>
                  
                  <textarea
                    value={groupMessage}
                    onChange={(e) => setGroupMessage(e.target.value)}
                    placeholder="Type your message here... This will be sent individually to each member."
                    className="w-full h-40 px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 resize-none"
                    disabled={sendingGroupMessage}
                  />

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {groupMessage.length} characters
                    </div>
                    <button
                      onClick={handleSendGroupMessage}
                      disabled={!groupMessage.trim() || selectedRecipients.length === 0 || sendingGroupMessage}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      {sendingGroupMessage ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Sending... {groupMessageProgress.sent}/{groupMessageProgress.total}
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          Send to {selectedRecipients.length} Member{selectedRecipients.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress Indicator */}
                {sendingGroupMessage && (
                  <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Sending Progress</h3>
                    <div className="space-y-3">
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-purple-600 to-pink-600 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${(groupMessageProgress.sent / groupMessageProgress.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="text-sm text-gray-600 text-center">
                        Sent {groupMessageProgress.sent} of {groupMessageProgress.total} messages
                      </div>
                      {groupMessageProgress.failed.length > 0 && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center gap-2 text-sm text-red-800">
                            <AlertCircle className="h-4 w-4" />
                            Failed to send to {groupMessageProgress.failed.length} recipient(s)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Recipient Preview */}
                {selectedRecipients.length > 0 && !sendingGroupMessage && (
                  <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Recipients ({selectedRecipients.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                      {selectedRecipients.map((recipient) => (
                        <div key={recipient.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-semibold">
                            {recipient.name?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{recipient.name}</div>
                            <div className="text-xs text-gray-500 truncate">{recipient.phone_e164}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Success Screen with Thread Access
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Group Message Sent!</h2>
                  <p className="text-gray-600 mb-4">
                    Successfully sent {groupMessageProgress.sent} messages
                    {groupMessageProgress.failed.length > 0 && ` (${groupMessageProgress.failed.length} failed)`}
                  </p>
                  <button
                    onClick={() => {
                      setGroupMessageComplete(false)
                      setGroupMessage('')
                      setGroupMessageProgress({ sent: 0, total: 0, failed: [] })
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all"
                  >
                    Send Another Group Message
                  </button>
                </div>

                {/* Thread Access */}
                {groupMessageThreads.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Access Conversation Threads</h3>
                    <div className="space-y-2">
                      {groupMessageThreads.map((thread) => (
                        <button
                          key={thread.memberId}
                          onClick={() => router.push(`/messenger?phone=${encodeURIComponent(thread.phone)}&name=${encodeURIComponent(thread.name)}&memberId=${thread.memberId}`)}
                          className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-purple-50 rounded-lg border border-gray-200 hover:border-purple-300 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-semibold">
                              {thread.name?.charAt(0) || '?'}
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-medium text-gray-900">{thread.name}</div>
                              <div className="text-xs text-gray-500">{thread.phone}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-purple-600 group-hover:text-purple-700">
                            <span className="text-sm font-medium">View Thread</span>
                            <ArrowLeft className="h-4 w-4 rotate-180" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Member Selector (for individual messages)
  if (!phone || !name || !memberId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Select a Member</h1>
                <p className="text-sm text-gray-500">Choose who you want to message</p>
              </div>
              <button
                onClick={() => router.push('/messenger')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search members by name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>

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

  // Individual Message Thread Interface
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
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

                    <div className={`flex items-center mt-0.5 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-xs text-gray-500">
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
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => setShowReactionPicker(msg.guid)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        React
                      </button>
                    </div>

                    {showReactionPicker === msg.guid && (
                      <div className="absolute z-10 bg-white rounded-lg shadow-xl p-2 flex gap-2 mt-1 border border-gray-200">
                        {REACTIONS.map((reaction) => (
                          <button
                            key={reaction.type}
                            onClick={() => handleReaction(msg.guid, reaction.type)}
                            className="hover:bg-gray-100 p-2 rounded transition-colors text-xl"
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
      </div>

      {/* Typing Indicator */}
      {isTyping && (
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span>{name} is typing...</span>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {error && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              {error}
            </div>
          )}

          {selectedFile && (
            <div className="mb-2 flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
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