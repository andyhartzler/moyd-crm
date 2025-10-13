'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Paperclip, Image as ImageIcon, X, Send, ArrowLeft, Users, MessageCircle, CheckCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react'

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
  const [sendingIntro, setSendingIntro] = useState(false) // NEW: State for Send Intro button
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
  const [showMemberSelector, setShowMemberSelector] = useState(false) // Track if showing member selector for individual messages
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
    const options = new Set()
    
    members.forEach(member => {
      const value = member[groupFilterType]
      if (value) {
        if (Array.isArray(value)) {
          value.forEach(v => options.add(v))
        } else {
          options.add(value)
        }
      }
    })
    
    setGroupFilterOptions(Array.from(options).sort())
  }

  const updateSelectedRecipients = () => {
    if (groupFilterValue === 'all') {
      setSelectedRecipients(members.filter(m => m.phone_e164))
      return
    }

    const filtered = members.filter(member => {
      const value = member[groupFilterType]
      if (!value) return false
      
      if (Array.isArray(value)) {
        return value.includes(groupFilterValue)
      }
      return value === groupFilterValue
    }).filter(m => m.phone_e164)
    
    setSelectedRecipients(filtered)
  }

  const handleMemberSelect = (member) => {
    router.push(`/messenger?phone=${encodeURIComponent(member.phone_e164)}&name=${encodeURIComponent(member.name)}&memberId=${member.id}`)
  }

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/messages?memberId=${memberId}`)
      if (!response.ok) throw new Error('Failed to load messages')
      
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Load messages error:', err)
    }
  }

  const checkTypingStatus = async () => {
    try {
      const response = await fetch(`/api/typing-status?phone=${encodeURIComponent(phone)}`)
      if (!response.ok) return
      
      const data = await response.json()
      setIsTyping(data.isTyping || false)
    } catch (err) {
      console.error('Typing status error:', err)
    }
  }

  const findMessageByGuid = (guid) => {
    return messages.find(m => m.guid === guid)
  }

  const hasAttachments = (msg) => {
    return msg.attachments && msg.attachments.length > 0
  }

  const getStatusIcon = (msg) => {
    if (msg.direction !== 'outbound') return null
    
    if (msg.error) {
      return <AlertCircle className="h-3 w-3 text-red-500 ml-1" />
    }
    if (msg.date_delivered) {
      return <CheckCircle className="h-3 w-3 text-blue-400 ml-1" />
    }
    return null
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleSendGroupMessage = async () => {
    if (!groupMessage.trim() || selectedRecipients.length === 0) return

    setSendingGroupMessage(true)
    setGroupMessageProgress({ sent: 0, total: selectedRecipients.length, failed: [] })

    const threads = []

    for (let i = 0; i < selectedRecipients.length; i++) {
      const recipient = selectedRecipients[i]
      
      try {
        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: recipient.phone_e164,
            memberId: recipient.id,
            message: groupMessage,
          }),
        })

        if (response.ok) {
          setGroupMessageProgress(prev => ({ ...prev, sent: prev.sent + 1 }))
          threads.push({
            memberId: recipient.id,
            name: recipient.name,
            phone: recipient.phone_e164
          })
        } else {
          setGroupMessageProgress(prev => ({ 
            ...prev, 
            failed: [...prev.failed, { name: recipient.name, phone: recipient.phone_e164 }] 
          }))
        }
      } catch (error) {
        console.error(`Failed to send to ${recipient.name}:`, error)
        setGroupMessageProgress(prev => ({ 
          ...prev, 
          failed: [...prev.failed, { name: recipient.name, phone: recipient.phone_e164 }] 
        }))
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    setSendingGroupMessage(false)
    setGroupMessageComplete(true)
    setGroupMessageThreads(threads)
  }

  // NEW: Handler for Send Intro button
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
      console.log('Intro sent:', result)

      // Reload messages to show the sent intro
      await loadMessages()
      scrollToBottom(true)
    } catch (err) {
      console.error('Send intro error:', err)
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

    try {
      const payload = {
        phone,
        memberId
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

        const response = await fetch('/api/send-message', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to send attachment')
        }

        setSelectedFile(null)
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
    return reaction.direction === 'outbound' ? emoji : `${emoji}👤`
  }

  const renderAttachment = (msg) => {
    if (!msg.attachments || msg.attachments.length === 0) return null

    const attachment = msg.attachments[0]
    const url = `/api/attachments/${attachment.id}`

    if (attachment.mime_type?.startsWith('image/')) {
      return (
        <img 
          src={url} 
          alt="attachment" 
          className="max-w-xs rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(url, '_blank')}
        />
      )
    } else if (attachment.mime_type?.startsWith('video/')) {
      return (
        <video 
          controls 
          className="max-w-xs rounded-lg"
          src={url}
        />
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

  const filteredMembers = members.filter(member =>
    member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.phone_e164?.includes(searchTerm)
  )

  // Main Messenger Home - Show two buttons
  if (!phone && !name && !memberId && !showGroupComposer && !showMemberSelector) {
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
                setShowMemberSelector(true)
                if (members.length === 0) {
                  loadMembers()
                }
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

  // Group Message Composer Interface
  if (showGroupComposer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Group Message Composer</h1>
                <p className="text-sm text-gray-600 mt-1">Select recipients and send individual messages</p>
              </div>
              <button
                onClick={() => setShowGroupComposer(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            {!groupMessageComplete ? (
              <div className="space-y-6">
                {/* Filter Selection */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Select Recipients</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter By
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setGroupFilterType('committee')
                            setGroupFilterValue('')
                            setSelectedRecipients([])
                          }}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            groupFilterType === 'committee'
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Committee
                        </button>
                        <button
                          onClick={() => {
                            setGroupFilterType('county')
                            setGroupFilterValue('')
                            setSelectedRecipients([])
                          }}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            groupFilterType === 'county'
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          County
                        </button>
                        <button
                          onClick={() => {
                            setGroupFilterType('congressional_district')
                            setGroupFilterValue('')
                            setSelectedRecipients([])
                          }}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            groupFilterType === 'congressional_district'
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Congressional District
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select {groupFilterType === 'committee' ? 'Committee' : groupFilterType === 'county' ? 'County' : 'District'}
                      </label>
                      <select
                        value={groupFilterValue}
                        onChange={(e) => setGroupFilterValue(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                      >
                        <option value="">Choose...</option>
                        <option value="all">All Members</option>
                        {groupFilterOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedRecipients.length > 0 && (
                      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <p className="text-sm font-medium text-purple-900 mb-2">
                          Selected: {selectedRecipients.length} member{selectedRecipients.length !== 1 ? 's' : ''}
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {selectedRecipients.slice(0, 10).map((recipient) => (
                            <div key={recipient.id} className="flex items-center gap-2 text-sm text-purple-700">
                              <CheckCircle className="h-4 w-4" />
                              <span>{recipient.name}</span>
                            </div>
                          ))}
                          {selectedRecipients.length > 10 && (
                            <p className="text-sm text-purple-600 italic">
                              ...and {selectedRecipients.length - 10} more
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Preview Recipients - Only show when recipients selected */}
                {selectedRecipients.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      Preview Recipients ({selectedRecipients.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                      {selectedRecipients.map((recipient) => (
                        <div key={recipient.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-semibold text-sm">
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

                {/* Message Composer */}
                {selectedRecipients.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Compose Message</h3>
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
                              <div className="font-medium text-gray-900">{thread.name}</div>
                              <div className="text-sm text-gray-500">{thread.phone}</div>
                            </div>
                          </div>
                          <ArrowLeft className="h-5 w-5 text-gray-400 group-hover:text-purple-600 rotate-180 transition-colors" />
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

  // Member Selector for Individual Messages
  if (showMemberSelector) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Select Member</h1>
                <p className="text-sm text-gray-600 mt-1">Choose a member to message</p>
              </div>
              <button
                onClick={() => setShowMemberSelector(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
        <div className="px-4 py-2 max-w-4xl mx-auto w-full">
          <div className="flex items-center space-x-2 text-gray-500 text-sm">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <span>{name} is typing...</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 max-w-4xl mx-auto w-full">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Message Input Area */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {selectedFile && (
            <div className="mb-2 flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
              <Paperclip className="h-4 w-4 text-gray-600" />
              <span className="text-sm text-gray-700 flex-1 truncate">{selectedFile.name}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-gray-600 hover:text-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {replyingTo && (
            <div className="mb-2 flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border-l-2 border-blue-500">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-900">
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
              disabled={loading || uploadingFile || sendingIntro}
            >
              <Paperclip className="h-5 w-5" />
            </button>
            
            {/* NEW: Send Intro Button */}
            <button
              type="button"
              onClick={handleSendIntro}
              disabled={loading || uploadingFile || sendingIntro}
              className="p-2 text-purple-500 hover:text-purple-700 transition-colors disabled:text-gray-300"
              title="Send intro message with contact card"
            >
              {sendingIntro ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </button>

            <div className="flex-1 bg-gray-100 rounded-full px-4 py-2 flex items-center">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={selectedFile ? "Add a message (optional)" : (replyingTo ? "Reply..." : "iMessage")}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-900 placeholder-gray-500"
                disabled={loading || uploadingFile || sendingIntro}
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
              disabled={loading || uploadingFile || sendingIntro || (!message.trim() && !selectedFile && !replyingTo)}
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