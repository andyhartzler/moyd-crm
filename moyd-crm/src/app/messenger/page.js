'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, Paperclip, Image as ImageIcon, X, Send, ArrowLeft, Users, MessageCircle, CheckCircle, AlertCircle, Loader2, Sparkles, Clock, Home, Ban, Mail, Phone, MapPin, Calendar, Briefcase, GraduationCap, Heart, Globe } from 'lucide-react'

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
  const [sendIntroMode, setSendIntroMode] = useState(false)
  const [groupAttachment, setGroupAttachment] = useState(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [manuallySelectedMembers, setManuallySelectedMembers] = useState(new Set())
  const [selectionMode, setSelectionMode] = useState('filter') // 'filter' or 'manual'
  const [showMemberDetails, setShowMemberDetails] = useState(false)
  const [memberDetails, setMemberDetails] = useState(null)
  const [introSentAt, setIntroSentAt] = useState(null)

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const userScrolledUp = useRef(false)
  const fileInputRef = useRef(null)
  const groupFileInputRef = useRef(null)
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
      loadIntroStatus()
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

  const loadIntroStatus = async () => {
    if (!memberId) return

    try {
      const { data, error } = await supabase
        .from('members')
        .select('intro_sent_at')
        .eq('id', memberId)
        .single()

      if (error) throw error
      setIntroSentAt(data?.intro_sent_at)
    } catch (err) {
      console.error('Error loading intro status:', err)
    }
  }

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
    if (groupFilterType || groupFilterValue || sendIntroMode || manuallySelectedMembers.size > 0 || selectionMode) {
      loadGroupFilterOptions()
      updateSelectedRecipients()
    }
  }, [groupFilterType, groupFilterValue, members, sendIntroMode, manuallySelectedMembers, selectionMode])

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
        if (Array.isArray(parsed)) {
          return parsed.map(item =>
            typeof item === 'object' && item !== null && item.name ? item.name : item
          ).filter(Boolean)
        }
        // Handle single object case - extract name if it exists
        if (typeof parsed === 'object' && parsed !== null && parsed.name) {
          return parsed.name
        }
        return parsed
      } catch {
        return field
      }
    }
    if (Array.isArray(field)) {
      return field.map(item =>
        typeof item === 'object' && item !== null && item.name ? item.name : item
      ).filter(Boolean)
    }
    // Handle single object case - extract name if it exists
    if (typeof field === 'object' && field !== null && field.name) {
      return field.name
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
          if (county && typeof county === 'string') {
            options.add(county)
          }
          break
        case 'district':
          const district = parseJSON(member.congressional_district || member.district)
          if (district && typeof district === 'string') {
            options.add(district)
          }
          break
        case 'committee':
          const committees = parseJSON(member.committee)
          // Handle if committee is an array
          if (Array.isArray(committees)) {
            committees.forEach(c => {
              if (typeof c === 'string') {
                options.add(c)
              }
            })
          } else if (committees && typeof committees === 'string') {
            options.add(committees)
          }
          break
        case 'age':
          if (member.age) options.add(member.age.toString())
          break
        case 'school':
          const school = parseJSON(member.school)
          if (school && typeof school === 'string') {
            options.add(school)
          }
          break
        case 'sexual_orientation':
          const orientation = parseJSON(member.sexual_orientation)
          if (orientation && typeof orientation === 'string') {
            options.add(orientation)
          }
          break
        case 'gender_identity':
          const gender = parseJSON(member.gender_identity)
          if (gender && typeof gender === 'string') {
            options.add(gender)
          }
          break
        case 'disability_status':
          const disability = parseJSON(member.disability_status)
          if (disability && typeof disability === 'string') {
            options.add(disability)
          }
          break
      }
    })

    setGroupFilterOptions([...options].sort())
  }

  const updateSelectedRecipients = () => {
    let filtered = members

    if (selectionMode === 'manual') {
      // Manual mode: only use manually selected members
      if (manuallySelectedMembers.size > 0) {
        filtered = members.filter(m => manuallySelectedMembers.has(m.id) && m.phone_e164)
      } else {
        filtered = []
      }
    } else {
      // Filter mode: use filter-based selection
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
              const committees = parseJSON(m.committee)
              if (Array.isArray(committees)) {
                return committees.includes(groupFilterValue)
              }
              return committees === groupFilterValue
            case 'age':
              return m.age?.toString() === groupFilterValue
            case 'school':
              return parseJSON(m.school) === groupFilterValue
            case 'sexual_orientation':
              return parseJSON(m.sexual_orientation) === groupFilterValue
            case 'gender_identity':
              return parseJSON(m.gender_identity) === groupFilterValue
            case 'disability_status':
              return parseJSON(m.disability_status) === groupFilterValue
            default:
              return true
          }
        })
      }

      // Filter to only members with phone numbers
      filtered = filtered.filter(m => m.phone_e164)
    }

    // 🔥 ALWAYS filter out opted-out members (no messaging to opted-out members)
    filtered = filtered.filter(m => !m.opt_out)

    // If Send Intro mode is enabled, filter to only members without intro_sent_at (applies to both modes)
    if (sendIntroMode) {
      filtered = filtered.filter(m => !m.intro_sent_at)
    }

    setSelectedRecipients(filtered)
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

  const loadMemberDetails = async () => {
    if (!memberId) return

    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberId)
        .single()

      if (error) throw error
      setMemberDetails(data)
      setShowMemberDetails(true)
    } catch (err) {
      console.error('Error loading member details:', err)
    }
  }

  const handleSendGroupMessage = async () => {
    if (sendIntroMode) {
      // Use the send-intro endpoint for intro messages
      if (selectedRecipients.length === 0) return

      setSendingGroupMessage(true)
      setGroupMessageProgress({ sent: 0, total: selectedRecipients.length, failed: [] })

      try {
        const response = await fetch('/api/send-intro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: selectedRecipients.map(r => ({
              phone: r.phone_e164,
              memberId: r.id,
              name: r.name
            }))
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to send intros')
        }

        const result = await response.json()

        // Update progress based on results
        setGroupMessageProgress({
          sent: result.sent || selectedRecipients.length,
          total: selectedRecipients.length,
          failed: result.failed || []
        })

        // Create threads for successful sends
        const threads = selectedRecipients
          .filter(r => !result.failed?.includes(r.name))
          .map(r => ({
            memberId: r.id,
            phone: r.phone_e164,
            name: r.name
          }))

        setGroupMessageThreads(threads)
      } catch (err) {
        console.error('Failed to send intros:', err)
        setGroupMessageProgress(prev => ({
          ...prev,
          failed: selectedRecipients.map(r => r.name)
        }))
      }

      setSendingGroupMessage(false)
      setGroupMessageComplete(true)
    } else {
      // Regular group message or attachment
      if ((!groupMessage.trim() && !groupAttachment) || selectedRecipients.length === 0) return

      setSendingGroupMessage(true)
      setGroupMessageProgress({ sent: 0, total: selectedRecipients.length, failed: [] })

      const threads = []

      for (const recipient of selectedRecipients) {
        try {
          if (groupAttachment) {
            // Send attachment
            const formData = new FormData()
            formData.append('file', groupAttachment)
            formData.append('phone', recipient.phone_e164)
            formData.append('memberId', recipient.id)

            if (groupMessage.trim()) {
              formData.append('message', groupMessage)
            }

            const response = await fetch('/api/send-attachment', {
              method: 'POST',
              body: formData,
            })

            if (!response.ok) throw new Error('Failed to send attachment')
          } else {
            // Send text message
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
          }

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

        // Longer delay for attachments to prevent overwhelming BlueBubbles
        await new Promise(resolve => setTimeout(resolve, groupAttachment ? 6000 : 500))
      }

      setSendingGroupMessage(false)
      setGroupMessageComplete(true)
      setGroupMessageThreads(threads)
    }
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

        console.log('📎 Preparing to send attachment:', {
          fileName: fileToSend.name,
          fileType: fileToSend.type,
          fileSize: fileToSend.size,
          phone,
          memberId,
          hasMessage: !!messageToSend.trim()
        })

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

        console.log('📤 Sending attachment to API...')

        const response = await fetch('/api/send-attachment', {
          method: 'POST',
          body: formData,
        })

        console.log('📬 Attachment response:', response.status, response.statusText)

        if (!response.ok) {
          const errorData = await response.json()
          console.error('❌ Attachment error:', errorData)
          throw new Error(errorData.error || 'Failed to send attachment')
        }

        console.log('✅ Attachment sent successfully')
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
      console.error('❌ Error sending message:', err)
      console.error('❌ Error type:', err.constructor.name)
      console.error('❌ Error message:', err.message)
      setError(err.message || 'Failed to send message')

      // Restore inputs on error
      setMessage(messageToSend)
      setSelectedFile(fileToSend)
      setReplyingTo(replyToSend)
    } finally {
      setLoading(false)
      setUploadingFile(false)
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
          reactionType: reactionType.type,
          reactionToMessageGuid: messageGuid,
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
      return <AlertCircle className="h-3 w-3 text-red-300 ml-1" />
    }
    
    return null
  }

  const renderAttachment = (msg) => {
    // If we have a media URL, show it (image or file)
    if (msg.media_url) {
      const isImage = msg.media_url.includes('.jpg') || msg.media_url.includes('.jpeg') ||
                     msg.media_url.includes('.png') || msg.media_url.includes('.gif') ||
                     msg.media_url.includes('.webp') || msg.media_url.includes('.PNG') ||
                     msg.media_url.includes('.JPG') || msg.media_url.includes('.JPEG')

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

    // Show image placeholder for temp attachments (while waiting for webhook)
    if (msg.body?.startsWith('📷 ')) {
      return (
        <div className="bg-gray-100 rounded-lg p-4 flex items-center gap-3 animate-pulse">
          <ImageIcon className="h-12 w-12 text-gray-400" />
          <div className="flex-1">
            <div className="font-medium text-sm text-gray-700">Image</div>
            <div className="text-xs text-gray-500">{msg.body.replace('📷 ', '')}</div>
            <div className="text-xs text-blue-600 mt-1">Loading preview...</div>
          </div>
        </div>
      )
    }

    // Show file placeholder for temp file attachments
    if (msg.body?.startsWith('📎 ')) {
      return (
        <div className="bg-gray-100 rounded-lg p-3 flex items-center gap-2">
          <Paperclip className="h-5 w-5 text-gray-600" />
          <div className="text-sm text-gray-700">{msg.body.replace('📎 ', '')}</div>
        </div>
      )
    }

    // Only show contact card if explicitly marked OR if it has attachment character but no media URL
    if (msg.is_contact_card || (msg.body === '\ufffc' && !msg.media_url)) {
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

    return null
  }

  // Landing page when no conversation is selected
  if (!phone && !name && !memberId && !showGroupComposer && mode !== 'group') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex justify-end mb-6">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Home className="h-4 w-4" />
              Back to Home
            </button>
          </div>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">Messenger</h1>
            <p className="text-lg text-gray-600">Send individual messages or reach multiple members at once</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Message Individual */}
            <button
              onClick={() => {
                loadMembers()
                router.push('/messenger?mode=select-individual')
              }}
              className="group bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all p-8 border-2 border-transparent hover:border-blue-500"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Message Individual</h2>
              <p className="text-gray-600">
                Start a one-on-one conversation with a member
              </p>
            </button>

            {/* Send Group Message */}
            <button
              onClick={() => {
                setShowGroupComposer(true)
                loadMembers()
              }}
              className="group bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all p-8 border-2 border-transparent hover:border-purple-500"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Users className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Send Group Message</h2>
              <p className="text-gray-600">
                Send messages to multiple members individually (not as a group chat)
              </p>
            </button>
          </div>

          <div className="mt-12 bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">How it works:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong>Individual:</strong> Select a member and start chatting one-on-one</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 mt-0.5">•</span>
                <span><strong>Group:</strong> Messages are sent individually to each recipient (not as a group chat) with spam prevention delays</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span><strong>Smart Delivery:</strong> Automatically sends as iMessage or SMS based on recipient's device</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Individual member selection
  if (mode === 'select-individual' && !memberId) {
    const filteredMembers = members.filter(m =>
      m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.phone_e164?.includes(memberSearch)
    )

    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Select Member</h1>
                <p className="text-sm text-gray-600 mt-1">Choose a member to start a conversation</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/messenger')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Home className="h-4 w-4" />
                  Home
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loadingMembers ? (
              <div className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No members found
              </div>
            ) : (
              <div className="divide-y divide-gray-200 max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredMembers.map(member => (
                  <button
                    key={member.id}
                    onClick={() => {
                      router.push(`/messenger?phone=${member.phone_e164}&name=${member.name}&memberId=${member.id}`)
                    }}
                    className="w-full p-4 hover:bg-gray-50 transition-colors text-left flex items-center gap-4"
                  >
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-semibold text-blue-600">
                        {member.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.phone_e164}</p>
                    </div>
                    <MessageCircle className="h-5 w-5 text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {sendIntroMode ? 'Intro Messages Sent!' : 'Group Message Sent!'}
              </h2>
              <p className="text-gray-600 mb-4">
                Successfully sent {groupMessageProgress.sent} {sendIntroMode ? 'intro messages' : 'messages'}
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
                    setSendIntroMode(false)
                    setGroupAttachment(null)
                    setMemberSearch('')
                    setManuallySelectedMembers(new Set())
                    setGroupFilterType('all')
                    setGroupFilterValue('all')
                    setSelectionMode('filter')
                    router.push('/messenger')
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Back to Messenger
                </button>
                
                {groupMessageThreads.length > 0 && (
                  <button
                    onClick={() => {
                      setGroupMessageComplete(false)
                      setShowGroupComposer(false)
                      setGroupMessage('')
                      setSelectedRecipients([])
                      setSendIntroMode(false)
                      setGroupAttachment(null)
                      setMemberSearch('')
                      setManuallySelectedMembers(new Set())
                      setGroupFilterType('all')
                      setGroupFilterValue('all')
                      setSelectionMode('filter')

                      const firstThread = groupMessageThreads[0]
                      router.push(`/messenger?phone=${encodeURIComponent(firstThread.phone)}&name=${encodeURIComponent(firstThread.name)}&memberId=${firstThread.memberId}`)
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowGroupComposer(false)
                    setGroupMessage('')
                    setSelectedRecipients([])
                    setSendIntroMode(false)
                    setGroupAttachment(null)
                    setMemberSearch('')
                    setManuallySelectedMembers(new Set())
                    setGroupFilterType('all')
                    setGroupFilterValue('all')
                    setSelectionMode('filter')
                    router.push('/messenger')
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Home className="h-4 w-4" />
                  Home
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Selection Mode Choice */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How would you like to select recipients?</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setSelectionMode('filter')
                  setManuallySelectedMembers(new Set())
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectionMode === 'filter'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectionMode === 'filter' ? 'bg-blue-500' : 'bg-gray-200'
                  }`}>
                    <Users className={`h-6 w-6 ${selectionMode === 'filter' ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Select by Filter</p>
                    <p className="text-sm text-gray-600">County, age, committee, etc.</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setSelectionMode('manual')
                  setGroupFilterType('all')
                  setGroupFilterValue('all')
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectionMode === 'manual'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectionMode === 'manual' ? 'bg-purple-500' : 'bg-gray-200'
                  }`}>
                    <Search className={`h-6 w-6 ${selectionMode === 'manual' ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Select Manually</p>
                    <p className="text-sm text-gray-600">Search and pick individuals</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Send Intro Toggle - Available for both modes */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-900">Send Intro Messages</p>
                  <p className="text-sm text-gray-600">
                    {selectionMode === 'filter'
                      ? 'Automatically filters to members who haven\'t received the intro'
                      : 'Only send to selected members who haven\'t received the intro'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSendIntroMode(!sendIntroMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  sendIntroMode ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    sendIntroMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Message Composer - FRONT AND CENTER */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {sendIntroMode ? 'Send Intro Messages' : 'Message'}
            </h3>

            {sendIntroMode ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900 font-medium mb-2">Intro Message Preview:</p>
                <p className="text-sm text-blue-800 italic">
                  "The intro message will be sent automatically using your pre-configured template.
                  This includes the welcome message and contact card."
                </p>
              </div>
            ) : (
              <>
                {/* Attachment preview */}
                {groupAttachment && (
                  <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {groupAttachment.type.startsWith('image/') ? (
                        <ImageIcon className="h-5 w-5 text-gray-600" />
                      ) : (
                        <Paperclip className="h-5 w-5 text-gray-600" />
                      )}
                      <span className="text-sm text-gray-700">{groupAttachment.name}</span>
                      <span className="text-xs text-gray-500">
                        ({(groupAttachment.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      onClick={() => setGroupAttachment(null)}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <textarea
                  value={groupMessage}
                  onChange={(e) => setGroupMessage(e.target.value)}
                  placeholder={groupAttachment ? "Add a caption (optional)..." : "Type your group message here..."}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900"
                />
                <div className="mt-2 flex items-center justify-between">
                  <input
                    type="file"
                    ref={groupFileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setGroupAttachment(file)
                      }
                    }}
                    className="hidden"
                    accept="image/*,video/*,.pdf,.doc,.docx"
                  />
                  <button
                    type="button"
                    onClick={() => groupFileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    <Paperclip className="h-4 w-4" />
                    {groupAttachment ? 'Change File' : 'Attach File'}
                  </button>
                  <p className="text-sm text-gray-600">
                    {groupMessage.length} characters
                  </p>
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-end">
              <button
                onClick={handleSendGroupMessage}
                disabled={(sendIntroMode ? false : (!groupMessage.trim() && !groupAttachment)) || selectedRecipients.length === 0 || sendingGroupMessage}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sendingGroupMessage ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending {groupMessageProgress.sent}/{groupMessageProgress.total}...
                  </>
                ) : (
                  <>
                    {sendIntroMode ? <Sparkles className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                    {sendIntroMode
                      ? `Send Intro to ${selectedRecipients.length} member${selectedRecipients.length !== 1 ? 's' : ''}`
                      : `Send ${groupAttachment ? 'attachment' : 'message'} to ${selectedRecipients.length} recipient${selectedRecipients.length !== 1 ? 's' : ''}`
                    }
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

          {/* Selection UI - AT THE BOTTOM for adjustments */}
          {selectionMode === 'filter' ? (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter Type</label>
                  <select
                    value={groupFilterType}
                    onChange={(e) => {
                      setGroupFilterType(e.target.value)
                      setGroupFilterValue('all')
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    disabled={sendIntroMode}
                  >
                    <option value="all">All Members</option>
                    <option value="county">County</option>
                    <option value="district">Congressional District</option>
                    <option value="committee">Committee</option>
                    <option value="age">Age</option>
                    <option value="school">School</option>
                    <option value="sexual_orientation">Sexual Orientation</option>
                    <option value="gender_identity">Gender Identity</option>
                    <option value="disability_status">Disability Status</option>
                    <option value="opted_in">Opted In Status</option>
                  </select>
                </div>

                {groupFilterType !== 'all' && groupFilterType !== 'opted_in' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Filter Value</label>
                    <select
                      value={groupFilterValue}
                      onChange={(e) => setGroupFilterValue(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    >
                      <option value="all">All Members</option>
                      <option value="Yes">Opted In (Yes)</option>
                      <option value="No">Opted Out (No)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Members Manually</h3>

              {/* Search bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search members by name or phone..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>

              {/* Member list with checkboxes */}
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                {(() => {
                  const searchFiltered = members.filter(m =>
                    (m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
                    m.phone_e164?.includes(memberSearch)) &&
                    m.phone_e164
                  )

                  return searchFiltered.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No members found
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {searchFiltered.map(member => {
                        // Determine if member should be disabled
                        const isOptedOut = member.opt_out
                        const hasIntro = sendIntroMode && member.intro_sent_at
                        const isDisabled = isOptedOut || hasIntro

                        return (
                          <label
                            key={member.id}
                            className={`flex items-center gap-3 p-3 ${
                              isDisabled
                                ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                                : 'hover:bg-gray-50 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={manuallySelectedMembers.has(member.id)}
                              disabled={isDisabled}
                              onChange={(e) => {
                                const newSelected = new Set(manuallySelectedMembers)
                                if (e.target.checked) {
                                  newSelected.add(member.id)
                                } else {
                                  newSelected.delete(member.id)
                                }
                                setManuallySelectedMembers(newSelected)
                              }}
                              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-semibold text-blue-600">
                                {member.name?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-gray-900 truncate">{member.name}</p>

                                {/* Status Badges */}
                                {isOptedOut && (
                                  <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                                    <Ban className="h-3 w-3" />
                                    Opted Out
                                  </span>
                                )}
                                {hasIntro && (
                                  <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                                    <CheckCircle className="h-3 w-3" />
                                    Intro Sent
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 truncate">{member.phone_e164}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <p className="text-gray-600">
                  {manuallySelectedMembers.size} member{manuallySelectedMembers.size !== 1 ? 's' : ''} manually selected
                </p>
                {manuallySelectedMembers.size > 0 && (
                  <button
                    onClick={() => setManuallySelectedMembers(new Set())}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear Selection
                  </button>
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
            <button
              onClick={loadMemberDetails}
              className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              {name || 'Unknown'}
            </button>
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

      {/* Intro Sent Banner */}
      {introSentAt && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                Intro Message Sent
              </p>
              <p className="text-xs text-green-700">
                Sent on {new Date(introSentAt).toLocaleDateString()} at {new Date(introSentAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      )}

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
                <div className={`max-w-xs lg:max-w-md ${isOutbound ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm`}>
                  {showReplyInfo && (
                    <div className="text-xs opacity-70 mb-1 pb-1 border-b border-current/20">
                      Replying to: {messages.find(m => m.guid === msg.thread_originator_guid)?.body?.substring(0, 30)}...
                    </div>
                  )}

                  <div>
                    {msg.media_url || msg.body === '\ufffc' || msg.is_contact_card || msg.body?.startsWith('📷 ') || msg.body?.startsWith('📎 ') ? (
                      <div className="space-y-1">
                        {renderAttachment(msg)}
                        {msg.body && msg.body !== '\ufffc' && !msg.body?.startsWith('📷 ') && !msg.body?.startsWith('📎 ') && (
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

        <form onSubmit={handleSendMessage} className="flex gap-3" noValidate>
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
            autoComplete="off"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 text-gray-900"
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

      {/* Comprehensive Member Details Modal */}
      {showMemberDetails && memberDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowMemberDetails(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-2xl font-bold text-gray-900">Member Details</h3>
              <button
                onClick={() => setShowMemberDetails(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-6 space-y-6">
              {/* Profile Header */}
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                    {memberDetails.name?.charAt(0) || '?'}
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">{memberDetails.name}</h2>
                  <div className="space-y-2">
                    {memberDetails.email && (
                      <div className="flex items-center text-gray-600">
                        <Mail className="h-5 w-5 mr-2 text-gray-400" />
                        <a href={`mailto:${memberDetails.email}`} className="hover:text-blue-600">
                          {memberDetails.email}
                        </a>
                      </div>
                    )}
                    {memberDetails.phone && (
                      <div className="flex items-center text-gray-600">
                        <Phone className="h-5 w-5 mr-2 text-gray-400" />
                        <a href={`tel:${memberDetails.phone}`} className="hover:text-blue-600">
                          {memberDetails.phone}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {memberDetails.opt_out && (
                      <span className="flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                        <Ban className="h-4 w-4" />
                        Opted Out {memberDetails.opt_out_date && `on ${new Date(memberDetails.opt_out_date).toLocaleDateString()}`}
                      </span>
                    )}
                    {memberDetails.intro_sent_at && (
                      <span className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                        <CheckCircle className="h-4 w-4" />
                        Intro Sent {new Date(memberDetails.intro_sent_at).toLocaleDateString()}
                      </span>
                    )}
                    {memberDetails.opt_in_date && !memberDetails.opt_out && (
                      <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                        Opted In {new Date(memberDetails.opt_in_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Location */}
              {(memberDetails.address || memberDetails.county || memberDetails.congressional_district || memberDetails.community_type) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <MapPin className="h-5 w-5 mr-2" />
                    Location
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {memberDetails.address && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Address</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.address}</dd>
                      </div>
                    )}
                    {memberDetails.county && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">County</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.county}</dd>
                      </div>
                    )}
                    {memberDetails.congressional_district && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Congressional District</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.congressional_district}</dd>
                      </div>
                    )}
                    {memberDetails.community_type && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Community Type</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.community_type}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Demographics */}
              {(memberDetails.date_of_birth || memberDetails.preferred_pronouns || memberDetails.gender_identity || memberDetails.race || memberDetails.sexual_orientation || memberDetails.hispanic_latino !== null || memberDetails.languages || memberDetails.disability || memberDetails.religion || memberDetails.zodiac_sign) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    Demographics
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {memberDetails.date_of_birth && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                        <dd className="mt-1 text-sm text-gray-900">{new Date(memberDetails.date_of_birth).toLocaleDateString()}</dd>
                      </div>
                    )}
                    {memberDetails.preferred_pronouns && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Pronouns</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.preferred_pronouns}</dd>
                      </div>
                    )}
                    {memberDetails.gender_identity && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Gender Identity</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.gender_identity}</dd>
                      </div>
                    )}
                    {memberDetails.race && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Race</dt>
                        <dd className="mt-1 text-sm text-gray-900">{Array.isArray(memberDetails.race) ? memberDetails.race.join(', ') : memberDetails.race}</dd>
                      </div>
                    )}
                    {memberDetails.hispanic_latino !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Hispanic/Latino</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.hispanic_latino ? 'Yes' : 'No'}</dd>
                      </div>
                    )}
                    {memberDetails.sexual_orientation && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Sexual Orientation</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.sexual_orientation}</dd>
                      </div>
                    )}
                    {memberDetails.languages && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Languages</dt>
                        <dd className="mt-1 text-sm text-gray-900">{Array.isArray(memberDetails.languages) ? memberDetails.languages.join(', ') : memberDetails.languages}</dd>
                      </div>
                    )}
                    {memberDetails.disability && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Disability</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.disability}</dd>
                      </div>
                    )}
                    {memberDetails.religion && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Religion</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.religion}</dd>
                      </div>
                    )}
                    {memberDetails.zodiac_sign && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Zodiac Sign</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.zodiac_sign}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Education & Employment */}
              {(memberDetails.education_level || memberDetails.in_school || memberDetails.school_name || memberDetails.employed || memberDetails.industry) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <GraduationCap className="h-5 w-5 mr-2" />
                    Education & Employment
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {memberDetails.education_level && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Education Level</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.education_level}</dd>
                      </div>
                    )}
                    {memberDetails.in_school && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Currently in School</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.in_school}</dd>
                      </div>
                    )}
                    {memberDetails.school_name && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">School Name</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.school_name}</dd>
                      </div>
                    )}
                    {memberDetails.employed && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Employed</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.employed}</dd>
                      </div>
                    )}
                    {memberDetails.industry && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Industry</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.industry}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Political Involvement */}
              {(memberDetails.committee || memberDetails.desire_to_lead || memberDetails.hours_per_week || memberDetails.registered_voter !== null || memberDetails.political_experience || memberDetails.current_involvement || memberDetails.leadership_experience || memberDetails.date_joined) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Briefcase className="h-5 w-5 mr-2" />
                    Political Involvement
                  </h4>
                  {memberDetails.committee && memberDetails.committee.length > 0 && (
                    <div className="mb-3">
                      <dt className="text-sm font-medium text-gray-500 mb-2">Committees</dt>
                      <dd className="flex flex-wrap gap-2">
                        {memberDetails.committee.map((comm, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {comm}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {memberDetails.desire_to_lead && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Desire to Lead</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.desire_to_lead}</dd>
                      </div>
                    )}
                    {memberDetails.hours_per_week && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Hours Per Week</dt>
                        <dd className="mt-1 text-sm text-gray-900">{Array.isArray(memberDetails.hours_per_week) ? memberDetails.hours_per_week.join(', ') : memberDetails.hours_per_week}</dd>
                      </div>
                    )}
                    {memberDetails.registered_voter !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Registered Voter</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.registered_voter ? 'Yes' : 'No'}</dd>
                      </div>
                    )}
                    {memberDetails.political_experience && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Political Experience</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.political_experience}</dd>
                      </div>
                    )}
                    {memberDetails.current_involvement && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Current Involvement</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.current_involvement}</dd>
                      </div>
                    )}
                    {memberDetails.leadership_experience && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Leadership Experience</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.leadership_experience}</dd>
                      </div>
                    )}
                    {memberDetails.date_joined && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Date Joined</dt>
                        <dd className="mt-1 text-sm text-gray-900">{new Date(memberDetails.date_joined).toLocaleDateString()}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Interests & Goals */}
              {(memberDetails.why_join || memberDetails.passionate_issues || memberDetails.why_issues_matter || memberDetails.areas_of_interest || memberDetails.goals_and_ambitions || memberDetails.qualified_experience || memberDetails.referral_source) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Heart className="h-5 w-5 mr-2" />
                    Interests & Goals
                  </h4>
                  <dl className="space-y-3">
                    {memberDetails.why_join && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Why Join</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.why_join}</dd>
                      </div>
                    )}
                    {memberDetails.passionate_issues && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Passionate Issues</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.passionate_issues}</dd>
                      </div>
                    )}
                    {memberDetails.why_issues_matter && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Why Issues Matter</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.why_issues_matter}</dd>
                      </div>
                    )}
                    {memberDetails.areas_of_interest && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Areas of Interest</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.areas_of_interest}</dd>
                      </div>
                    )}
                    {memberDetails.goals_and_ambitions && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Goals and Ambitions</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.goals_and_ambitions}</dd>
                      </div>
                    )}
                    {memberDetails.qualified_experience && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Qualified Experience</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.qualified_experience}</dd>
                      </div>
                    )}
                    {memberDetails.referral_source && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Referral Source</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.referral_source}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Social Media & Other */}
              {(memberDetails.instagram || memberDetails.tiktok || memberDetails.x || memberDetails.accommodations || memberDetails.notes || memberDetails.opt_out_reason) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Globe className="h-5 w-5 mr-2" />
                    Additional Information
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {memberDetails.instagram && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Instagram</dt>
                        <dd className="mt-1 text-sm text-gray-900">@{memberDetails.instagram}</dd>
                      </div>
                    )}
                    {memberDetails.tiktok && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">TikTok</dt>
                        <dd className="mt-1 text-sm text-gray-900">@{memberDetails.tiktok}</dd>
                      </div>
                    )}
                    {memberDetails.x && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">X (Twitter)</dt>
                        <dd className="mt-1 text-sm text-gray-900">@{memberDetails.x}</dd>
                      </div>
                    )}
                    {memberDetails.accommodations && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Accommodations</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.accommodations}</dd>
                      </div>
                    )}
                    {memberDetails.notes && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Notes</dt>
                        <dd className="mt-1 text-sm text-gray-900">{memberDetails.notes}</dd>
                      </div>
                    )}
                    {memberDetails.opt_out_reason && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Opt-Out Reason</dt>
                        <dd className="mt-1 text-sm text-gray-900 text-red-700">{memberDetails.opt_out_reason}</dd>
                      </div>
                    )}
                    {memberDetails.last_contacted && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Last Contacted</dt>
                        <dd className="mt-1 text-sm text-gray-900">{new Date(memberDetails.last_contacted).toLocaleDateString()}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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