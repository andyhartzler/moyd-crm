'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { supabase } from '@/lib/supabase'
import { User, Search, MapPin, MessageSquare, Mail, Phone, X, Calendar, Briefcase, GraduationCap, Heart, Users as UsersIcon, Home, Globe, Filter, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

// Helper to parse Airtable JSON fields
function parseField(field) {
  if (!field) return null
  
  if (typeof field === 'string') {
    const trimmed = field.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return field
    }
    
    try {
      const parsed = JSON.parse(field)
      if (parsed && typeof parsed === 'object' && parsed.name) {
        return parsed.name
      }
      if (Array.isArray(parsed)) {
        return parsed.map(item => 
          (item && typeof item === 'object' && item.name) ? item.name : item
        ).filter(Boolean)
      }
      return field
    } catch {
      return field
    }
  }
  
  if (field && typeof field === 'object' && field.name) {
    return field.name
  }
  
  if (Array.isArray(field)) {
    return field.map(item => 
      (item && typeof item === 'object' && item.name) ? item.name : item
    ).filter(Boolean)
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

function calculateAge(birthdate) {
  if (!birthdate) return null
  const today = new Date()
  const birth = new Date(birthdate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

export default function MembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState([])
  const [filteredMembers, setFilteredMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  
  // Filter and sort states
  const [filterType, setFilterType] = useState('all') // all, county, district, committee, age
  const [filterValue, setFilterValue] = useState('all')
  const [filterOptions, setFilterOptions] = useState([])
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [members, searchTerm, filterType, filterValue])

  useEffect(() => {
    updateFilterOptions()
  }, [filterType, members])

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
        congressional_district: parseField(member.congressional_district || member.district),
        committee: formatCommittees(member.committee),
        preferred_pronouns: parseField(member.preferred_pronouns),
        gender_identity: parseField(member.gender_identity || member.gender),
        race: parseField(member.race),
        sexual_orientation: parseField(member.sexual_orientation || member.orientation),
        community_type: parseField(member.community_type),
        desire_to_lead: parseField(member.desire_to_lead),
        education_level: parseField(member.education_level || member.education),
        industry: parseField(member.industry),
        languages: parseField(member.languages), // FIX: Parse languages JSON
        hours_per_week: parseField(member.hours_per_week), // FIX: Parse hours per week JSON
        age: calculateAge(member.birthdate || member.date_of_birth)
      }))

      setMembers(parsedMembers || [])
    } catch (error) {
      console.error('Error loading members:', error)
    } finally {
      setLoading(false)
    }
  }

  function updateFilterOptions() {
    let options = []
    
    switch (filterType) {
      case 'county':
        options = [...new Set(members.map(m => m.county).filter(Boolean))].sort()
        break
      case 'district':
        options = [...new Set(members.map(m => m.congressional_district).filter(Boolean))].sort()
        break
      case 'committee':
        const allCommittees = members.flatMap(m => m.committee || [])
        options = [...new Set(allCommittees)].sort()
        break
      case 'age':
        options = ['14-18', '18-22', '22-26', '26-30', '30-36', '36+']
        break
      case 'city':
        options = [...new Set(members.map(m => m.city).filter(Boolean))].sort()
        break
      default:
        options = []
    }
    
    setFilterOptions(options)
    setFilterValue('all')
  }

  function applyFilters() {
    let filtered = [...members]

    // Apply search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(member =>
        member.name?.toLowerCase().includes(term) ||
        member.email?.toLowerCase().includes(term) ||
        member.phone?.includes(term) ||
        member.county?.toLowerCase().includes(term) ||
        member.city?.toLowerCase().includes(term)
      )
    }

    // Apply filter
    if (filterType !== 'all' && filterValue !== 'all') {
      switch (filterType) {
        case 'county':
          filtered = filtered.filter(m => m.county === filterValue)
          break
        case 'district':
          filtered = filtered.filter(m => m.congressional_district === filterValue)
          break
        case 'committee':
          filtered = filtered.filter(m => m.committee?.includes(filterValue))
          break
        case 'age':
          filtered = filtered.filter(m => {
            const age = m.age
            if (!age) return false
            switch (filterValue) {
              case '14-18': return age >= 14 && age < 18
              case '18-22': return age >= 18 && age < 22
              case '22-26': return age >= 22 && age < 26
              case '26-30': return age >= 26 && age < 30
              case '30-36': return age >= 30 && age < 36
              case '36+': return age >= 36
              default: return true
            }
          })
          break
        case 'city':
          filtered = filtered.filter(m => m.city === filterValue)
          break
      }
    }

    setFilteredMembers(filtered)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Members</h1>
          <p className="mt-2 text-sm text-gray-600">{filteredMembers.length} total members</p>
        </div>

        {/* Search and Filter Section */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search members by name, email, phone, county, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          {/* Filter Section */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Filter by:</span>
            </div>
            
            {/* Filter Type Selector */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
            >
              <option value="all">No Filter</option>
              <option value="county">County</option>
              <option value="district">Congressional District</option>
              <option value="committee">Committee</option>
              <option value="age">Age Group</option>
              <option value="city">City</option>
            </select>

            {/* Filter Value Selector */}
            {filterType !== 'all' && (
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              >
                <option value="all">All {filterType}</option>
                {filterOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            )}

            {/* Clear Filters */}
            {(filterType !== 'all' || searchTerm) && (
              <button
                onClick={() => {
                  setFilterType('all')
                  setFilterValue('all')
                  setSearchTerm('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Members Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Loading members...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <User className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No members found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer transform hover:-translate-y-1"
              >
                <div className="p-6">
                  {/* Avatar and Name */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                        {member.name?.charAt(0) || '?'}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{member.name}</h3>
                      {member.email && (
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <Mail className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                          <span className="truncate">{member.email}</span>
                        </div>
                      )}
                      {member.phone && (
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <Phone className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                          {member.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Location and Committees */}
                  <div className="space-y-2">
                    {member.county && (
                      <div className="flex items-center text-sm text-gray-500">
                        <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        {member.county} County
                        {member.congressional_district && (
                          <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                            CD-{member.congressional_district}
                          </span>
                        )}
                      </div>
                    )}
                    {member.committee && member.committee.length > 0 && (
                      <div className="flex flex-wrap gap-1">
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

                  {/* Click to view */}
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

      {/* Member Detail Modal */}
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
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                    {selectedMember.name?.charAt(0) || '?'}
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedMember.name}</h2>
                  <div className="space-y-2">
                    {selectedMember.email && (
                      <div className="flex items-center text-gray-600">
                        <Mail className="h-5 w-5 mr-2 text-gray-400" />
                        <a href={`mailto:${selectedMember.email}`} className="hover:text-blue-600">
                          {selectedMember.email}
                        </a>
                      </div>
                    )}
                    {selectedMember.phone && (
                      <div className="flex items-center text-gray-600">
                        <Phone className="h-5 w-5 mr-2 text-gray-400" />
                        <a href={`tel:${selectedMember.phone}`} className="hover:text-blue-600">
                          {selectedMember.phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Location */}
              {(selectedMember.address || selectedMember.city || selectedMember.county || selectedMember.congressional_district || selectedMember.community_type) && (
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
                    {selectedMember.city && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">City</dt>
                        <dd className="mt-1 text-sm text-gray-900">{selectedMember.city}</dd>
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
                        <dd className="mt-1 text-sm text-gray-900">CD-{selectedMember.congressional_district}</dd>
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
              {(selectedMember.birthdate || selectedMember.date_of_birth || selectedMember.age || selectedMember.gender_identity || selectedMember.race || selectedMember.preferred_pronouns || selectedMember.sexual_orientation || selectedMember.hispanic_latino !== null || selectedMember.languages) && (
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
                          {selectedMember.age && (
                            <span className="ml-2 text-gray-600">({selectedMember.age} years old)</span>
                          )}
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
                        <dd className="mt-1 text-sm text-gray-900">
                          {Array.isArray(selectedMember.languages) 
                            ? selectedMember.languages.join(', ') 
                            : selectedMember.languages}
                        </dd>
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
                        <dd className="mt-1 text-sm text-gray-900">
                          {Array.isArray(selectedMember.hours_per_week)
                            ? selectedMember.hours_per_week.join(', ')
                            : selectedMember.hours_per_week}
                        </dd>
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

              {/* Opt Out Status - KEEP THIS */}
              {selectedMember.opt_out !== null && (
                <div className="border-t border-gray-200 pt-4">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Opt Out Status</dt>
                      <dd className="mt-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          selectedMember.opt_out 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {selectedMember.opt_out ? 'Opted Out' : 'Active'}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
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