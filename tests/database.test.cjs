const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const originalLoad = Module._load
Module._load = function(name, parent, main) {
  return originalLoad(name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, main)
}
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, file)

const { createSeedData, createSeedMatch } = require('../supabase/seed/fixtures.ts')
const { buildMatchStats } = require('../lib/database/match-stats.ts')
const { createSaveQueue } = require('../lib/database/match-sync.ts')
const { matchSnapshotSchema, settingsSchema } = require('../lib/database/validation.ts')
const uuid = '30000000-0000-4000-8000-000000000004'

test('Supabase seed has stable UUIDs and playable, schema-valid snapshots', () => {
  const data = createSeedData()
  assert.deepEqual(data, createSeedData())
  assert.equal(data.players.length, 12)
  assert.equal(new Set(data.players.map(p => p.id)).size, 12)
  assert.equal(data.matches.length, 3)
  for (const match of [...data.matches, createSeedMatch(uuid, true)]) matchSnapshotSchema.parse(match)
  const live = createSeedMatch(uuid, true)
  assert.equal(live.current_innings.batsmen.length, 2)
  assert.equal(live.current_innings.batsmen.filter(b => b.is_striker).length, 1)
  assert.ok(live.current_innings.score.runs < live.target)
})

test('completed match stats account for every batter and exclude run-outs from bowler wickets', () => {
  const match = createSeedData().matches[0]
  const dismissedId = match.innings1.fall_of_wickets[0].player_id
  match.innings1.batsmen = match.innings1.batsmen.filter(b => b.player.id !== dismissedId)
  const wicket = match.innings1.balls.find(b => b.type === 'wicket')
  wicket.wicket_type = 'run_out'
  wicket.fielder_id = match.innings1.bowling_team.players[0].id
  const stats = buildMatchStats(match)
  const batter = stats.find(s => s.player_id === dismissedId && s.innings === 1)
  assert.ok(batter.runs_scored > 0)
  assert.equal(batter.is_out, true)
  assert.equal(stats.reduce((sum, s) => sum + s.runs_scored, 0), match.innings1.score.runs + match.innings2.score.runs)
  assert.equal(stats.reduce((sum, s) => sum + s.wickets_taken, 0), match.innings1.score.wickets + match.innings2.score.wickets - 1)
  assert.equal(stats.reduce((sum, s) => sum + s.run_outs, 0), 1)
  assert.deepEqual(buildMatchStats(match), stats)
  assert.deepEqual(buildMatchStats(createSeedMatch(uuid, true)), [])
})

test('snapshot saves cannot overtake each other and the queue recovers after a failure', async () => {
  const calls = []
  let release
  const blocked = new Promise(resolve => { release = resolve })
  const save = createSaveQueue(async snapshot => {
    calls.push(snapshot)
    if (snapshot === 1) { await blocked; throw new Error('Connection lost') }
  })
  const first = save(1)
  const rejected = assert.rejects(first, /Connection lost/)
  const second = save(2)
  const third = save(3)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [1])
  release()
  await Promise.all([rejected, second, third])
  assert.deepEqual(calls, [1, 2, 3])
})

test('database validation rejects old browser IDs and accepts every supported retirement mode', () => {
  const match = createSeedMatch(uuid, true)
  assert.equal(matchSnapshotSchema.safeParse({ ...match, id: 'demo-live-match' }).success, false)
  for (const mode of ['returnable', 'retire_out', 'score_based', 'unlimited_swap']) {
    for (const ball of ['tape_ball', 'tennis', 'rubber', 'leather']) {
      assert.equal(settingsSchema.safeParse({ defaultRules: { ...match.rules, retirement_mode: mode, ball_type: ball }, soundEnabled: true }).success, true)
    }
  }
})
