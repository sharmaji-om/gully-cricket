import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/supabase/server'
export { POST } from './sync/route'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    if (searchParams.get('active') === 'true') {
      const { data, error } = await supabase.from('matches').select('state').in('status', ['live', 'innings_break']).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return NextResponse.json(data?.state ?? null)
    }

    let query = supabase
      .from('matches')
      .select('id, status, team_a_name, team_b_name, winner_team, total_overs, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const { error } = await supabase.rpc('delete_cricket_matches', { p_status: status })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
