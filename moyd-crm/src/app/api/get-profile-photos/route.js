// FIXED VERSION - moyd-crm/src/app/api/get-profile-photos/route.js
// This API route fetches profile photos from Google People API
// FIX: Proper private key parsing to avoid DECODER error

import { NextResponse } from 'next/server'
import { google } from 'googleapis'

// Initialize Google People API with proper key handling
function getGoogleAuth() {
  try {
    // Get the private key and handle the newlines properly
    let privateKey = process.env.GOOGLE_PRIVATE_KEY
    
    if (!privateKey) {
      console.warn('GOOGLE_PRIVATE_KEY not found')
      return null
    }

    // Remove quotes if they exist (from Vercel env vars)
    privateKey = privateKey.replace(/^"(.*)"$/, '$1')
    
    // Replace literal \n with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n')

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: [
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/directory.readonly',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
    })
    
    return auth
  } catch (error) {
    console.error('Error creating Google Auth:', error)
    return null
  }
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
      console.warn('Google API credentials not configured - returning empty photos')
      return NextResponse.json({ photos: {} })
    }

    const auth = getGoogleAuth()
    if (!auth) {
      console.error('Failed to create Google Auth')
      return NextResponse.json({ photos: {} })
    }

    const people = google.people({ version: 'v1', auth })

    const photos = {}

    // Fetch photos for members with email addresses
    // We'll batch these requests to avoid rate limiting
    const batchSize = 5
    const membersWithEmail = members.filter(m => m.email)

    console.log(`Fetching photos for ${membersWithEmail.length} members`)

    for (let i = 0; i < membersWithEmail.length; i += batchSize) {
      const batch = membersWithEmail.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (member) => {
          try {
            // Search for the person by email using searchContacts
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
                  console.log(`✓ Found photo for ${member.email}`)
                }
              } else {
                console.log(`✗ No photo for ${member.email}`)
              }
            } else {
              console.log(`✗ Not found in contacts: ${member.email}`)
            }
          } catch (error) {
            // Log error but continue with other members
            console.error(`Error fetching photo for ${member.email}:`, error.message)
          }
        })
      )

      // Add a small delay between batches to respect rate limits
      if (i + batchSize < membersWithEmail.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    console.log(`Successfully fetched ${Object.keys(photos).length} photos`)
    return NextResponse.json({ photos })
  } catch (error) {
    console.error('Error in profile photos API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile photos', photos: {} },
      { status: 500 }
    )
  }
}