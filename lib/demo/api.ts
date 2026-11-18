import type { Player, Match } from '@/types'
import { createDemoData, type DemoData } from './fixtures'
import { generateBalancedTeams } from '@/balancing/engine'
const json = (data: unknown, status = 200) => Response.json(data, { status })
function matchRow(m: Match) {
  return { id: m.id, status: m.status, team_a_name: m.team_a.name, team_b_name: m.team_b.name,
    winner_team: m.winner_team_id === m.team_a.id ? m.team_a.name : m.winner_team_id === m.team_b.id ? m.team_b.name : null,
    total_overs: m.rules.max_overs, created_at: m.created_at, completed_at: m.completed_at ?? null }
}
export function createDemoApi(initial: DemoData = createDemoData(), save: (state: DemoData) => void = () => {}) {
  let state = structuredClone(initial)
  const persist = () => save(structuredClone(state))
  return {
    snapshot: () => structuredClone(state),
    reset() { state = createDemoData(); persist(); return structuredClone(state) },
    handle(url: URL, method: string, body: unknown): Response | null {
      const route = url.pathname
      // Gemini is always real. No demo AI responses and no intercepted AI requests.
      if (route.startsWith('/api/ai/')) return null
      const input = body as Record<string, unknown> | null
      if (route === '/api/players') {
        if (method === 'GET') return json(state.players)
        if (method === 'POST') {
          if (typeof input?.name !== 'string' || !input.name.trim()) return json({ error: 'Enter a player name' }, 400)
          const player: Player = { id: `demo-player-${crypto.randomUUID()}`, name: input.name.trim(), nickname: typeof input.nickname === 'string' ? input.nickname : undefined,
            preferred_role: 'allrounder', batting_skill: 5, bowling_skill: 5, fielding_skill: 5,
            matches_played: 0, total_runs: 0, total_wickets: 0, strike_rate: 0, economy: 0, catches: 0, run_outs: 0,
            mvps: 0, wins: 0, losses: 0, ai_balance_score: 5, form_trend: 'stable', clutch_factor: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          for (const key of ['batting_skill', 'bowling_skill', 'fielding_skill'] as const) if (typeof input[key] === 'number') player[key] = Math.min(10, Math.max(1, input[key] as number))
          if (['batsman', 'bowler', 'allrounder', 'wicketkeeper'].includes(String(input.preferred_role))) player.preferred_role = input.preferred_role as Player['preferred_role']
          state.players.push(player); persist(); return json(player, 201)
        }
      }
      if (route.startsWith('/api/players/')) {
        const id = decodeURIComponent(route.slice(13)), player = state.players.find(p => p.id === id)
        if (!player) return json({ error: 'Player not found' }, 404)
        if (method === 'GET') return json({ ...player, player_stats: [] })
        if (method === 'PATCH') {
          const allowed = ['name', 'nickname', 'preferred_role', 'batting_skill', 'bowling_skill', 'fielding_skill']
          Object.assign(player, Object.fromEntries(allowed.filter(key => input && key in input).map(key => [key, input![key]])), { updated_at: new Date().toISOString() })
          persist(); return json(player)
        }
        if (method === 'DELETE') { state.players = state.players.filter(p => p.id !== id); persist(); return json({ success: true }) }
      }
      if (route === '/api/stats' && method === 'GET') return json(state.players.map(p => ({ player_id: p.id, name: p.name, nickname: p.nickname,
        total_runs: p.total_runs, total_wickets: p.total_wickets, batting_strike_rate: p.strike_rate, bowling_economy: p.economy,
        total_matches: p.matches_played, total_fours: Math.floor(p.total_runs / 10), total_sixes: Math.floor(p.total_runs / 22) })))
      if (route === '/api/teams/generate' && method === 'POST') {
        const ids = Array.isArray(input?.player_ids) ? [...new Set(input.player_ids)] : []
        const players = state.players.filter(p => ids.includes(p.id))
        if (players.length < 2) return json({ error: 'Select at least two players' }, 400)
        return json(generateBalancedTeams(players, players.length % 2 ? players[players.length - 1].id : undefined,
          String(input?.team_a_name || 'Gully Strikers'), String(input?.team_b_name || 'Street Royals')))
      }
      if ((route === '/api/matches' || route === '/api/matches/sync') && method === 'POST') {
        const match = input?.match as Match | undefined
        if (!match?.id || !match.team_a || !match.team_b) return json({ error: 'Invalid match' }, 400)
        const index = state.matches.findIndex(m => m.id === match.id)
        if (index >= 0) state.matches[index] = structuredClone(match); else state.matches.unshift(structuredClone(match))
        persist(); return route.endsWith('/sync') ? json({ success: true, match_id: match.id }) : json(matchRow(match), 201)
      }
      if (route === '/api/matches') {
        const status = url.searchParams.get('status')
        if (method === 'GET') return json(state.matches.filter(m => !status || m.status === status).map(matchRow))
        if (method === 'DELETE') { state.matches = status ? state.matches.filter(m => m.status !== status) : []; persist(); return json({ success: true }) }
      }
      if (route.startsWith('/api/matches/') && method === 'DELETE') {
        const id = decodeURIComponent(route.slice('/api/matches/'.length))
        state.matches = state.matches.filter(m => m.id !== id); persist(); return json({ success: true })
      }
      return null
    },
  }
}
