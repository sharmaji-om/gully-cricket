import { NextRequest, NextResponse } from 'next/server'
import { coachContextSchema, matchContextSchema, teamsContextSchema, validateTeamSwap, type AiFeature } from '@/lib/ai/contracts'
import { AiError, generateReport, geminiConfigured, geminiModel } from '@/lib/ai/gemini'

export const runtime = 'nodejs'
export const maxDuration = 30
const limits = new Map<string, { count: number; until: number }>()
let globalWindow = { count: 0, until: 0 }
// Process-local limits keep the local club app bounded; they are not a distributed quota service.
function allowRequest(key: string) {
  const now = Date.now()
  if (globalWindow.until <= now) globalWindow = { count: 0, until: now + 3600000 }
  for (const [id, entry] of limits) if (entry.until <= now) limits.delete(id)
  const entry = limits.get(key) ?? { count: 0, until: now + 60000 }
  if (entry.count >= 6 || globalWindow.count >= 100) return false
  entry.count++; globalWindow.count++; limits.set(key, entry)
  return true
}
export async function POST(request: NextRequest, { params }: { params: { feature: string } }) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  const feature = params.feature as AiFeature
  if (!['teams', 'match', 'coach'].includes(feature)) return reply({ error: 'Unknown AI feature.', code: 'NOT_FOUND' }, 404)
  const origin = request.headers.get('origin')
  const hostOrigin = `${request.nextUrl.protocol}//${request.headers.get('host') || request.nextUrl.host}`
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== hostOrigin)) {
    return reply({ error: 'Please use Gemini from this app.', code: 'INVALID_ORIGIN' }, 403)
  }
  if (!geminiConfigured()) return reply({ error: 'Gemini is not connected yet.', code: 'NOT_CONFIGURED' }, 503)
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Send a JSON request.', code: 'INVALID_REQUEST' }, 415)
  try {
    // Read at most 96 KB, including requests sent without Content-Length.
    const reader = request.body?.getReader()
    if (!reader) return reply({ error: 'Missing request body.', code: 'INVALID_REQUEST' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength
      if (size > 98304) { await reader.cancel(); return reply({ error: 'Too much cricket data in one request.', code: 'TOO_LARGE' }, 413) }
      chunks.push(chunk.value)
    }
    let body: unknown
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { return reply({ error: 'Invalid JSON request.', code: 'INVALID_REQUEST' }, 400) }
    const schema = feature === 'teams' ? teamsContextSchema : feature === 'coach' ? coachContextSchema : matchContextSchema
    const parsed = schema.safeParse(body)
    if (!parsed.success) return reply({ error: 'The cricket data is incomplete or invalid.', code: 'INVALID_CONTEXT' }, 400)
    const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    if (!allowRequest(client)) return reply({ error: 'Too many AI requests. Try again later.', code: 'RATE_LIMITED' }, 429)
    const report = await generateReport(feature, parsed.data, request.signal)
    if (feature === 'teams') {
      try { validateTeamSwap(report, teamsContextSchema.parse(parsed.data)) }
      catch { throw new AiError('INVALID_SWAP', 'Gemini suggested an invalid swap. Please generate a fresh review.') }
    } else { report.swap = null }
    return reply({ report, model: geminiModel(), generated_at: new Date().toISOString() })
  } catch (error) {
    if (error instanceof AiError) return reply({ error: error.message, code: error.code }, error.status)
    return reply({ error: 'Couldn’t prepare this analysis. Please try again.', code: 'INTERNAL_ERROR' }, 500)
  }
}
