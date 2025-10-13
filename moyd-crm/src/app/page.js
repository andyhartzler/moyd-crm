'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Users, MessageSquare, TrendingUp, MapPin, Briefcase, Calendar, Award } from 'lucide-react'

function parseField(field) {
  if (!field) return null
  if (typeof field === 'string') {
    if (field.trim().startsWith('{') || field.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(field)
        if (parsed && typeof parsed === 'object' && parsed.name) {
          return parsed.name
        }
        if (Array.isArray(parsed)) {
          return parsed.map(item => item.name || item).filter(Boolean)
        }
        return field
      } catch {
        return field
      }
    }
    return field
  }
  if (field && typeof field === 'object' && field.name) {
    return field.name
  }
  if (Array.isArray(field)) {
    return field.map(item => typeof item === 'object' && item.name ? item.name : item).filter(Boolean)
  }
  return field
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeConversations: 0,
    byDistrict: {},
    byCounty: {},
    byCommittee: {},
    byAge: {},
    byGender: {},
    recent: []
  })
  const [loading, setLoading] = useState(true)
  const [selectedChart, setSelectedChart] = useState('district')

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('*')

      const { data: conversations, error: convsError } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(5)

      if (membersError) throw membersError

      // Calculate stats
      const byDistrict = {}
      const byCounty = {}
      const byCommittee = {}
      const byAge = {
        '18-24': 0,
        '25-34': 0,
        '35-44': 0,
        '45-54': 0,
        '55-64': 0,
        '65+': 0
      }
      const byGender = {}

      members.forEach(member => {
        // District
        const district = parseField(member.congressional_district)
        if (district) {
          byDistrict[district] = (byDistrict[district] || 0) + 1
        }

        // County
        const county = parseField(member.county)
        if (county) {
          byCounty[county] = (byCounty[county] || 0) + 1
        }

        // Committee
        const committee = parseField(member.committee)
        if (Array.isArray(committee)) {
          committee.forEach(c => {
            byCommittee[c] = (byCommittee[c] || 0) + 1
          })
        } else if (committee) {
          byCommittee[committee] = (byCommittee[committee] || 0) + 1
        }

        // Age
        if (member.birthdate) {
          const age = new Date().getFullYear() - new Date(member.birthdate).getFullYear()
          if (age >= 18 && age <= 24) byAge['18-24']++
          else if (age >= 25 && age <= 34) byAge['25-34']++
          else if (age >= 35 && age <= 44) byAge['35-44']++
          else if (age >= 45 && age <= 54) byAge['45-54']++
          else if (age >= 55 && age <= 64) byAge['55-64']++
          else if (age >= 65) byAge['65+']++
        }

        // Gender
        const gender = parseField(member.gender_identity) || 'Not specified'
        byGender[gender] = (byGender[gender] || 0) + 1
      })

      setStats({
        totalMembers: members.length,
        activeConversations: conversations?.length || 0,
        byDistrict,
        byCounty,
        byCommittee,
        byAge,
        byGender,
        recent: conversations || []
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const chartData = selectedChart === 'district' ? stats.byDistrict :
                    selectedChart === 'county' ? stats.byCounty :
                    selectedChart === 'committee' ? stats.byCommittee :
                    selectedChart === 'age' ? stats.byAge :
                    stats.byGender

  const maxValue = Math.max(...Object.values(chartData), 1)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-lg text-gray-600">Welcome to MOYD CRM</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            name="Total Members"
            value={stats.totalMembers}
            icon={Users}
            color="from-blue-500 to-blue-600"
            animate={!loading}
          />
          <StatCard
            name="Active Conversations"
            value={stats.activeConversations}
            icon={MessageSquare}
            color="from-purple-500 to-purple-600"
            animate={!loading}
          />
          <StatCard
            name="Congressional Districts"
            value={Object.keys(stats.byDistrict).length}
            icon={MapPin}
            color="from-green-500 to-green-600"
            animate={!loading}
          />
          <StatCard
            name="Committees"
            value={Object.keys(stats.byCommittee).length}
            icon={Briefcase}
            color="from-orange-500 to-orange-600"
            animate={!loading}
          />
        </div>

        {/* Interactive Chart */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Member Distribution</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedChart('district')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedChart === 'district'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                District
              </button>
              <button
                onClick={() => setSelectedChart('county')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedChart === 'county'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                County
              </button>
              <button
                onClick={() => setSelectedChart('committee')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedChart === 'committee'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Committee
              </button>
              <button
                onClick={() => setSelectedChart('age')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedChart === 'age'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Age
              </button>
              <button
                onClick={() => setSelectedChart('gender')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedChart === 'gender'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Gender
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : Object.keys(chartData).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No data available
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(chartData)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([key, value], index) => (
                  <div key={key} className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{key}</span>
                      <span className="text-sm font-bold text-gray-900">{value}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-1000 ease-out flex items-center justify-end px-2"
                        style={{
                          width: `${(value / maxValue) * 100}%`,
                          animationDelay: `${index * 0.1}s`
                        }}
                      >
                        <span className="text-xs font-medium text-white">
                          {((value / stats.totalMembers) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6">
          <Link
            href="/messenger"
            className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
          >
            <MessageSquare className="h-12 w-12 mb-4" />
            <h3 className="text-xl font-bold mb-2">Open Messenger</h3>
            <p className="text-blue-100">Send messages to members</p>
          </Link>
          <Link
            href="/members"
            className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
          >
            <Users className="h-12 w-12 mb-4" />
            <h3 className="text-xl font-bold mb-2">View Members</h3>
            <p className="text-green-100">Manage your member database</p>
          </Link>
          <Link
            href="/conversations"
            className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
          >
            <TrendingUp className="h-12 w-12 mb-4" />
            <h3 className="text-xl font-bold mb-2">All Conversations</h3>
            <p className="text-purple-100">View message history</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({ name, value, icon: Icon, color, animate }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (animate && value > 0) {
      const duration = 1000
      const steps = 30
      const increment = value / steps
      let current = 0

      const timer = setInterval(() => {
        current += increment
        if (current >= value) {
          setDisplayValue(value)
          clearInterval(timer)
        } else {
          setDisplayValue(Math.floor(current))
        }
      }, duration / steps)

      return () => clearInterval(timer)
    } else {
      setDisplayValue(value)
    }
  }, [value, animate])

  return (
    <div className="bg-white overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
      <div className="p-6">
        <div className="flex items-center">
          <div className={`flex-shrink-0 bg-gradient-to-br ${color} rounded-xl p-4 shadow-lg`}>
            <Icon className="h-8 w-8 text-white" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {name}
              </dt>
              <dd className="text-4xl font-bold text-gray-900 mt-1">
                {animate ? (
                  <span className="inline-block animate-pulse">{displayValue}</span>
                ) : (
                  value
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}