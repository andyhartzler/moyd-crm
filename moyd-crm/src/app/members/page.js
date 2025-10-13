// COMPLETE FIXED VERSION - src/app/members/page.js
//
// FIXES APPLIED:
// 1. Members are now fully clickable to see complete details
// 2. Detailed modal shows ALL Supabase fields
// 3. Improved avatar display with fallback
// 4. Gravatar integration (simple, no API quotas needed)
// 5. All original functionality preserved and enhanced
// 6. Added message button to quickly message members

'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { User, Search, MapPin, MessageSquare, Mail, Phone, X, Calendar, Briefcase, GraduationCap, Heart, Users as UsersIcon, Home, Globe } from 'lucide-react'
import { useRouter } from 'next/navigation'
import crypto from 'crypto'

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
  
  return field
}

function formatCommittees(committees) {
  if (!committees || !Array.isArray(committees)) return []
  return committees.map(c => parseField(c)).filter(Boolean)
}

function formatDate(dateString) {
  if (!dateString) return null
  try {
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  } catch {
    return dateString
  }
}

// Generate Gravatar URL from email (no API needed!)
function getGravatarUrl(email) {
  if (!email) return null
  
  // Create MD5 hash in the browser
  const hash = crypto.createHash ? 
    crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex') :
    null
  
  if (!hash) return null
  
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=200`
}

export default function MembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [countyFilter, setCountyFilter] = useState('all')
  const [counties, setCounties] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)

  useEffect(() => {
    loadMembers()
    loadCounties()
  }, [])

  async function loadCounties() {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('county')
        .not('county', 'is', null)

      if (error) throw error

      const parsedCounties = data
        .map(m => parseField(m.county))
        .filter(Boolean)
      
      const uniqueCounties = [...new Set(parsedCounties)].sort()
      setCounties(uniqueCounties)
    } catch (error) {
      console.error('Error loading counties:', error)
    }
  }

  async function loadMembers() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name')

      if (error) throw error

      const parsedMembers = data.map(member => ({
        ...member,
        county: parseField(member.county),
        congressional_district: parseField(member.congressional_district),
        committee: formatCommittees(member.committee),
        preferred_pronouns: parseField(member.preferred_pronouns),
        gender_identity: parseField(member.gender_identity),
        race: parseField(member.race),
        sexual_orientation: parseField(member.sexual_orientation),
        community_type: parseField(member.community_type),
        desire_to_lead: parseField(member.desire_to_lead),
        education_level: parseField(member.education_level),
        industry: parseField(member.industry)
      }))

      setMembers(parsedMembers || [])
    } catch (error) {
      console.error('Error loading members:', error)
    } finally {
      setLoading(false)
    }
  }

  // Avatar component with Gravatar support
  function MemberAvatar({ member, size = 'md', onClick }) {
    const sizeClasses = {
      sm: 'h-10 w-10 text-lg',
      md: 'h-12 w-12 text-xl',
      lg: 'h-16 w-16 text-2xl',
      xl: 'h-24 w-24 text-4xl'
    }

    const [imageError, setImageError] = useState(false)
    const gravatarUrl = getGravatarUrl(member.email)

    const initials = member.name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()

    const colorClasses = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-indigo-500',
      'bg-pink-500',
      'bg-teal-500'
    ]
    
    const colorIndex = member.name.charCodeAt(0) % colorClasses.length
    const bgColor = colorClasses[colorIndex]

    // Try Gravatar first, fallback to initials
    if (gravatarUrl && !imageError) {
      return (
        <img
          src={gravatarUrl}
          alt={member.name}
          className={`${sizeClasses[size]} rounded-full object-cover border-2 border-gray-200 ${onClick ? 'cursor-pointer hover:border-blue-400 transition-colors' : ''}`}
          onClick={onClick}
          onError={() => setImageError(true)}
        />
      )
    }

    return (
      <div
        className={`${sizeClasses[size]} rounded-full ${bgColor} flex items-center justify-center text-white font-bold ${onClick ? 'cursor-pointer hover:scale-110 transition-transform' : ''} border-2 border-gray-200`}
        onClick={onClick}
      >
        {initials}
      </div>
    )
  }

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.phone?.includes(searchTerm)
    
    const matchesCounty = countyFilter === 'all' || member.county === countyFilter
    
    return matchesSearch && matchesCounty
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Members</h1>
          <p className="mt-1 text-sm text-gray-600">
            {filteredMembers.length} total members
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div className="sm:w-64">
            <select
              value={countyFilter}
              onChange={(e) => setCountyFilter(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="all">All Counties</option>
              {counties.map(county => (
                <option key={county} value={county}>{county}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Members List - FIXED: Entire card is now clickable */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading members...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-12">
            <User className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No members found</h3>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-400"
              >
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <MemberAvatar member={member} size="lg" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Name</dt>
                        <dd className="flex items-center text-lg font-medium text-gray-900">
                          {member.name}
                        </dd>
                      </dl>
                      {member.email && (
                        <div className="mt-1">
                          <p className="flex items-center text-sm text-gray-500">
                            <Mail className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                            <span className="truncate">{member.email}</span>
                          </p>
                        </div>
                      )}
                      {member.phone && (
                        <div className="mt-1">
                          <p className="flex items-center text-sm text-gray-500">
                            <Phone className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                            {member.phone}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    {member.county && (
                      <div className="flex items-center text-sm text-gray-500">
                        <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        {member.county} County
                      </div>
                    )}
                    {member.committee && member.committee.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {member.committee.slice(0, 2).map((comm, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {comm}
                          </span>
                        ))}
                        {member.committee.length > 2 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            +{member.committee.length - 2} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-blue-600 font-medium text-center">
                      Click to view full details →
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member Detail Modal - NEW: Shows all Supabase fields */}
      {selectedMember && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-2xl font-bold text-gray-900">Member Details</h3>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="px-6 py-6 space-y-6">
              {/* Profile Header */}
              <div className="flex items-center space-x-6">
                <MemberAvatar member={selectedMember} size="xl" />
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900">{selectedMember.name}</h2>
                  {selectedMember.preferred_pronouns && (
                    <p className="text-sm text-gray-500 mt-1">({selectedMember.preferred_pronouns})</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    {selectedMember.phone && (
                      <button
                        onClick={() => {
                          const phone = selectedMember.phone_e164 || selectedMember.phone
                          router.push(`/messenger?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(selectedMember.name)}&memberId=${selectedMember.id}`)
                        }}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send Message
                      </button>
                    )}
                    {selectedMember.email && (
                      <a
                        href={`mailto:${selectedMember.email}`}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                  <Phone className="h-5 w-5 mr-2" />
                  Contact Information
                </h4>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  {selectedMember.email && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.email}</dd>
                    </div>
                  )}
                  {selectedMember.phone && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.phone}</dd>
                    </div>
                  )}
                  {selectedMember.phone_e164 && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone (E164)</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.phone_e164}</dd>
                    </div>
                  )}
                  {selectedMember.address && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Address</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.address}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Location */}
              {(selectedMember.county || selectedMember.congressional_district || selectedMember.community_type) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <MapPin className="h-5 w-5 mr-2" />
                    Location
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.county && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">County</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.county}</dd>
                      </div>
                    )}
                    {selectedMember.congressional_district && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Congressional District</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.congressional_district}</dd>
                      </div>
                    )}
                    {selectedMember.community_type && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Community Type</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.community_type}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Demographics */}
              {(selectedMember.birthdate || selectedMember.date_of_birth || selectedMember.gender_identity || selectedMember.race || selectedMember.preferred_pronouns || selectedMember.sexual_orientation || selectedMember.hispanic_latino !== null) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    Demographics
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {(selectedMember.birthdate || selectedMember.date_of_birth) && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {formatDate(selectedMember.birthdate || selectedMember.date_of_birth)}
                        </dd>
                      </div>
                    )}
                    {selectedMember.preferred_pronouns && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Pronouns</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.preferred_pronouns}</dd>
                      </div>
                    )}
                    {selectedMember.gender_identity && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Gender Identity</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.gender_identity}</dd>
                      </div>
                    )}
                    {selectedMember.race && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Race/Ethnicity</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {Array.isArray(selectedMember.race) 
                            ? selectedMember.race.join(', ') 
                            : selectedMember.race}
                        </dd>
                      </div>
                    )}
                    {selectedMember.hispanic_latino !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Hispanic/Latino</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {selectedMember.hispanic_latino ? 'Yes' : 'No'}
                        </dd>
                      </div>
                    )}
                    {selectedMember.sexual_orientation && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Sexual Orientation</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.sexual_orientation}</dd>
                      </div>
                    )}
                    {selectedMember.languages && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Languages</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.languages}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Education & Employment */}
              {(selectedMember.education_level || selectedMember.in_school || selectedMember.school_name || selectedMember.employed || selectedMember.industry) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <GraduationCap className="h-5 w-5 mr-2" />
                    Education & Employment
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.education_level && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Education Level</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.education_level}</dd>
                      </div>
                    )}
                    {selectedMember.in_school !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Currently in School</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.in_school ? 'Yes' : 'No'}</dd>
                      </div>
                    )}
                    {selectedMember.school_name && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">School Name</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.school_name}</dd>
                      </div>
                    )}
                    {selectedMember.employed !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Employed</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.employed ? 'Yes' : 'No'}</dd>
                      </div>
                    )}
                    {selectedMember.industry && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Industry</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.industry}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Involvement */}
              {(selectedMember.committee && selectedMember.committee.length > 0 || selectedMember.desire_to_lead || selectedMember.hours_per_week || selectedMember.registered_voter !== null) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Briefcase className="h-5 w-5 mr-2" />
                    Involvement
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.committee && selectedMember.committee.length > 0 && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Committees</dt>
                        <dd className="mt-1 flex flex-wrap gap-2">
                          {selectedMember.committee.map((comm, idx) => (
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
                    {selectedMember.desire_to_lead && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Desire to Lead</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.desire_to_lead}</dd>
                      </div>
                    )}
                    {selectedMember.hours_per_week && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Hours Per Week</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.hours_per_week}</dd>
                      </div>
                    )}
                    {selectedMember.registered_voter !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Registered Voter</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.registered_voter ? 'Yes' : 'No'}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Additional Information */}
              {(selectedMember.why_join || selectedMember.accommodations || selectedMember.notes) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <UsersIcon className="h-5 w-5 mr-2" />
                    Additional Information
                  </h4>
                  <dl className="space-y-3">
                    {selectedMember.why_join && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Why Join</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.why_join}</dd>
                      </div>
                    )}
                    {selectedMember.accommodations && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Accommodations</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.accommodations}</dd>
                      </div>
                    )}
                    {selectedMember.notes && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Notes</dt>
                        <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{selectedMember.notes}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Metadata */}
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-base font-semibold text-gray-900 mb-3">Metadata</h4>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Member ID</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">{selectedMember.id}</dd>
                  </div>
                  {selectedMember.created_at && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Joined</dt>
                      <dd className="mt-1 text-sm text-gray-900">{formatDate(selectedMember.created_at)}</dd>
                    </div>
                  )}
                  {selectedMember.last_contacted && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Last Contacted</dt>
                      <dd className="mt-1 text-sm text-gray-900">{formatDate(selectedMember.last_contacted)}</dd>
                    </div>
                  )}
                  {selectedMember.opt_out !== null && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Opt Out</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.opt_out ? 'Yes' : 'No'}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
              {selectedMember.phone && (
                <button
                  onClick={() => {
                    const phone = selectedMember.phone_e164 || selectedMember.phone
                    router.push(`/messenger?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(selectedMember.name)}&memberId=${selectedMember.id}`)
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <MessageSquare className="h-4 w-4 inline mr-2" />
                  Send Message
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}