// FIXED VERSION - src/app/page.js
//
// FIXES APPLIED:
// 1. Quick action buttons moved to TOP of page and made SMALLER
// 2. Age breakdown adjusted for 14-36 year olds (14-18, 19-22, 23-26, 27-30, 31-36)
// 3. All original functionality preserved

'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Users, MessageSquare, TrendingUp, MapPin, Briefcase, Calendar, Award, Activity, PieChart as PieChartIcon } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts'

// Color palettes for charts
const COLORS = {
  district: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#EF4444', '#14B8A6'],
  county: ['#0EA5E9', '#8B5CF6', '#F43F5E', '#F97316', '#22C55E', '#6366F1', '#EF4444', '#06B6D4'],
  committee: ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6'],
  age: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1'],
  gender: ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B'],
  race: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#EF4444', '#14B8A6'],
}

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

      const byDistrict = {}
      const byCounty = {}
      const byCommittee = {}
      // FIXED: Age breakdown for 14-36 year olds
      const byAge = {
        '14-18': 0,
        '19-22': 0,
        '23-26': 0,
        '27-30': 0,
        '31-36': 0
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

        // FIXED: Age breakdown for 14-36 year olds
        if (member.birthdate || member.date_of_birth) {
          const birthdate = member.birthdate || member.date_of_birth
          const age = new Date().getFullYear() - new Date(birthdate).getFullYear()
          if (age >= 14 && age <= 18) byAge['14-18']++
          else if (age >= 19 && age <= 22) byAge['19-22']++
          else if (age >= 23 && age <= 26) byAge['23-26']++
          else if (age >= 27 && age <= 30) byAge['27-30']++
          else if (age >= 31 && age <= 36) byAge['31-36']++
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
      .slice(0, 10)
  }

  const chartData = getChartData()
  const colors = COLORS[selectedChart] || COLORS.district

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

  const StatCard = ({ name, value, icon: Icon, color, animate }) => (
    <div className={`bg-white rounded-xl shadow-lg p-6 transform transition-all duration-500 ${animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{name}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg bg-gradient-to-br ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-lg text-gray-600">Welcome to MOYD CRM</p>
        </div>

        {/* FIXED: Quick Action Buttons - NOW AT TOP AND SMALLER */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Link
            href="/messenger"
            className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white p-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6" />
              <div>
                <h3 className="text-lg font-bold">Send Message</h3>
                <p className="text-sm opacity-90">Contact members</p>
              </div>
            </div>
          </Link>

          <Link
            href="/members"
            className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white p-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6" />
              <div>
                <h3 className="text-lg font-bold">View Members</h3>
                <p className="text-sm opacity-90">Browse directory</p>
              </div>
            </div>
          </Link>

          <Link
            href="/conversations"
            className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white p-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6" />
              <div>
                <h3 className="text-lg font-bold">View Chats</h3>
                <p className="text-sm opacity-90">See conversations</p>
              </div>
            </div>
          </Link>
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
      </div>
    </div>
  )
}