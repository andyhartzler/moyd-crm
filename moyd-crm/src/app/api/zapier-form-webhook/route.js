import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for server
)

export async function POST(request) {
  try {
    const formData = await request.json()
    
    // Format phone to E.164
    let phone_e164 = formData.phone
    if (phone_e164) {
      phone_e164 = phone_e164.replace(/[\s\-\(\)]/g, '')
      if (!phone_e164.startsWith('+')) {
        phone_e164 = phone_e164.startsWith('1') && phone_e164.length === 11
          ? '+' + phone_e164
          : '+1' + phone_e164
      }
    }

    // Upsert member (update if exists, insert if new)
    const { data, error } = await supabase
      .from('members')
      .upsert({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        phone_e164: phone_e164,
        date_of_birth: formData.date_of_birth,
        preferred_pronouns: formData.preferred_pronouns,
        gender_identity: formData.gender_identity,
        address: formData.address,
        county: formData.county,
        congressional_district: formData.congressional_district,
        race: formData.race,
        sexual_orientation: formData.sexual_orientation,
        desire_to_lead: formData.desire_to_lead === 'Yes',
        hours_per_week: formData.hours_per_week,
        education_level: formData.education_level,
        registered_voter: formData.registered_voter === 'Yes',
        in_school: formData.in_school === 'Yes',
        school_name: formData.school_name,
        employed: formData.employed === 'Yes',
        industry: formData.industry,
        hispanic_latino: formData.hispanic_latino,
        accommodation_needs: formData.accommodation_needs,
        community_affiliations: formData.community_affiliations,
        languages: formData.languages,
        why_join: formData.why_join,
        committee: formData.committee,
        notes: formData.notes,
        created_at: new Date().toISOString(), // Add timestamp
      }, {
        onConflict: 'email' // Use email as unique identifier
      })

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}