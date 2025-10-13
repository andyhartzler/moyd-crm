// FIXED VERSION - src/app/members/page.js
// 
// FIXES APPLIED:
// 1. Simplified photo system - uses Gravatar (no API quotas!)
// 2. Gravatar automatically finds photos by email hash
// 3. Fixed member clickability - entire card is now clickable
// 4. Better fallback to colored initials
// 5. No more Google API quota errors

'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { User, Search, MapPin, MessageSquare, Mail, Phone, X, Calendar, Briefcase, GraduationCap, Heart } from 'lucide-react'
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

// NEW: Generate Gravatar URL from email (no API needed!)
function getGravatarUrl(email) {
  if (!email) return null
  
  // Gravatar uses MD5 hash of lowercase, trimmed email
  const hash = crypto.createHash('md5')
    .update(email.toLowerCase().trim())
    .digest('hex')
  
  // Return Gravatar URL with fallback to 404 (we'll handle with our initials)
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

  // NEW: Avatar component with Gravatar support
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

    // Try Gravatar first, fallback to initials
    if (gravatarUrl && !imageError) {
      return (
        <img
          src={gravatarUrl}
          alt={member.name}
          className={`${sizeClasses[size]} rounded-full object-cover border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-colors`}
          onClick={onClick}
          onError={() => setImageError(true)}
        />
      )
    }

    // Fallback to colorful initials
    const colors = [
      'from-blue-400 to-blue-600',
      'from-purple-400 to-purple-600',
      'from-pink-400 to-pink-600',
      'from-green-400 to-green-600',
      'from-yellow-400 to-yellow-600',
      'from-red-400 to-red-600',
      'from-indigo-400 to-indigo-600',
      'from-teal-400 to-teal-600',
    ]
    
    const colorIndex = member.id.charCodeAt(0) % colors.length
    const colorClass = colors[colorIndex]

    return (
      <div 
        className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-semibold cursor-pointer hover:scale-105 transition-transform`}
        onClick={onClick}
      >
        {initials}
      </div>
    )
  }

  const filteredMembers = members.filter(member => {
    if (countyFilter !== 'all' && member.county !== countyFilter) {
      return false
    }
    
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      member.name?.toLowerCase().includes(search) ||
      member.email?.toLowerCase().includes(search) ||
      member.phone?.includes(search) ||
      member.county?.toLowerCase().includes(search)
    )
  })

  function handleMessageClick(member, e) {
    e.stopPropagation() // Prevent card click
    if (member.phone_e164) {
      router.push(`/messenger?phone=${encodeURIComponent(member.phone_e164)}&name=${encodeURIComponent(member.name)}&memberId=${member.id}`)
    } else {
      alert('This member does not have a phone number on file.')
    }
  }

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
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <User className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-gray-500">No members found</p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {filteredMembers.map((member) => (
                <li key={member.id}>
                  {/* FIXED: Entire card is clickable */}
                  <div 
                    className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedMember(member)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex-shrink-0 mr-4">
                          <MemberAvatar 
                            member={member} 
                            size="md"
                            onClick={() => setSelectedMember(member)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-600 truncate hover:text-blue-800">
                            {member.name}
                          </p>
                          <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:space-x-6">
                            {member.email && (
                              <div className="flex items-center text-sm text-gray-500">
                                <Mail className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                <span className="truncate">{member.email}</span>
                              </div>
                            )}
                            {member.phone && (
                              <div className="flex items-center text-sm text-gray-500">
                                <Phone className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                <span>{member.phone}</span>
                              </div>
                            )}
                            {member.county && (
                              <div className="flex items-center text-sm text-gray-500">
                                <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                <span>{member.county}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        {member.phone_e164 ? (
                          <button
                            onClick={(e) => handleMessageClick(member, e)}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <MessageSquare className="mr-1.5 h-4 w-4" />
                            Message
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No phone</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Member Profile Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-4">
                <MemberAvatar member={selectedMember} size="lg" />
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Member Profile
                  </h3>
                  <p className="text-sm text-gray-500">{selectedMember.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-6">
              {/* Contact Information */}
              <div>
                <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2" />
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
                  {selectedMember.address && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Address</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.address}</dd>
                    </div>
                  )}
                  {selectedMember.city && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">City</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.city}</dd>
                    </div>
                  )}
                  {selectedMember.state && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">State</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.state}</dd>
                    </div>
                  )}
                  {selectedMember.zip && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">ZIP Code</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.zip}</dd>
                    </div>
                  )}
                  {selectedMember.county && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">County</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.county}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Political Information */}
              {(selectedMember.congressional_district || selectedMember.state_house || selectedMember.state_senate) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <MapPin className="h-5 w-5 mr-2" />
                    Political Districts
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.congressional_district && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Congressional District</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.congressional_district}</dd>
                      </div>
                    )}
                    {selectedMember.state_house && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">State House</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.state_house}</dd>
                      </div>
                    )}
                    {selectedMember.state_senate && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">State Senate</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.state_senate}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Demographics */}
              {(selectedMember.birthdate || selectedMember.date_of_birth || selectedMember.gender_identity || selectedMember.race || selectedMember.preferred_pronouns) && (
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
                    {selectedMember.sexual_orientation && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Sexual Orientation</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.sexual_orientation}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Professional */}
              {(selectedMember.education_level || selectedMember.employer || selectedMember.occupation || selectedMember.industry) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Briefcase className="h-5 w-5 mr-2" />
                    Professional Information
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.education_level && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Education</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.education_level}</dd>
                      </div>
                    )}
                    {selectedMember.employer && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Employer</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.employer}</dd>
                      </div>
                    )}
                    {selectedMember.occupation && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Occupation</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.occupation}</dd>
                      </div>
                    )}
                    {selectedMember.student !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Student Status</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.student ? 'Yes' : 'No'}</dd>
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

              {/* Civic Engagement */}
              {(selectedMember.registered_voter !== null || selectedMember.desire_to_lead || selectedMember.hours_per_week) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Heart className="h-5 w-5 mr-2" />
                    Civic Engagement
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.registered_voter !== null && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Registered Voter</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.registered_voter ? 'Yes' : 'No'}</dd>
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
                  </dl>
                </div>
              )}

              {/* Committees */}
              {selectedMember.committee && selectedMember.committee.length > 0 && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <GraduationCap className="h-5 w-5 mr-2" />
                    Committees
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.committee.map((committee, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                      >
                        {committee}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {selectedMember.phone_e164 && (
                <button
                  onClick={(e) => {
                    setSelectedMember(null)
                    handleMessageClick(selectedMember, e)
                  }}
                  className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
                >
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