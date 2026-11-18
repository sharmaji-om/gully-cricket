// Explicit, server-side seed. This code is never imported by the application.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
require('@next/env').loadEnvConfig(root)
const originalLoad = Module._load
Module._load = function(name, parent, main) {
  return originalLoad(name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main)
}
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, file)

async function seed() {
  const { createSeedData, createSeedMatch } = require('../supabase/seed/fixtures.ts')
  const { buildMatchStats } = require('../lib/database/match-stats.ts')
  const { matchSnapshotSchema } = require('../lib/database/validation.ts')
  const data = createSeedData()
  const matches = [...data.matches, createSeedMatch('30000000-0000-4000-8000-000000000004', true)]
  for (const match of matches) matchSnapshotSchema.parse(match)
  if (process.argv.includes('--dry-run')) {
    console.log(`Validated ${data.players.length} fictional players, ${data.matches.length} completed matches, and one live match. No database changes.`)
    return
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || url.includes('your-project') || key.includes('your_')) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.')
  const { createClient } = require('@supabase/supabase-js')
  const database = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: playerError } = await database.from('players').upsert(data.players, { onConflict: 'id', ignoreDuplicates: true })
  if (playerError) throw playerError
  let inserted = 0
  for (const match of matches) {
    const { data: existing, error: readError } = await database.from('matches').select('id').eq('id', match.id).maybeSingle()
    if (readError) throw readError
    if (existing) continue // Never replace a match somebody has already scored.
    const { error } = await database.rpc('save_cricket_match', { p_match: match, p_stats: buildMatchStats(match) })
    if (error) throw error
    inserted++
  }
  console.log(`Seed complete: fictional roster ensured; ${inserted} matches inserted. Existing records kept.`)
}
seed().catch(error => { console.error('Seed failed:', error.message); process.exitCode = 1 })
