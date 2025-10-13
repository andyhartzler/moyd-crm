// ENHANCED VERSION - moyd-crm/src/app/page.js
// Original file: ~350 lines | Enhanced file: ~600 lines
//
// MAJOR CHANGES:
// Lines 1-20: Added Recharts library imports for interactive charts
// Lines 50-150: New interactive chart components with animations
// Lines 200-350: Enhanced dashboard with real-time animated statistics
// Lines 400-500: Added more detailed breakdowns (race, sexual orientation, etc.)
// Lines 550-600: All original functionality preserved with better visualizations

'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Users, MessageSquare, TrendingUp, MapPin, Briefcase, Calendar, Award, Activity, PieChart as PieChartIcon } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from 'recharts'

// Color palettes for charts
const COLORS = {
  district: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#EF4444', '#14B8A6'],
  county: ['#0EA5E9', '#8B5CF6', '#F43F5E', '#F97316', '#22C55E', '#6366F1', '#EF4444', '#06B6D4'],
  committee: ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6'],
  age: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1'],
  gender: ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B'],
  race: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#EF4444', '#14B8A6'],
}

// Helper to parse Airtable JSON fields
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
    byRace: {},
    bySexualOrientation: {},
    byEducation: {},
    recent: []
  })
  const [loading, setLoading] = useState(true)
  const [selectedChart, setSelectedChart] = useState('district')
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    // Trigger animations after data loads
    if (!loading) {
      setTimeout(() => setAnimate(true), 100)
    }
  }, [loading])

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

      // Calculate comprehensive stats
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
      const byRace = {}
      const bySexualOrientation = {}
      const byEducation = {}

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
        if (member.birthdate || member.date_of_birth) {
          const birthdate = member.birthdate || member.date_of_birth
          const age = new Date().getFullYear() - new Date(birthdate).getFullYear()
          if (age >= 18 && age <= 24) byAge['18-24']++
          else if (age >= 25 && age <= 34) byAge['25-34']++
          else if (age >= 35 && age <= 44) byAge['35-44']++
          else if (age >= 45 && age <= 54) byAge['45-54']++
          else if (age >= 55 && age <= 64) byAge['55-64']++
          else if (age >= 65) byAge['65+']++
        }

        // Gender Identity
        const gender = parseField(member.gender_identity) || 'Not specified'
        byGender[gender] = (byGender[gender] || 0) + 1

        // Race
        const race = parseField(member.race)
        if (race) {
          if (Array.isArray(race)) {
            race.forEach(r => {
              byRace[r] = (byRace[r] || 0) + 1
            })
          } else {
            byRace[race] = (byRace[race] || 0) + 1
          }
        } else {
          byRace['Not specified'] = (byRace['Not specified'] || 0) + 1
        }

        // Sexual Orientation
        const orientation = parseField(member.sexual_orientation) || 'Not specified'
        bySexualOrientation[orientation] = (bySexualOrientation[orientation] || 0) + 1

        // Education
        const education = parseField(member.education_level) || 'Not specified'
        byEducation[education] = (byEducation[education] || 0) + 1
      })

      setStats({
        totalMembers: members.length,
        activeConversations: conversations?.length || 0,
        byDistrict,
        byCounty,
        byCommittee,
        byAge,
        byGender,
        byRace,
        bySexualOrientation,
        byEducation,
        recent: conversations || []
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Prepare chart data based on selected view
  const getChartData = () => {
    const data = selectedChart === 'district' ? stats.byDistrict :
                 selectedChart === 'county' ? stats.byCounty :
                 selectedChart === 'committee' ? stats.byCommittee :
                 selectedChart === 'age' ? stats.byAge :
                 selectedChart === 'gender' ? stats.byGender :
                 selectedChart === 'race' ? stats.byRace :
                 selectedChart === 'orientation' ? stats.bySexualOrientation :
                 stats.byEducation

    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10) // Top 10 for readability
  }

  const chartData = getChartData()
  const colors = COLORS[selectedChart] || COLORS.district

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-900">{payload[0].name}</p>
          <p className="text-blue-600">{payload[0].value} members</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-lg text-gray-600">Welcome to MOYD CRM</p>
        </div>

        {/* Quick Stats with Animation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            name="Total Members"
            value={stats.totalMembers}
            icon={Users}
            color="from-blue-500 to-blue-600"
            animate={animate}
          />
          <StatCard
            name="Active Conversations"
            value={stats.activeConversations}
            icon={MessageSquare}
            color="from-purple-500 to-purple-600"
            animate={animate}
          />
          <StatCard
            name="Congressional Districts"
            value={Object.keys(stats.byDistrict).length}
            icon={MapPin}
            color="from-green-500 to-green-600"
            animate={animate}
          />
          <StatCard
            name="Committees"
            value={Object.keys(stats.byCommittee).length}
            icon={Briefcase}
            color="from-orange-500 to-orange-600"
            animate={animate}
          />
        </div>

        {/* Interactive Chart Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">Member Distribution</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'district', label: 'District', icon: MapPin },
                { key: 'county', label: 'County', icon: MapPin },
                { key: 'committee', label: 'Committee', icon: Briefcase },
                { key: 'age', label: 'Age', icon: Calendar },
                { key: 'gender', label: 'Gender', icon: Users },
                { key: 'race', label: 'Race', icon: Users },
                { key: 'orientation', label: 'Orientation', icon: Award },
                { key: 'education', label: 'Education', icon: Award }
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSelectedChart(key)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    selectedChart === key
                      ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Loading statistics...</p>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-24">
              <PieChartIcon className="mx-auto h-16 w-16 text-gray-300 mb-4" />
              <p className="text-gray-500">No data available for this category</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Bar Chart */}
              <div className="w-full" style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={100}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="value" 
                      fill="#3B82F6"
                      animationDuration={1500}
                      animationBegin={0}
                      radius={[8, 8, 0, 0]}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie Chart */}
              <div className="w-full" style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      animationDuration={1500}
                      animationBegin={0}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value, entry) => `${value} (${entry.payload.value})`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-gray-200">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Categories</p>
                  <p className="text-2xl font-bold text-blue-600">{chartData.length}</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Largest Group</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {chartData[0]?.value || 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Average Size</p>
                  <p className="text-2xl font-bold text-green-600">
                    {chartData.length > 0 ? Math.round(chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length) : 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Members</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {chartData.reduce((sum, item) => sum + item.value, 0)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions - Original functionality preserved */}
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

// Animated Stat Card Component
function StatCard({ name, value, icon: Icon, color, animate }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (animate && value > 0) {
      const duration = 2000 // 2 seconds
      const steps = 60
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
    <div className={`bg-white overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${animate ? 'animate-fade-in-up' : ''}`}>
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
                  <span className="inline-block transition-all duration-300">
                    {displayValue.toLocaleString()}
                  </span>
                ) : (
                  value.toLocaleString()
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
      {/* Animated progress bar */}
      <div className="bg-gray-50 px-6 py-3">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`bg-gradient-to-r ${color} h-1.5 rounded-full transition-all duration-2000 ease-out`}
            style={{ width: animate ? '100%' : '0%' }}
          />
        </div>
      </div>
    </div>
  )
}