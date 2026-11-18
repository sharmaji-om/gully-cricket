import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/supabase/server'
import { settingsSchema } from '@/lib/database/validation'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await createServiceRoleClient().from('club_settings').select('settings').eq('id', 'default').single()
    if (error) throw error
    return NextResponse.json(settingsSchema.parse(data.settings))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const parsed = settingsSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
    const { error } = await createServiceRoleClient().from('club_settings').upsert({ id: 'default', settings: parsed.data })
    if (error) throw error
    return NextResponse.json(parsed.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
