'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { format, isToday, isYesterday } from 'date-fns'
import { MessageSquare, Search } from 'lucide-react'
import Link from 'next/link'

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadConversations()
    
    // Poll for updates every 3 seconds
    const interval = setInterval(loadConversations, 3000)
    return () => clearInterval(interval)
  }, [])

  async function loadConversations() {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          member:member_id(id, name, phone, phone_e164, county),
          messages(id, body, direction, created_at, is_read)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (error) throw error

      // Process conversations
      const processedConversations = data.map(conv => {
        let member = conv.member
        if (typeof member === 'string') {
          try {
            member = JSON.parse(member)
          } catch (e) {
            member = null
          }
        }

        // Get last message
        const sortedMessages = (conv.messages || []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        )
        const lastMessage = sortedMessages[0]

        return {
          ...conv,
          member,
          unreadCount: conv.messages?.filter(
            m => m.direction === 'inbound' && !m.is_read
          ).length || 0,
          lastMessage
        }
      })

      setConversations(processedConversations)
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    
    if (isToday(date)) {
      return format(date, 'h:mm a')
    } else if (isYesterday(date)) {
      return 'Yesterday'
    } else {
      return format(date, 'M/d/yy')
    }
  }

  const filteredConversations = conversations.filter(conv => {
    const member = conv.member
    const name = member?.name?.toLowerCase() || ''
    const phone = member?.phone?.toLowerCase() || ''
    const search = searchTerm.toLowerCase()
    
    return name.includes(search) || phone.includes(search)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 py-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Messages</h1>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Conversations List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12 bg-white">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-base font-medium text-gray-900">No conversations</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'No results found' : 'Start messaging a member'}
            </p>
            {!searchTerm && (
              <div className="mt-6">
                <Link
                  href="/messenger"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  New Message
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white divide-y divide-gray-100">
            {filteredConversations.map((conversation) => {
              const member = conversation.member
              const memberName = member?.name || 'Unknown'
              const memberPhone = member?.phone_e164 || member?.phone || ''
              const memberId = member?.id

              const hasAttachment = conversation.lastMessage?.body === '\ufffc' || 
                                   conversation.lastMessage?.body?.includes('\ufffc')

              return (
                <Link
                  key={conversation.id}
                  href={`/messenger?phone=${encodeURIComponent(memberPhone)}&name=${encodeURIComponent(memberName)}&memberId=${memberId}`}
                  className="block hover:bg-gray-50 transition-colors active:bg-gray-100"
                >
                  <div className="px-4 py-3">
                    <div className="flex items-start space-x-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                          {memberName.charAt(0).toUpperCase()}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-1">
                          <h3 className={`text-sm font-semibold truncate ${
                            conversation.unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'
                          }`}>
                            {memberName}
                          </h3>
                          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                            {formatTime(conversation.last_message_at)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <p className={`text-sm truncate ${
                            conversation.unreadCount > 0 ? 'font-medium text-gray-900' : 'text-gray-500'
                          }`}>
                            {conversation.lastMessage ? (
                              <>
                                {conversation.lastMessage.direction === 'outbound' && (
                                  <span className="text-gray-400">You: </span>
                                )}
                                {hasAttachment ? '📎 Attachment' : conversation.lastMessage.body}
                              </>
                            ) : (
                              <span className="text-gray-400 italic">No messages yet</span>
                            )}
                          </p>
                          
                          {conversation.unreadCount > 0 && (
                            <div className="ml-2 flex-shrink-0">
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold">
                                {conversation.unreadCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}