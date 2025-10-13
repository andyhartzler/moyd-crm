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
  const [sendingIntro, setSendingIntro] = useState(false)
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
  const [showMemberSelector, setShowMemberSelector] = useState(false)
  const [groupFilterType, setGroupFilterType] = useState('committee')
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
    return msg.has_attachments || 
           (msg.attachments && msg.attachments.length > 0) ||
           (msg.body && msg.body.includes('\ufffc'))
  }

  const renderAttachment = (msg) => {
    if (!msg.attachments || msg.attachments.length === 0) {
      return <p className="text-sm text-gray-500 italic">Attachment</p>
    }

    return msg.attachments.map((att, idx) => {
      const isImage = att.mime_type?.startsWith('image/')
      const isVideo = att.mime_type?.startsWith('video/')
      
      if (isImage) {
        return (
          <img
            key={idx}
            src={`${process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST}/api/v1/attachment/${att.guid}/download?password=${process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD}`}
            alt="Attachment"
            className="rounded-lg max-w-full h-auto"
          />
        )
      } else if (isVideo) {
        return (
          <video
            key={idx}
            controls
            className="rounded-lg max-w-full h-auto"
            src={`${process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST}/api/v1/attachment/${att.guid}/download?password=${process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD}`}
          />
        )
      } else {
        return (
          <a
            key={idx}
            href={`${process.env.NEXT_PUBLIC_BLUEBUBBLES_HOST}/api/v1/attachment/${att.guid}/download?password=${process.env.NEXT_PUBLIC_BLUEBUBBLES_PASSWORD}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Paperclip className="h-4 w-4" />
            {att.transfer_name || 'Attachment'}
          </a>
        )
      }
    })
  }

  const getStatusIcon = (msg) => {
    if (msg.direction !== 'outbound') return null
    
    if (msg.error || msg.status === 'failed') {
      return <AlertCircle className="h-3 w-3 text-red-500 ml-1" />
    }
    if (msg.status === 'sent' || msg.is_delivered) {
      return <CheckCircle className="h-3 w-3 text-blue-400 ml-1" />
    }
    return <Loader2 className="h-3 w-3 text-gray-400 ml-1 animate-spin" />
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

  // FIXED: Handler for Send Intro button - now shows optimistic UI update
  const handleSendIntro = async () => {
    if (!phone || !memberId) return

    setSendingIntro(true)
    setError(null)

    // Create optimistic message to show in UI immediately
    const optimisticMessage = {
      guid: `temp-intro-${Date.now()}`,
      body: `Hi! Thanks for connecting with MO Young Democrats.\n\nTap the contact card below to save our info.\n\nReply STOP to opt out of future messages.`,
      direction: 'outbound',
      created_at: new Date().toISOString(),
      status: 'sending',
      is_from_me: true,
      has_attachments: true,
      attachments: [{
        transfer_name: 'Missouri Young Democrats.vcf',
        mime_type: 'text/vcard'
      }]
    }

    // Add optimistic message to UI
    setMessages(prev => [...prev, optimisticMessage])
    scrollToBottom(true)

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

      // Wait a bit for BlueBubbles webhook to process, then reload messages
      setTimeout(async () => {
        await loadMessages()
        scrollToBottom(true)
      }, 1500)

    } catch (err) {
      console.error('❌ Send intro error:', err)
      setError(err.message || 'Failed to send intro')
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.guid !== optimisticMessage.guid))
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
    return reaction.direction === 'outbound' ? emoji : `${emoji} (from them)`
  }

  const filteredMembers = members.filter(member =>
    member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.phone_e164?.includes(searchTerm) ||
    member.phone?.includes(searchTerm)
  )

  // Member Selector View
  if (!phone && !memberId && !showGroupComposer) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                <div className="text-left">
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-white transition-colors">
                    Compose New Message
                  </h2>
                  <p className="text-gray-600 group-hover:text-blue-100 transition-colors">
                    Send a message to an individual member
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowGroupComposer(true)
                if (members.length === 0) {
                  loadMembers()
                }
              }}
              className="w-full group relative overflow-hidden bg-white hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 border-2 border-purple-200 hover:border-purple-500 rounded-2xl p-8 transition-all duration-300 shadow-lg hover:shadow-2xl transform hover:-translate-y-1"
            >
              <div className="flex items-center gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-purple-100 group-hover:bg-white rounded-2xl flex items-center justify-center transition-colors">
                  <Users className="h-8 w-8 text-purple-600 group-hover:text-purple-600" />
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-white transition-colors">
                    Send Group Message
                  </h2>
                  <p className="text-gray-600 group-hover:text-purple-100 transition-colors">
                    Send a message to multiple members at once
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Member Selector Modal */}
        {showMemberSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">Select a Member</h2>
                  <button
                    onClick={() => setShowMemberSelector(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
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
        )}
      </div>
    )
  }

  // Group Message Composer
  if (showGroupComposer && !groupMessageComplete) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Group Message</h1>
                <p className="text-sm text-gray-600 mt-1">Send a message to multiple members</p>
              </div>
              <button
                onClick={() => {
                  setShowGroupComposer(false)
                  setGroupMessage('')
                  setSelectedRecipients([])
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            {/* Filter Selection */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Select Recipients</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter By
                  </label>
                  <select
                    value={groupFilterType}
                    onChange={(e) => {
                      setGroupFilterType(e.target.value)
                      setGroupFilterValue('')
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="committee">Committee</option>
                    <option value="county">County</option>
                    <option value="congressional_district">Congressional District</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Value
                  </label>
                  <select
                    value={groupFilterValue}
                    onChange={(e) => setGroupFilterValue(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Choose...</option>
                    <option value="all">All Members</option>
                    {groupFilterOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedRecipients.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-purple-900">
                    {selectedRecipients.length} member{selectedRecipients.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>

            {/* Message Composer */}
            {selectedRecipients.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Compose Message</h2>
                
                <textarea
                  value={groupMessage}
                  onChange={(e) => setGroupMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  disabled={sendingGroupMessage}
                />

                {sendingGroupMessage && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">
                          Sending... {groupMessageProgress.sent} / {groupMessageProgress.total}
                        </p>
                        {groupMessageProgress.failed.length > 0 && (
                          <p className="text-xs text-red-600 mt-1">
                            {groupMessageProgress.failed.length} failed
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleSendGroupMessage}
                    disabled={!groupMessage.trim() || sendingGroupMessage}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
        </div>
      </div>
    )
  }

  // Group Message Success Screen
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
                        <p className="font-medium text-gray-900">{thread.name}</p>
                        <p className="text-sm text-gray-600">{thread.phone}</p>
                      </div>
                    </div>
                    <MessageCircle className="h-5 w-5 text-purple-600 group-hover:text-purple-700" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Individual Message Thread Interface
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
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
              const isOutbound = msg.direction === 'outbound' || msg.is_from_me
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

      {error && (
        <div className="px-4 py-2 max-w-4xl mx-auto w-full">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          {selectedFile && (
            <div className="mb-3 flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <Paperclip className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-900 flex-1 truncate">{selectedFile.name}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-blue-600 hover:text-blue-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {replyingTo && (
            <div className="mb-3 flex items-center gap-2 p-2 bg-gray-100 rounded-lg border border-gray-300">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-700">
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
            
            {/* FIXED: Send Intro Button */}
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