// Utility to parse Airtable fields that come through as JSON objects
export function parseAirtableField(field) {
  if (!field) return null
  
  // If it's already a string, return it
  if (typeof field === 'string') {
    // Check if it's a JSON string
    try {
      const parsed = JSON.parse(field)
      // If it has a 'name' property, return that
      if (parsed && typeof parsed === 'object' && parsed.name) {
        return parsed.name
      }
      return field
    } catch {
      // Not JSON, just return the string
      return field
    }
  }
  
  // If it's an object with name property
  if (typeof field === 'object' && field.name) {
    return field.name
  }
  
  // If it's an array, parse each item
  if (Array.isArray(field)) {
    return field.map(item => {
      if (typeof item === 'string') return item
      if (item && item.name) return item.name
      return String(item)
    })
  }
  
  return field
}

// Format committee array for display
export function formatCommittees(committees) {
  if (!committees) return []
  if (!Array.isArray(committees)) return []
  
  return committees.map(c => {
    if (typeof c === 'string') return c
    if (c && c.name) return c.name
    return String(c)
  }).filter(Boolean)
}