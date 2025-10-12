'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { MessageSquare, User, Clock, Filter } from 'lucide-react'
import Link from 'next/link'

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    loadConversations()
  }, [statusFilter])

  async function loadConversations() {
    setLoading(true)
    try {
      let query = supabase
        .from('conversations')
        .select(`
          *,
          member:members(id, name, phone, county),
          messages(id, body, direction, created_at, read)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query

      if (error) throw error

      // Process conversations to add unread count
      const processedConversations = data.map(conv => ({
        ...conv,
        unreadCount: conv.messages?.filter(
          m => m.direction === 'inbound' && !m.read
        ).length || 0,
        lastMessage: conv.messages?.[conv.messages.length - 1]
      }))

      setConversations(processedConversations)
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Conversations</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage all your member conversations
            </p>
          </div>
          
          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Conversations List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading conversations...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No conversations</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter === 'all' 
                ? 'Get started by sending a message to a member'
                : `No ${statusFilter} conversations found`}
            </p>
            <div className="mt-6">
              <Link
                href="/messenger"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <MessageSquare className="mr-2 h-5 w-5" />
                Send a Message
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <ul className="divide-y divide-gray-200">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/messenger?conversation=${conversation.id}`}
                    className="block hover:bg-gray-50 transition-colors"
                  >
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0 flex-1">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-6 w-6 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4 flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {conversation.member?.name || 'Unknown Member'}
                              </p>
                              {conversation.unreadCount > 0 && (
                                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {conversation.unreadCount} new
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center text-sm text-gray-500">
                              <span className="truncate">
                                {conversation.member?.phone || 'No phone'}
                              </span>
                              {conversation.member?.county && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>{conversation.member.county}</span>
                                </>
                              )}
                            </div>
                            {conversation.lastMessage && (
                              <p className="mt-1 text-sm text-gray-600 truncate">
                                {conversation.lastMessage.direction === 'outbound' && 'You: '}
                                {conversation.lastMessage.body}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="ml-4 flex-shrink-0 flex items-center space-x-4">
                          <div className="text-right">
                            <div className="flex items-center text-sm text-gray-500">
                              <Clock className="mr-1 h-4 w-4" />
                              {conversation.last_message_at
                                ? format(new Date(conversation.last_message_at), 'MMM d, h:mm a')
                                : 'No messages'}
                            </div>
                            <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              conversation.status === 'active' ? 'bg-green-100 text-green-800' :
                              conversation.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
                              conversation.status === 'resolved' ? 'bg-gray-100 text-gray-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {conversation.status || 'unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}