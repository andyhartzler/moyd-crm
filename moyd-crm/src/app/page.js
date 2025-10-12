'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Users, Send, Calendar } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalMessages: 0,
    activeConversations: 0,
    messagesToday: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const { count: memberCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })

      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })

      const { count: activeCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count: todayCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())

      setStats({
        totalMembers: memberCount || 0,
        totalMessages: messageCount || 0,
        activeConversations: activeCount || 0,
        messagesToday: todayCount || 0,
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Navigation />
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Navigation />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
          
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              name="Total Members"
              value={stats.totalMembers}
              icon={Users}
              color="bg-blue-500"
            />
            <StatCard 
              name="Total Messages"
              value={stats.totalMessages}
              icon={MessageSquare}
              color="bg-green-500"
            />
            <StatCard 
              name="Active Conversations"
              value={stats.activeConversations}
              icon={Send}
              color="bg-purple-500"
            />
            <StatCard 
              name="Messages Today"
              value={stats.messagesToday}
              icon={Calendar}
              color="bg-orange-500"
            />
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Link
                href="/messenger"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg shadow text-center font-medium transition"
              >
                Open Messenger
              </Link>
              <Link
                href="/members"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-lg shadow text-center font-medium transition"
              >
                View Members
              </Link>
              <Link
                href="/conversations"
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-4 rounded-lg shadow text-center font-medium transition"
              >
                All Conversations
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ name, value, icon: Icon, color }) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 ${color} rounded-md p-3`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {name}
              </dt>
              <dd className="text-3xl font-semibold text-gray-900">
                {value}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )}