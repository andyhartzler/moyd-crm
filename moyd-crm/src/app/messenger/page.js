// ENHANCED VERSION - moyd-crm/src/app/messenger/page.js
// Original file: ~650 lines | Enhanced file: ~850 lines
// 
// MAJOR CHANGES:
// Lines 1-50: Added group messaging state and modal
// Lines 100-250: New landing page UI with "New Message" and "New Group Message" buttons
// Lines 300-450: Group message modal with district/committee/county selection
// Lines 500-600: Rate-limited batch message sending to avoid spam detection
// Lines 700-850: All original messaging functionality preserved

'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Paperclip, Image as ImageIcon, X, Send, Users, MessageSquare, MapPin, Briefcase, Building2 } from 'lucide-react'

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

  // NEW: Group messaging state
  const [showGroupMessageModal, setShowGroupMessageModal] = useState(false)
  const [showNewMessageModal, setShowNewMessageModal] = useState(false)
  const [groupMessageType, setGroupMessageType] = useState('district') // district, committee, county
  const [selectedGroups, setSelectedGroups] = useState([])
  const [groupMessage, setGroupMessage] = useState('')
  const [availableGroups, setAvailableGroups] = useState([])
  const [sendingGroupMessage, setSendingGroupMessage] = useState(false)
  const [groupMessageProgress, setGroupMessageProgress] = useState({ sent: 0, total: 0 })

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
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    userScrolledUp.current = !isAtBottom
  }

  // Load members for individual messages
  useEffect(() => {
    if (!phone && !name) {
      loadMembers()
    }
  }, [phone, name])

  async function loadMembers() {
    setLoadingMembers(true)
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, name, phone, phone_e164')
        .order('name')

      if (error) throw error
      setMembers(data || [])
    } catch (error) {
      console.error('Error loading members:', error)
    } finally {
      setLoadingMembers(false)
    }
  }

  // NEW: Load available groups based on type
  async function loadAvailableGroups(type) {
    try {
      const { data, error } = await supabase
        .from('members')
        .select(type === 'district' ? 'congressional_district' : type === 'county' ? 'county' : 'committee')
        .not(type === 'district' ? 'congressional_district' : type === 'county' ? 'county' : 'committee', 'is', null)

      if (error) throw error

      const fieldName = type === 'district' ? 'congressional_district' : type === 'county' ? 'county' : 'committee'
      const groups = [...new Set(
        data
          .map(item => parseGroupField(item[fieldName]))
          .flat()
          .filter(Boolean)
      )].sort()

      setAvailableGroups(groups)
    } catch (error) {
      console.error('Error loading groups:', error)
    }
  }

  // Helper to parse group fields (handles JSON)
  function parseGroupField(field) {
    if (!field) return null
    if (typeof field === 'string') {
      if (field.trim().startsWith('{') || field.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(field)
          if (Array.isArray(parsed)) {
            return parsed.map(item => typeof item === 'object' && item.name ? item.name : item).filter(Boolean)
          }
          if (parsed && typeof parsed === 'object' && parsed.name) {
            return parsed.name
          }
          return field
        } catch {
          return field
        }
      }
      return field
    }
    if (Array.isArray(field)) {
      return field.map(item => typeof item === 'object' && item.name ? item.name : item).filter(Boolean)
    }
    if (field && typeof field === 'object' && field.name) {
      return field.name
    }
    return field
  }

  // NEW: Send group messages with rate limiting
  async function handleSendGroupMessage() {
    if (!groupMessage.trim() || selectedGroups.length === 0) return
    if (sendingGroupMessage) return

    setSendingGroupMessage(true)
    setGroupMessageProgress({ sent: 0, total: 0 })

    try {
      // Get members matching selected groups
      const fieldName = groupMessageType === 'district' ? 'congressional_district' : 
                       groupMessageType === 'county' ? 'county' : 'committee'

      const { data: allMembers, error } = await supabase
        .from('members')
        .select('id, name, phone_e164, ' + fieldName)
        .not('phone_e164', 'is', null)

      if (error) throw error

      // Filter members that match selected groups
      const targetMembers = allMembers.filter(member => {
        const memberValue = parseGroupField(member[fieldName])
        if (Array.isArray(memberValue)) {
          return memberValue.some(val => selectedGroups.includes(val))
        }
        return selectedGroups.includes(memberValue)
      })

      if (targetMembers.length === 0) {
        alert('No members found matching the selected criteria.')
        setSendingGroupMessage(false)
        return
      }

      setGroupMessageProgress({ sent: 0, total: targetMembers.length })

      // Send messages with rate limiting (1 message per 3 seconds to avoid spam detection)
      for (let i = 0; i < targetMembers.length; i++) {
        const member = targetMembers[i]
        
        try {
          const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: member.phone_e164,
              message: groupMessage,
              memberId: member.id
            })
          })

          if (!response.ok) {
            console.error(`Failed to send to ${member.name}`)
          }

          setGroupMessageProgress({ sent: i + 1, total: targetMembers.length })

          // Wait 3 seconds between messages (except for the last one)
          if (i < targetMembers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        } catch (error) {
          console.error(`Error sending to ${member.name}:`, error)
        }
      }

      alert(`Group message sent to ${targetMembers.length} members!`)
      setShowGroupMessageModal(false)
      setGroupMessage('')
      setSelectedGroups([])
      setGroupMessageProgress({ sent: 0, total: 0 })
    } catch (error) {
      console.error('Error sending group message:', error)
      alert('Error sending group messages. Please try again.')
    } finally {
      setSendingGroupMessage(false)
    }
  }

  // Load messages when we have a conversation
  useEffect(() => {
    if (!memberId) return

    loadMessages()
    const interval = setInterval(loadMessages, 2000)
    pollIntervalRef.current = interval
    return () => clearInterval(interval)
  }, [memberId])

  async function loadMessages() {
    if (!memberId) return
    
    try {
      const response = await fetch(`/api/messages?memberId=${memberId}`)
      const data = await response.json()
      
      if (data.messages) {
        setMessages(data.messages)
        scrollToBottom()
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault()
    if ((!message.trim() && !selectedFile && !replyingTo) || loading) return

    const messageToSend = message
    const fileToSend = selectedFile
    const replyTo = replyingTo

    setMessage('')
    setSelectedFile(null)
    setReplyingTo(null)
    setLoading(true)
    setError(null)

    try {
      let attachmentGuid = null
      
      if (fileToSend) {
        const formData = new FormData()
        formData.append('file', fileToSend)
        formData.append('phone', phone)
        formData.append('name', name)

        const uploadResponse = await fetch('/api/upload-attachment', {
          method: 'POST',
          body: formData
        })

        if (!uploadResponse.ok) throw new Error('Failed to upload attachment')
        
        const uploadData = await uploadResponse.json()
        attachmentGuid = uploadData.guid
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      if (messageToSend.trim() || replyTo) {
        const payload = {
          phone,
          message: messageToSend,
          memberId
        }

        if (replyTo) {
          payload.replyToGuid = replyTo.guid
          payload.partIndex = replyTo.part_index || 0
        }

        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to send message')
        }
      }

      await loadMessages()
      scrollToBottom(true)
    } catch (error) {
      console.error('Send error:', error)
      setError(error.message)
      setMessage(messageToSend)
      setSelectedFile(fileToSend)
      setReplyingTo(replyTo)
    } finally {
      setLoading(false)
    }
  }

  async function handleReaction(messageToReact, reactionType) {
    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          memberId,
          reaction: reactionType,
          replyToGuid: messageToReact.guid,
          partIndex: messageToReact.part_index || 0
        })
      })

      if (!response.ok) throw new Error('Failed to send reaction')
      
      setShowReactionPicker(null)
      await loadMessages()
    } catch (error) {
      console.error('Reaction error:', error)
      alert('Failed to send reaction')
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        alert('File size must be less than 10MB')
        return
      }
      setSelectedFile(file)
    }
  }

  function handleMemberSelect(member) {
    router.push(`/messenger?phone=${encodeURIComponent(member.phone_e164)}&name=${encodeURIComponent(member.name)}&memberId=${member.id}`)
  }

  const filteredMembers = members.filter(member => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      member.name?.toLowerCase().includes(search) ||
      member.phone?.includes(search) ||
      member.phone_e164?.includes(search)
    )
  })

  function formatTimestamp(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now - date) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (diffInHours < 48) {
      return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + 
             date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
  }

  function hasAttachments(msg) {
    return msg.body === '\ufffc' || msg.body?.includes('\ufffc')
  }

  function getAttachmentDisplay(msg) {
    if (!msg.attachment_url) return null

    const url = msg.attachment_url
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
    const isVideo = /\.(mp4|mov|avi)$/i.test(url)

    if (isImage) {
      return (
        <img 
          src={url} 
          alt="attachment" 
          className="max-w-xs rounded-lg cursor-pointer hover:opacity-90"
          onClick={() => window.open(url, '_blank')}
        />
      )
    } else if (isVideo) {
      return (
        <video 
          src={url} 
          controls 
          className="max-w-xs rounded-lg"
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

  // NEW: Landing page UI when no conversation selected
  if (!phone || !name || !memberId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">Messenger</h1>
            <p className="text-xl text-gray-600">Send individual or group messages to your members</p>
          </div>

          {/* Main Action Cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* New Message Card */}
            <button
              onClick={() => setShowNewMessageModal(true)}
              className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-2 border-transparent hover:border-blue-500"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl group-hover:scale-110 transition-transform">
                  <MessageSquare className="h-12 w-12 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">New Message</h2>
                <p className="text-gray-600 text-lg">Send a personal message to an individual member</p>
              </div>
            </button>

            {/* Group Message Card */}
            <button
              onClick={() => setShowGroupMessageModal(true)}
              className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 border-2 border-transparent hover:border-purple-500"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-2xl group-hover:scale-110 transition-transform">
                  <Users className="h-12 w-12 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Group Message</h2>
                <p className="text-gray-600 text-lg">Send messages by district, committee, or county</p>
              </div>
            </button>
          </div>

          {/* Info Section */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Group Messaging Guidelines</h3>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start">
                <span className="text-green-500 mr-3 text-xl">✓</span>
                <span>Group messages are sent as individual messages to each recipient to avoid spam detection</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-3 text-xl">✓</span>
                <span>Messages are rate-limited (3 seconds between each) to ensure delivery</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-3 text-xl">✓</span>
                <span>You can send to multiple groups at once (e.g., multiple districts or committees)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* NEW: Group Message Modal */}
        {showGroupMessageModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Send Group Message</h2>
                  <button
                    onClick={() => {
                      setShowGroupMessageModal(false)
                      setGroupMessage('')
                      setSelectedGroups([])
                      setGroupMessageProgress({ sent: 0, total: 0 })
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    disabled={sendingGroupMessage}
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Group Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Send To:</label>
                  <div className="grid grid-cols-3 gap-4">
                    <button
                      onClick={() => {
                        setGroupMessageType('district')
                        loadAvailableGroups('district')
                        setSelectedGroups([])
                      }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        groupMessageType === 'district'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={sendingGroupMessage}
                    >
                      <MapPin className={`h-6 w-6 mx-auto mb-2 ${groupMessageType === 'district' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className="text-sm font-medium">Congressional District</span>
                    </button>
                    <button
                      onClick={() => {
                        setGroupMessageType('committee')
                        loadAvailableGroups('committee')
                        setSelectedGroups([])
                      }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        groupMessageType === 'committee'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={sendingGroupMessage}
                    >
                      <Briefcase className={`h-6 w-6 mx-auto mb-2 ${groupMessageType === 'committee' ? 'text-purple-600' : 'text-gray-400'}`} />
                      <span className="text-sm font-medium">Committee</span>
                    </button>
                    <button
                      onClick={() => {
                        setGroupMessageType('county')
                        loadAvailableGroups('county')
                        setSelectedGroups([])
                      }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        groupMessageType === 'county'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={sendingGroupMessage}
                    >
                      <Building2 className={`h-6 w-6 mx-auto mb-2 ${groupMessageType === 'county' ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className="text-sm font-medium">County</span>
                    </button>
                  </div>
                </div>

                {/* Group Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select {groupMessageType === 'district' ? 'Districts' : groupMessageType === 'committee' ? 'Committees' : 'Counties'}:
                  </label>
                  <div className="border border-gray-300 rounded-lg p-4 max-h-60 overflow-y-auto">
                    {availableGroups.map(group => (
                      <label key={group} className="flex items-center py-2 hover:bg-gray-50 px-2 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedGroups.includes(group)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedGroups([...selectedGroups, group])
                            } else {
                              setSelectedGroups(selectedGroups.filter(g => g !== group))
                            }
                          }}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          disabled={sendingGroupMessage}
                        />
                        <span className="ml-3 text-sm text-gray-900">{group}</span>
                      </label>
                    ))}
                  </div>
                  {selectedGroups.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600">
                      {selectedGroups.length} {groupMessageType === 'district' ? 'district(s)' : groupMessageType === 'committee' ? 'committee(s)' : 'count(ies)'} selected
                    </p>
                  )}
                </div>

                {/* Message Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message:</label>
                  <textarea
                    value={groupMessage}
                    onChange={(e) => setGroupMessage(e.target.value)}
                    placeholder="Type your group message here..."
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    disabled={sendingGroupMessage}
                  />
                </div>

                {/* Progress Bar */}
                {sendingGroupMessage && groupMessageProgress.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Sending messages...</span>
                      <span>{groupMessageProgress.sent} / {groupMessageProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(groupMessageProgress.sent / groupMessageProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Send Button */}
                <button
                  onClick={handleSendGroupMessage}
                  disabled={!groupMessage.trim() || selectedGroups.length === 0 || sendingGroupMessage}
                  className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {sendingGroupMessage ? 'Sending...' : 'Send Group Message'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NEW: Individual Message Modal */}
        {showNewMessageModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Select a Member</h2>
                  <button
                    onClick={() => setShowNewMessageModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Search */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <input
                      type="text"
                      placeholder="Search members by name or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  <div className="text-center py-12">
                    <p className="text-gray-500">No members found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => {
                          handleMemberSelect(member)
                          setShowNewMessageModal(false)
                        }}
                        className="w-full text-left px-4 py-4 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200"
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
                          <div className="text-sm text-blue-600 font-medium">
                            Message →
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ==================== ORIGINAL MESSAGING INTERFACE (PRESERVED) ====================
  // All original messaging functionality below this line remains unchanged
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => window.history.back()}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-base font-semibold text-gray-900">{name}</h1>
                <p className="text-xs text-gray-500">{phone}</p>
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
            <div className="text-center py-12">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-gray-500">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isOutbound = msg.direction === 'outbound'
              const isReply = msg.thread_originator_guid
              const replyToMessage = isReply ? messages.find(m => m.guid === msg.thread_originator_guid) : null

              return (
                <div
                  key={msg.id || idx}
                  className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group`}
                >
                  <div className={`max-w-xs lg:max-w-md ${isOutbound ? 'order-2' : 'order-1'}`}>
                    {isReply && replyToMessage && (
                      <div className={`text-xs mb-1 px-3 py-1 bg-gray-100 rounded ${isOutbound ? 'ml-auto' : ''}`} style={{ maxWidth: '90%' }}>
                        <p className="text-gray-500 font-medium">
                          Replying to {replyToMessage.direction === 'outbound' ? 'yourself' : name}
                        </p>
                        <p className="text-gray-700 truncate">
                          {hasAttachments(replyToMessage) ? '📎 Attachment' : replyToMessage.body}
                        </p>
                      </div>
                    )}

                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        isOutbound
                          ? 'bg-blue-500 text-white rounded-br-sm'
                          : 'bg-gray-200 text-gray-900 rounded-bl-sm'
                      } break-words`}
                    >
                      {hasAttachments(msg) ? (
                        getAttachmentDisplay(msg)
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      )}
                      
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {msg.reactions.map((reaction, rIdx) => (
                            <span key={rIdx} className="text-xs bg-white bg-opacity-20 px-2 py-0.5 rounded-full">
                              {REACTIONS.find(r => r.code === reaction.type)?.emoji || '❤️'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`text-xs text-gray-500 mt-1 px-2 ${isOutbound ? 'text-right' : 'text-left'}`}>
                      {formatTimestamp(msg.created_at)}
                    </div>

                    {/* Message actions */}
                    <div className={`flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <button
                        onClick={() => setReplyingTo(msg)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => setShowReactionPicker(msg.id)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
                      >
                        React
                      </button>
                    </div>

                    {showReactionPicker === msg.id && (
                      <div className="absolute z-10 bg-white shadow-lg rounded-lg p-2 flex gap-2 mt-1">
                        {REACTIONS.map((reaction) => (
                          <button
                            key={reaction.type}
                            onClick={() => handleReaction(msg, reaction.type)}
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
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {error && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error}
            </div>
          )}

          {selectedFile && (
            <div className="mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
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