// NEW FILE - moyd-crm/src/app/api/get-profile-photos/route.js
// This API route fetches profile photos from Google People API
// Lines: ~150

import { NextResponse } from 'next/server'
import { google } from 'googleapis'

// Initialize Google People API
function getGoogleAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/directory.readonly'
    ],
  })
  return auth
}

export async function POST(request) {
  try {
    const { members } = await request.json()

    if (!members || !Array.isArray(members)) {
      return NextResponse.json(
        { error: 'Members array is required' },
        { status: 400 }
      )
    }

    // Check if Google API credentials are configured
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.warn('Google API credentials not configured')
      return NextResponse.json({ photos: {} })
    }

    const auth = getGoogleAuth()
    const people = google.people({ version: 'v1', auth })

    const photos = {}

    // Fetch photos for members with email addresses
    // We'll batch these requests to avoid rate limiting
    const batchSize = 10
    const membersWithEmail = members.filter(m => m.email)

    for (let i = 0; i < membersWithEmail.length; i += batchSize) {
      const batch = membersWithEmail.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (member) => {
          try {
            // Search for the person by email
            const searchResponse = await people.people.searchContacts({
              query: member.email,
              readMask: 'names,emailAddresses,photos',
              pageSize: 1
            })

            if (searchResponse.data.results && searchResponse.data.results.length > 0) {
              const person = searchResponse.data.results[0].person
              
              // Get the photo URL if available
              if (person.photos && person.photos.length > 0) {
                const photoUrl = person.photos[0].url
                if (photoUrl) {
                  photos[member.id] = photoUrl
                }
              }
            }
          } catch (error) {
            // Log error but continue with other members
            console.error(`Error fetching photo for ${member.email}:`, error.message)
          }
        })
      )

      // Add a small delay between batches to respect rate limits
      if (i + batchSize < membersWithEmail.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return NextResponse.json({ photos })
  } catch (error) {
    console.error('Error fetching profile photos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile photos', photos: {} },
      { status: 500 }
    )
  }
}

// Alternative: Using Google OAuth2 for user-authenticated access
// This approach would require users to authenticate with their Google account
export async function GET(request) {
  try {
    // This would be used if you want to use OAuth2 flow
    // instead of service account authentication
    
    // Check if user has authenticated
    const accessToken = request.headers.get('authorization')?.split('Bearer ')[1]
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Use the access token to call People API
    const people = google.people({ version: 'v1' })
    
    // Example: Get user's own profile photo
    const response = await people.people.get({
      resourceName: 'people/me',
      personFields: 'photos,names,emailAddresses',
      access_token: accessToken
    })

    return NextResponse.json({ profile: response.data })
  } catch (error) {
    console.error('Error in GET /api/get-profile-photos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}