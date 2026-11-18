// Exercise the AI and local-data flows with mocked Gemini HTTP and a small NextResponse adapter.
// No API key, network request, Supabase connection, or Next server is needed.
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const originalLoad = Module._load
Module._load = function (name, parent, main) {
  if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } }
  // UUID isn't used by the scoring/context functions under test.
  if (name === 'uuid') return { v4: () => 'test-generated-id' }
  return originalLoad(name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main)
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename)

const contracts = require('../lib/ai/contracts.ts')
const { generateReport } = require('../lib/ai/gemini.ts')
const { playerContext, matchContext } = require('../lib/ai/context.ts')
const { swapPlayerBetweenTeams } = require('../balancing/engine.ts')
const { POST } = require('../app/api/ai/[feature]/route.ts')
const { GET } = require('../app/api/ai/status/route.ts')
const originalFetch = global.fetch
const originalKey = process.env.GEMINI_API_KEY
const originalModel = process.env.GEMINI_MODEL
let clientId = 0
const player = id => ({ id, name: id, role: 'allrounder', batting: 5, bowling: 5, fielding: 5, matches: 0, runs: 0, wickets: 0, strike_rate: 0, economy: 0 })
const teamContext = () => ({ team_a: { name: 'A', players: [player('a')] }, team_b: { name: 'B', players: [player('b')] } })
const coachContext = () => ({ player: player('a'), focus: 'batting', goal: 'Rotate strike' })
const report = () => ({ title: 'A close contest', summary: 'Both sides have similar ratings.', insights: [{ title: 'Skill balance', detail: 'The recorded ratings are equal.' }], actions: [{ title: 'Practice', detail: 'Try ten minutes of controlled singles.' }], data_note: 'No match history; this uses self-rated skills.', swap: null })
function providerResponse(value = report(), finishReason = 'STOP') {
  return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] })
}
function request(body, headers = {}) {
  const value = new Request('http://localhost:3000/api/ai/teams', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': String(++clientId), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  value.nextUrl = new URL(value.url)
  return value
}
beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key-not-real'; process.env.GEMINI_MODEL = 'test-model'; global.fetch = async () => { throw new Error('Unexpected network call') } })
afterEach(() => {
  global.fetch = originalFetch
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey
  if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel
})

test('missing key returns NOT_CONFIGURED without invoking Gemini', async () => {
  delete process.env.GEMINI_API_KEY
  await assert.rejects(generateReport('coach', coachContext()), e => e.code === 'NOT_CONFIGURED')
  const response = await POST(request(teamContext()), { params: { feature: 'teams' } })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'NOT_CONFIGURED')
})
test('connection status exposes only a boolean and never caches', async () => {
  const response = GET()
  assert.deepEqual(await response.json(), { configured: true })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
test('provider uses a server header, a schema, and the selected model', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /models\/test-model:generateContent$/)
    assert.ok(!url.includes('test-key-not-real'))
    assert.equal(options.headers['x-goog-api-key'], 'test-key-not-real')
    const body = JSON.parse(options.body)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.ok(body.generationConfig.responseJsonSchema.required.includes('swap'))
    assert.match(body.systemInstruction.parts[0].text, /No match history|matches is zero/)
    return providerResponse()
  }
  assert.deepEqual(await generateReport('coach', coachContext()), report())
})
test('provider quota, invalid keys, model errors, and network errors are sanitised', async () => {
  for (const [status, code] of [[429, 'PROVIDER_LIMIT'], [403, 'PROVIDER_AUTH'], [404, 'MODEL_UNAVAILABLE'], [500, 'PROVIDER_ERROR']]) {
    global.fetch = async () => new Response('private-provider-detail', { status })
    await assert.rejects(generateReport('teams', teamContext()), e => e.code === code && !e.message.includes('private-provider-detail'))
  }
  global.fetch = async () => { throw new Error('private-key-or-network-detail') }
  await assert.rejects(generateReport('teams', teamContext()), e => e.code === 'UNAVAILABLE' && !e.message.includes('private'))
})
test('truncated, blocked, malformed, and schema-invalid model responses are rejected', async () => {
  global.fetch = async () => providerResponse(report(), 'MAX_TOKENS')
  await assert.rejects(generateReport('match', {}), e => e.code === 'INCOMPLETE_RESPONSE')
  global.fetch = async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } })
  await assert.rejects(generateReport('match', {}), e => e.code === 'INCOMPLETE_RESPONSE')
  global.fetch = async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not-json' }] } }] })
  await assert.rejects(generateReport('match', {}), e => e.code === 'INVALID_RESPONSE')
  global.fetch = async () => providerResponse({ title: 'Missing fields' })
  await assert.rejects(generateReport('match', {}), e => e.code === 'INVALID_RESPONSE')
})
test('request cancellation aborts the Gemini fetch', async () => {
  const controller = new AbortController()
  global.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  const result = generateReport('coach', coachContext(), controller.signal)
  controller.abort()
  await assert.rejects(result, e => e.code === 'CANCELLED')
})
test('provider timeout releases the request with a retryable error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  global.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  const result = generateReport('coach', coachContext())
  t.mock.timers.tick(25000)
  await assert.rejects(result, e => e.code === 'TIMEOUT' && e.status === 504)
})
test('only unique, equally sized teams and one shared common player are accepted', () => {
  assert.ok(contracts.teamsContextSchema.safeParse(teamContext()).success)
  const shared = { ...teamContext(), common_player_id: 'c' }
  shared.team_a.players.push(player('c')); shared.team_b.players.push(player('c'))
  assert.ok(contracts.teamsContextSchema.safeParse(shared).success)
  delete shared.common_player_id
  assert.ok(!contracts.teamsContextSchema.safeParse(shared).success)
  const duplicate = teamContext(); duplicate.team_a.players.push(player('a'))
  assert.ok(!contracts.teamsContextSchema.safeParse(duplicate).success)
})
test('unknown, wrong-side, and common-player swaps are rejected', () => {
  const context = teamContext()
  assert.doesNotThrow(() => contracts.validateTeamSwap({ swap: { from_a: 'a', from_b: 'b' } }, context))
  for (const swap of [{ from_a: 'unknown', from_b: 'b' }, { from_a: 'b', from_b: 'a' }, { from_a: 'a', from_b: 'a' }]) {
    assert.throws(() => contracts.validateTeamSwap({ swap }, context))
  }
  assert.throws(() => contracts.validateTeamSwap({ swap: { from_a: 'a', from_b: 'b' } }, { ...context, common_player_id: 'a' }))
})
test('invalid context, bad JSON, oversize bodies, and cross-site requests do not invoke Gemini', async () => {
  for (const [body, headers, status] of [[{}, {}, 400], ['{broken', {}, 400], ['x'.repeat(99000), {}, 413], [teamContext(), { origin: 'https://other.example' }, 403], [teamContext(), { 'sec-fetch-site': 'cross-site' }, 403], [teamContext(), { 'Content-Type': 'text/plain' }, 415]]) {
    assert.equal((await POST(request(body, headers), { params: { feature: 'teams' } })).status, status)
  }
  assert.equal((await POST(request({}), { params: { feature: 'unknown' } })).status, 404)
})
test('team review succeeds, but invalid suggested swaps never reach the UI', async () => {
  global.fetch = async () => providerResponse({ ...report(), swap: { from_a: 'a', from_b: 'b', reason: 'Try another pairing.' } })
  const response = await POST(request(teamContext()), { params: { feature: 'teams' } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).report.swap.from_a, 'a')
  global.fetch = async () => providerResponse({ ...report(), swap: { from_a: 'invented', from_b: 'b', reason: 'Invalid' } })
  const invalid = await POST(request(teamContext()), { params: { feature: 'teams' } })
  assert.equal(invalid.status, 502)
  assert.equal((await invalid.json()).code, 'INVALID_SWAP')
})
test('coaching is valid for a new player and cannot return an actionable team swap', async () => {
  assert.ok(contracts.coachContextSchema.safeParse(coachContext()).success)
  global.fetch = async () => providerResponse({ ...report(), swap: { from_a: 'a', from_b: 'b', reason: 'Ignore' } })
  const response = await POST(request(coachContext()), { params: { feature: 'coach' } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).report.swap, null)
})
test('rate limit prevents a seventh request from one client', async () => {
  let calls = 0
  global.fetch = async () => { calls++; return providerResponse() }
  for (let i = 0; i < 7; i++) {
    const response = await POST(request(coachContext(), { 'x-forwarded-for': 'rate-limit-test' }), { params: { feature: 'coach' } })
    assert.equal(response.status, i < 6 ? 200 : 429)
  }
  assert.equal(calls, 6)
})
test('player context excludes unrelated personal fields', () => {
  const result = playerContext({ ...player('a'), preferred_role: 'allrounder', batting_skill: 5, bowling_skill: 5, fielding_skill: 5, matches_played: 0, total_runs: 0, total_wickets: 0, user_id: 'private', email: 'private@example.com', avatar_url: 'private', created_at: 'private' })
  assert.ok(contracts.playerContextSchema.safeParse(result).success)
  assert.ok(!JSON.stringify(result).includes('private'))
})
test('match context uses recorded extras and one-based overs without fabricated batting figures', async () => {
  const innings = { batting_team: { name: 'B' }, score: { runs: 8, wickets: 0, legal_balls: 1, extras: 2 }, balls: [{ over_number: 0, type: 'six', runs: 6 }, { over_number: 0, type: 'wide', runs: 1 }], batsmen: [], retired_players: [] }
  const context = matchContext({ team_a: { id: 'a', name: 'A' }, team_b: { id: 'b', name: 'B' }, winner_team_id: 'b', result: 'team_b_won', rules: { max_overs: 6 }, innings1: innings, innings2: null })
  assert.ok(contracts.matchContextSchema.safeParse(context).success)
  assert.equal(context.winner, 'B')
  assert.deepEqual(context.innings[0].overs, [{ over: 1, runs: 8, wickets: 0 }])
  assert.deepEqual(context.innings[0].batting, [])
  global.fetch = async () => providerResponse()
  assert.equal((await POST(request(context), { params: { feature: 'match' } })).status, 200)
})
test('applying a suggested swap retains membership and recalculates every balance metric', () => {
  const p = (id, skill) => ({ ...player(id), preferred_role: 'allrounder', batting_skill: skill, bowling_skill: skill, fielding_skill: skill, matches_played: 0, total_runs: 0, total_wickets: 0, wins: 0, form_trend: 'stable' })
  const a1 = p('a1', 9), a2 = p('a2', 8), b1 = p('b1', 2), b2 = p('b2', 3)
  const balance = { team_a: { name: 'A', players: [a1, a2] }, team_b: { name: 'B', players: [b1, b2] }, balance_score: -1 }
  const swapped = swapPlayerBetweenTeams(balance, 'a1', 'b1')
  assert.deepEqual(swapped.team_a.players.map(p => p.id), ['b1', 'a2'])
  assert.deepEqual(swapped.team_b.players.map(p => p.id), ['a1', 'b2'])
  assert.equal(swapped.balance_score, swapped.fairness_percentage / 10)
  assert.equal(swapped.team_a_win_probability + swapped.team_b_win_probability, 100)
  assert.ok(Number.isFinite(swapped.team_a.strength_score))
})

const { createDemoData, createDemoMatch, demoBalance } = require('../lib/demo/fixtures.ts')
const { createDemoApi } = require('../lib/demo/api.ts')
test('demo fixtures populate a full squad, history, and a playable live chase', () => {
  const data = createDemoData(), live = createDemoMatch('demo-live-match', true)
  assert.equal(data.players.length, 12)
  assert.equal(new Set(data.players.map(p => p.id)).size, 12)
  assert.equal(data.matches.length, 3)
  assert.ok(data.matches.every(m => m.status === 'completed'))
  assert.equal(live.status, 'live')
  assert.equal(live.current_innings.batsmen.length, 2)
  assert.equal(live.current_innings.batsmen.filter(b => b.is_striker).length, 1)
  assert.ok(live.current_innings.bowler)
  assert.ok(live.current_innings.score.runs < live.target)
  assert.equal(live.current_innings.score.legal_balls, 26)
  assert.ok(contracts.teamsContextSchema.safeParse(require('../lib/ai/context.ts').teamsContext(demoBalance)).success)
  for (const m of data.matches) assert.ok(contracts.matchContextSchema.safeParse(matchContext(m)).success)
})
test('demo API fills dashboard, leaderboard, and player profiles without a database', async () => {
  const api = createDemoApi()
  const call = (route, method = 'GET', body = null) => api.handle(new URL('http://localhost:3000'+route), method, body)
  assert.equal((await call('/api/players').json()).length, 12)
  assert.equal((await call('/api/stats').json()).length, 12)
  const history = await call('/api/matches?status=completed').json()
  assert.equal(history.length, 3)
  assert.equal(history[0].winner_team, 'Street Royals')
  assert.equal((await call('/api/players/demo-player-1').json()).name, 'Aarav Sharma')
  assert.equal(call('/api/players/unknown').status, 404)
})
test('demo player edits and deletion persist locally and reset restores the sample squad', async () => {
  let saved
  const api = createDemoApi(undefined, state => { saved = state })
  const call = (route, method, body) => api.handle(new URL('http://localhost:3000'+route), method, body)
  const added = await call('/api/players', 'POST', { name: 'Demo Guest', batting_skill: 8 }).json()
  assert.equal(api.snapshot().players.length, 13)
  assert.equal(saved.players.length, 13)
  await call('/api/players/'+added.id, 'PATCH', { nickname: 'Guest' })
  assert.equal(api.snapshot().players.find(p => p.id === added.id).nickname, 'Guest')
  await call('/api/players/'+added.id, 'DELETE')
  assert.equal(api.snapshot().players.length, 12)
  api.reset()
  assert.equal(api.snapshot().players.length, 12)
})
test('demo match sync is idempotent and clearing history affects only demo state', async () => {
  const api = createDemoApi(), live = createDemoMatch('demo-live-match', true)
  const call = (route, method, body) => api.handle(new URL('http://localhost:3000'+route), method, body)
  await call('/api/matches/sync', 'POST', { match: live })
  await call('/api/matches/sync', 'POST', { match: live })
  assert.equal(api.snapshot().matches.length, 4)
  await call('/api/matches?status=completed', 'DELETE')
  assert.equal(api.snapshot().matches.length, 1)
  api.reset()
  assert.equal(api.snapshot().matches.length, 3)
})
test('every Gemini request bypasses dummy data and never receives a fake AI response', () => {
  const api = createDemoApi()
  for (const feature of ['status', 'teams', 'match', 'coach']) {
    for (const method of ['GET', 'POST']) assert.equal(api.handle(new URL('http://localhost:3000/api/ai/'+feature), method, {}), null)
  }
  assert.equal(api.handle(new URL('http://localhost:3000/api/unrelated'), 'GET', null), null)
})

test('same-origin loopback requests work when Next normalises its internal hostname', async () => {
  global.fetch = async () => providerResponse()
  const response = await POST(request(coachContext(), { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }), { params: { feature: 'coach' } })
  assert.equal(response.status, 200)
})
test('interactive Gemini Flash requests use minimal thinking to stay within the timeout', async () => {
  process.env.GEMINI_MODEL = 'gemini-3-flash-preview'
  global.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL')
    return providerResponse()
  }
  await generateReport('coach', coachContext())
})
