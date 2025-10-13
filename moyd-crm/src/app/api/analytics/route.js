import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || '30' // days

    const daysAgo = parseInt(timeframe)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysAgo)

    // 1. Total intros sent
    const { count: totalIntrosSent } = await supabase
      .from('intro_sends')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', startDate.toISOString())

    // 2. Failed intros
    const { count: failedIntros } = await supabase
      .from('intro_sends')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('sent_at', startDate.toISOString())

    // 3. Total opt-outs in timeframe
    const { count: optOutsCount } = await supabase
      .from('opt_out_log')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'opt_out')
      .gte('timestamp', startDate.toISOString())

    // 4. Total opt-ins in timeframe
    const { count: optInsCount } = await supabase
      .from('opt_out_log')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'opt_in')
      .gte('timestamp', startDate.toISOString())

    // 5. Current total opted-out members
    const { count: currentOptedOut } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('opt_out', true)

    // 6. Total active members
    const { count: totalActiveMembers } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('opt_out', false)

    // 7. Intros sent by day (for chart)
    const { data: introsByDay } = await supabase
      .from('intro_sends')
      .select('sent_at')
      .eq('status', 'sent')
      .gte('sent_at', startDate.toISOString())
      .order('sent_at', { ascending: true })

    // Group by day
    const dayMap = {}
    introsByDay?.forEach(intro => {
      const day = new Date(intro.sent_at).toISOString().split('T')[0]
      dayMap[day] = (dayMap[day] || 0) + 1
    })

    const chartData = Object.entries(dayMap).map(([date, count]) => ({
      date,
      count
    }))

    // 8. Opt-outs by day (for chart)
    const { data: optOutsByDay } = await supabase
      .from('opt_out_log')
      .select('timestamp, action')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: true })

    // Group by day and action
    const optOutDayMap = {}
    optOutsByDay?.forEach(log => {
      const day = new Date(log.timestamp).toISOString().split('T')[0]
      if (!optOutDayMap[day]) {
        optOutDayMap[day] = { opt_out: 0, opt_in: 0 }
      }
      optOutDayMap[day][log.action]++
    })

    const optOutChartData = Object.entries(optOutDayMap).map(([date, counts]) => ({
      date,
      opt_out: counts.opt_out,
      opt_in: counts.opt_in
    }))

    // 9. Most recent intro sends
    const { data: recentIntros } = await supabase
      .from('intro_sends')
      .select(`
        id,
        sent_at,
        status,
        member_id,
        members (
          name,
          phone_e164
        )
      `)
      .order('sent_at', { ascending: false })
      .limit(10)

    // 10. Most recent opt-outs/ins
    const { data: recentOptOuts } = await supabase
      .from('opt_out_log')
      .select(`
        id,
        timestamp,
        action,
        message_text,
        member_id,
        members (
          name,
          phone_e164
        )
      `)
      .order('timestamp', { ascending: false })
      .limit(10)

    // 11. Success rate
    const successRate = totalIntrosSent > 0 
      ? ((totalIntrosSent / (totalIntrosSent + failedIntros)) * 100).toFixed(1)
      : 0

    // 12. Opt-out rate (of people who received intros)
    const { count: totalRecipients } = await supabase
      .from('intro_sends')
      .select('member_id', { count: 'exact', head: true })
      .eq('status', 'sent')

    const optOutRate = totalRecipients > 0 
      ? ((currentOptedOut / totalRecipients) * 100).toFixed(1)
      : 0

    return NextResponse.json({
      summary: {
        totalIntrosSent: totalIntrosSent || 0,
        failedIntros: failedIntros || 0,
        optOutsCount: optOutsCount || 0,
        optInsCount: optInsCount || 0,
        currentOptedOut: currentOptedOut || 0,
        totalActiveMembers: totalActiveMembers || 0,
        successRate: parseFloat(successRate),
        optOutRate: parseFloat(optOutRate)
      },
      charts: {
        introsByDay: chartData,
        optOutsByDay: optOutChartData
      },
      recent: {
        intros: recentIntros || [],
        optOuts: recentOptOuts || []
      },
      timeframe: daysAgo
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}