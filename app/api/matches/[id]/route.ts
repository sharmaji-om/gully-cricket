import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/supabase/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Invalid match ID' }, { status: 400 })
  try {
    const { data, error } = await createServiceRoleClient().from('matches').select('state').eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    return NextResponse.json(data.state)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceRoleClient()

    const { error } = await supabase.rpc('delete_cricket_matches', { p_id: params.id })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
