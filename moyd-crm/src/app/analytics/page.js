'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'
import { TrendingUp, TrendingDown, Users, Send, UserX, UserCheck, Calendar, BarChart3, RefreshCw } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [timeframe, setTimeframe] = useState('30') // days
  const [error, setError] = useState(null)

  useEffect(() => {
    loadAnalytics()
  }, [timeframe])

  const loadAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/analytics?timeframe=${timeframe}`)
      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error('Error loading analytics:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
            <button
              onClick={loadAnalytics}
              className="mt-2 text-red-600 hover:text-red-800 font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-2">Track intro messages, opt-outs, and engagement</p>
          </div>
          
          <div className="flex gap-3">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            
            <button
              onClick={loadAnalytics}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Intros Sent"
            value={data?.summary?.totalIntrosSent || 0}
            icon={Send}
            color="blue"
            change={data?.summary?.successRate}
            changeLabel="success rate"
          />
          <StatCard
            title="Active Members"
            value={data?.summary?.totalActiveMembers || 0}
            icon={Users}
            color="green"
          />
          <StatCard
            title="Opted Out"
            value={data?.summary?.currentOptedOut || 0}
            icon={UserX}
            color="red"
            change={data?.summary?.optOutRate}
            changeLabel="of recipients"
          />
          <StatCard
            title="Opted Back In"
            value={data?.summary?.optInsCount || 0}
            icon={UserCheck}
            color="purple"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Intros Sent Over Time */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Intros Sent Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data?.charts?.introsByDay || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Opt-Outs vs Opt-Ins */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Opt-Outs vs Opt-Ins</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data?.charts?.optOutsByDay || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="opt_out" fill="#EF4444" name="Opt-Outs" />
                <Bar dataKey="opt_in" fill="#10B981" name="Opt-Ins" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Intros */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Intros Sent</h2>
            <div className="space-y-3">
              {data?.recent?.intros?.length > 0 ? (
                data.recent.intros.map((intro) => (
                  <div key={intro.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{intro.members?.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-600">{intro.members?.phone_e164}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{new Date(intro.sent_at).toLocaleDateString()}</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        intro.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {intro.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No recent intros</p>
              )}
            </div>
          </div>

          {/* Recent Opt-Outs/Ins */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Opt-Out Activity</h2>
            <div className="space-y-3">
              {data?.recent?.optOuts?.length > 0 ? (
                data.recent.optOuts.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{log.members?.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-600">{log.message_text}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{new Date(log.timestamp).toLocaleDateString()}</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        log.action === 'opt_out' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {log.action === 'opt_out' ? 'Opted Out' : 'Opted In'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Reusable StatCard component
function StatCard({ title, value, icon: Icon, color, change, changeLabel }) {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500'
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-600 text-sm font-medium">{title}</h3>
        <div className={`${colors[color]} p-2 rounded-lg`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {change !== undefined && (
        <p className="text-sm text-gray-600 mt-2">
          {change}% {changeLabel}
        </p>
      )}
    </div>
  )
}