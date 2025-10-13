// FIXED VERSION - src/app/page.js
//
// FIX APPLIED: Added Cell to recharts imports to resolve "Can't find variable: Cell" error

'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Users, MessageSquare, TrendingUp, MapPin, Briefcase, Calendar, Award, Activity } from 'lucide-react'
// FIX: Added Cell to the import statement
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts'

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

export default function Home() {
  const [members, setMembers] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    byDistrict: {},
    byCounty: {},
    byCommittee: {},
    byAge: {},
    byGender: {},
    byRace: {},
    byOrientation: {},
    byEducation: {}
  })
  const [loading, setLoading] = useState(true)
  const [selectedChart, setSelectedChart] = useState('district')
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    fetchMembers()
    setTimeout(() => setAnimate(true), 100)
  }, [])

  async function fetchMembers() {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')

      if (error) throw error

      setMembers(data || [])
      calculateStats(data || [])
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }

  function calculateStats(membersList) {
    const newStats = {
      total: membersList.length,
      byDistrict: {},
      byCounty: {},
      byCommittee: {},
      byAge: {},
      byGender: {},
      byRace: {},
      byOrientation: {},
      byEducation: {}
    }

    membersList.forEach(member => {
      // District
      const district = parseField(member.district)
      if (district) {
        newStats.byDistrict[district] = (newStats.byDistrict[district] || 0) + 1
      }

      // County
      const county = parseField(member.county)
      if (county) {
        newStats.byCounty[county] = (newStats.byCounty[county] || 0) + 1
      }

      // Committee
      const committees = member.committee
      if (committees && Array.isArray(committees)) {
        committees.forEach(comm => {
          const committee = parseField(comm)
          if (committee) {
            newStats.byCommittee[committee] = (newStats.byCommittee[committee] || 0) + 1
          }
        })
      }

      // Age
      if (member.age) {
        const ageGroup = getAgeGroup(member.age)
        newStats.byAge[ageGroup] = (newStats.byAge[ageGroup] || 0) + 1
      }

      // Gender
      const gender = parseField(member.gender)
      if (gender) {
        newStats.byGender[gender] = (newStats.byGender[gender] || 0) + 1
      }

      // Race
      const race = parseField(member.race)
      if (race) {
        newStats.byRace[race] = (newStats.byRace[race] || 0) + 1
      }

      // Orientation
      const orientation = parseField(member.orientation)
      if (orientation) {
        newStats.byOrientation[orientation] = (newStats.byOrientation[orientation] || 0) + 1
      }

      // Education
      const education = parseField(member.education)
      if (education) {
        newStats.byEducation[education] = (newStats.byEducation[education] || 0) + 1
      }
    })

    setStats(newStats)
  }

  function getAgeGroup(age) {
    if (age < 18) return '14-18'
    if (age < 22) return '18-22'
    if (age < 26) return '22-26'
    if (age < 30) return '26-30'
    if (age < 36) return '30-36'
    return '36+'
  }

  const chartData = (() => {
    let data = []
    let colors = COLORS.district

    switch (selectedChart) {
      case 'district':
        data = Object.entries(stats.byDistrict).map(([name, value]) => ({ name, value }))
        colors = COLORS.district
        break
      case 'county':
        data = Object.entries(stats.byCounty).map(([name, value]) => ({ name, value }))
        colors = COLORS.county
        break
      case 'committee':
        data = Object.entries(stats.byCommittee).map(([name, value]) => ({ name, value }))
        colors = COLORS.committee
        break
      case 'age':
        const ageOrder = ['14-18', '18-22', '22-26', '26-30', '30-36', '36+']
        data = ageOrder
          .map(age => ({ name: age, value: stats.byAge[age] || 0 }))
          .filter(item => item.value > 0)
        colors = COLORS.age
        break
      case 'gender':
        data = Object.entries(stats.byGender).map(([name, value]) => ({ name, value }))
        colors = COLORS.gender
        break
      case 'race':
        data = Object.entries(stats.byRace).map(([name, value]) => ({ name, value }))
        colors = COLORS.race
        break
      case 'orientation':
        data = Object.entries(stats.byOrientation).map(([name, value]) => ({ name, value }))
        colors = COLORS.gender
        break
      case 'education':
        data = Object.entries(stats.byEducation).map(([name, value]) => ({ name, value }))
        colors = COLORS.committee
        break
    }

    return { data: data.sort((a, b) => b.value - a.value), colors }
  })()

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-900">{payload[0].payload.name}</p>
          <p className="text-blue-600 font-bold">{payload[0].value} members</p>
        </div>
      )
    }
    return null
  }

  const StatCard = ({ name, value, icon: Icon, color, animate }) => (
    <div className={`bg-white rounded-xl shadow-lg p-6 transition-all duration-700 transform ${animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
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
          <p className="text-lg text-gray-600">Welcome to Missouri Young Democrats CRM</p>
        </div>

        {/* Quick Action Buttons */}
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
                <h3 className="text-lg font-bold">Conversations</h3>
                <p className="text-sm opacity-90">View message history</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            name="Total Members"
            value={stats.total}
            icon={Users}
            color="from-blue-500 to-blue-600"
            animate={animate}
          />
          <StatCard
            name="Districts"
            value={Object.keys(stats.byDistrict).length}
            icon={MapPin}
            color="from-purple-500 to-purple-600"
            animate={animate}
          />
          <StatCard
            name="Counties"
            value={Object.keys(stats.byCounty).length}
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
          ) : chartData.data.length === 0 ? (
            <div className="text-center py-24">
              <Activity className="mx-auto h-16 w-16 text-gray-300 mb-4" />
              <p className="text-gray-500">No data available for this category</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Bar Chart */}
              <div className="w-full" style={{ height: '450px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartData.data} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                  >
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={120}
                      interval={0}
                      tick={{ fontSize: 13, fill: '#374151' }}
                      tickMargin={10}
                    />
                    <YAxis 
                      tick={{ fontSize: 13, fill: '#374151' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="value" 
                      fill="#3B82F6"
                      animationDuration={1500}
                      animationBegin={0}
                      radius={[8, 8, 0, 0]}
                    >
                      {chartData.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={chartData.colors[index % chartData.colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-gray-200">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Categories</p>
                  <p className="text-2xl font-bold text-blue-600">{chartData.data.length}</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Largest Group</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {chartData.data[0]?.value || 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Average Size</p>
                  <p className="text-2xl font-bold text-green-600">
                    {chartData.data.length > 0 ? Math.round(chartData.data.reduce((sum, item) => sum + item.value, 0) / chartData.data.length) : 0}
                  </p>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Members</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {chartData.data.reduce((sum, item) => sum + item.value, 0)}
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