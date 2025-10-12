'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { User, Search, MapPin, MessageSquare, Mail, Phone, X, Calendar, Briefcase, GraduationCap, Heart } from 'lucide-react'
import { useRouter } from 'next/navigation'

// Helper to parse Airtable JSON fields - handles all formats
function parseField(field) {
  if (!field) return null
  
  // If it's a string that looks like JSON, parse it
  if (typeof field === 'string') {
    // Check if it starts with { or [ (JSON indicators)
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
  
  // If it's already an object with name property
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

      // Parse ALL fields that might be JSON
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

  const filteredMembers = members.filter(member => {
    // Filter by county
    if (countyFilter !== 'all' && member.county !== countyFilter) {
      return false
    }
    
    // Filter by search term
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      member.name?.toLowerCase().includes(search) ||
      member.email?.toLowerCase().includes(search) ||
      member.phone?.includes(search) ||
      member.county?.toLowerCase().includes(search)
    )
  })

  function handleMessageClick(member) {
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
          {/* Search */}
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

          {/* County Filter */}
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

        {/* Members List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading members...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <User className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No members found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search or filter criteria
            </p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <ul className="divide-y divide-gray-200">
              {filteredMembers.map((member) => (
                <li key={member.id} className="hover:bg-gray-50 transition-colors">
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center min-w-0 flex-1 cursor-pointer"
                        onClick={() => setSelectedMember(member)}
                      >
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-6 w-6 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {member.name}
                            </p>
                            {member.committee && member.committee.length > 0 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {member.committee[0]}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-4 gap-y-1">
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
                            onClick={() => handleMessageClick(member)}
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

      {/* Member Profile Modal - COMPLETE with ALL fields */}
      {selectedMember && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-medium text-gray-900">
                Member Profile
              </h3>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="px-6 py-4 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Basic Information
                </h4>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedMember.name}</dd>
                  </div>
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
                  {selectedMember.date_of_birth && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                      <dd className="mt-1 text-sm text-gray-900">{formatDate(selectedMember.date_of_birth)}</dd>
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
                      <dt className="text-sm font-medium text-gray-500">Race</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.race}</dd>
                    </div>
                  )}
                  {selectedMember.sexual_orientation && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Sexual Orientation</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.sexual_orientation}</dd>
                    </div>
                  )}
                  {selectedMember.hispanic_latino !== null && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Hispanic/Latino</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.hispanic_latino ? 'Yes' : 'No'}</dd>
                    </div>
                  )}
                  {selectedMember.languages && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Languages</dt>
                      <dd className="mt-1 text-sm text-gray-900">{selectedMember.languages}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Location */}
              {(selectedMember.address || selectedMember.county || selectedMember.congressional_district || selectedMember.community_type) && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <MapPin className="h-5 w-5 mr-2" />
                    Location
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {selectedMember.address && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Address</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.address}</dd>
                      </div>
                    )}
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
                      <div className="sm:col-span-2">
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
                    <Briefcase className="h-5 w-5 mr-2" />
                    Committees
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.committee.map((c, i) => (
                      <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Accessibility */}
              {selectedMember.accommodations && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3">Accommodations Needed</h4>
                  <p className="text-sm text-gray-900">{selectedMember.accommodations}</p>
                </div>
              )}

              {/* Why They Joined */}
              {selectedMember.why_join && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3">Why They Joined</h4>
                  <p className="text-sm text-gray-900">{selectedMember.why_join}</p>
                </div>
              )}

              {/* Notes */}
              {selectedMember.notes && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3">Notes</h4>
                  <p className="text-sm text-gray-900">{selectedMember.notes}</p>
                </div>
              )}

              {/* Last Contacted */}
              {selectedMember.last_contacted && (
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    Last Contacted
                  </h4>
                  <p className="text-sm text-gray-900">{formatDate(selectedMember.last_contacted)}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {selectedMember.phone_e164 && (
                <button
                  onClick={() => {
                    setSelectedMember(null)
                    handleMessageClick(selectedMember)
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
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