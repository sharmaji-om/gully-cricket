import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/supabase/server'
import { buildMatchStats } from '@/lib/database/match-stats'
import { matchSnapshotSchema } from '@/lib/database/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = matchSnapshotSchema.safeParse(body.match)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid match snapshot' }, { status: 400 })
    const match = parsed.data
    const supabase = createServiceRoleClient()
    const { error } = await supabase.rpc('save_cricket_match', { p_match: match, p_stats: buildMatchStats(match) })
    if (error) throw error
    return NextResponse.json({ success: true, match_id: match.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
