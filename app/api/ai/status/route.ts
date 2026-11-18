import { NextResponse } from 'next/server'
import { geminiConfigured } from '@/lib/ai/gemini'
export const dynamic = 'force-dynamic'
export function GET() {
  return NextResponse.json({ configured: geminiConfigured() }, { headers: { 'Cache-Control': 'no-store' } })
}
