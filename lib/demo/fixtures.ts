import type { Player, Team, TeamBalance, Match, MatchRules, InningsState, Ball, BatsmanState } from '@/types'
import { computeScore, getBallRuns } from '@/scoring/engine'

const created = '2026-11-01T10:00:00.000Z'
const roster: [string, Player['preferred_role'], number, number, number, number, number][] = [
  ['Aarav Sharma', 'batsman', 9, 4, 8, 428, 8],
  ['Kabir Mehta', 'bowler', 5, 9, 7, 142, 26],
  ['Rohan Nair', 'allrounder', 8, 8, 8, 356, 19],
  ['Dev Patel', 'wicketkeeper', 8, 3, 9, 312, 3],
  ['Arjun Rao', 'bowler', 4, 9, 7, 96, 28],
  ['Ishaan Das', 'allrounder', 7, 7, 8, 264, 16],
  ['Vihaan Shah', 'batsman', 9, 4, 7, 402, 6],
  ['Aditya Sen', 'bowler', 5, 8, 8, 128, 23],
  ['Kunal Verma', 'allrounder', 8, 7, 9, 296, 17],
  ['Neel Kapoor', 'wicketkeeper', 7, 3, 9, 218, 2],
  ['Yash Iyer', 'bowler', 4, 8, 8, 84, 24],
  ['Dhruv Joshi', 'allrounder', 7, 8, 7, 242, 21],
]
export const demoPlayers: Player[] = roster.map(([name, role, batting, bowling, fielding, runs, wickets], i) => ({
  id: `demo-player-${i + 1}`, name, nickname: ['Flash', 'Yorker', 'Rockstar', 'Gloves', 'Rocket', 'Captain', 'Six Machine', 'Swing', 'Chase', 'Safe Hands', 'Spin', 'Finisher'][i],
  preferred_role: role, batting_skill: batting, bowling_skill: bowling, fielding_skill: fielding,
  matches_played: 18, total_runs: runs, total_wickets: wickets,
  strike_rate: Math.round((125 + batting * 5.3) * 10) / 10,
  economy: Math.round((12 - bowling * .55) * 10) / 10,
  catches: 4 + i % 7, run_outs: i % 4, mvps: i % 4, wins: 9 + i % 4, losses: 9 - i % 4,
  ai_balance_score: Math.round((batting * .4 + bowling * .4 + fielding * .2) * 10) / 10,
  form_trend: i % 4 === 0 ? 'rising' : i % 5 === 0 ? 'falling' : 'stable',
  clutch_factor: 6 + i % 4, created_at: created, updated_at: created,
}))
function team(id: string, name: string, players: Player[], color: string): Team {
  const avg = (key: 'batting_skill' | 'bowling_skill' | 'ai_balance_score') => Math.round(players.reduce((s, p) => s + p[key], 0) / players.length * 10) / 10
  return { id, name, players, captain: players[2], color, strength_score: avg('ai_balance_score'), batting_strength: avg('batting_skill'), bowling_strength: avg('bowling_skill') }
}
export const demoBalance: TeamBalance = {
  team_a: team('demo-team-a', 'Gully Strikers', demoPlayers.slice(0, 6), '#d2f65a'),
  team_b: team('demo-team-b', 'Street Royals', demoPlayers.slice(6), '#7daaff'),
  fairness_percentage: 98, team_a_win_probability: 51, team_b_win_probability: 49, balance_score: 9.8,
}
const rules: MatchRules = { roof_catch_enabled: true, caught_behind_enabled: true, one_tip_one_hand_enabled: true,
  bounce_rule_enabled: true, direct_six_out_enabled: false, free_hit_enabled: true, powerplay_enabled: false,
  max_overs: 6, max_players: 6, ball_type: 'tennis', ground_type: 'Neighbourhood ground', retirement_mode: 'returnable', retirement_score_limit: 30 }

function innings(batting: Team, bowling: Team, deliveries: number[], wickets: number[], prefix: string): InningsState {
  const entries = new Map<string, BatsmanState>()
  const entry = (index: number) => {
    const player = batting.players[index]
    if (!entries.has(player.id)) entries.set(player.id, { player, runs: 0, balls_faced: 0, fours: 0, sixes: 0, is_striker: false, is_retired: false, return_eligible: false })
    return entries.get(player.id)!
  }
  let striker = 0, partner = 1, next = 2
  const fall: InningsState['fall_of_wickets'] = []
  const balls: Ball[] = []
  for (let index = 0; index < deliveries.length; index++) {
    const runs = deliveries[index], out = wickets.includes(index)
    const ball: Ball = { id: `${prefix}-ball-${index}`, match_id: prefix, innings: prefix.endsWith('-2') ? 2 : 1,
      over_number: Math.floor(index / 6), ball_number: index % 6 + 1,
      type: out ? 'wicket' : runs === 6 ? 'six' : runs === 4 ? 'four' : runs === 0 ? 'dot' : 'run',
      runs: out ? 0 : runs, striker_id: batting.players[striker].id, non_striker_id: batting.players[partner].id,
      bowler_id: bowling.players[(Math.floor(index / 6) + 1) % 6].id,
      is_legal: true, ...(out ? { wicket_type: 'bowled' as const } : {}), timestamp: created }
    const current = entry(striker); entry(partner); current.balls_faced++
    current.runs += ball.runs; if (runs === 4 && !out) current.fours++; if (runs === 6 && !out) current.sixes++
    balls.push(ball)
    if (out) {
      fall.push({ wicket_number: fall.length + 1, player_id: current.player.id, score: computeScore(balls).runs, over: ball.over_number, ball: ball.ball_number, dismissal_type: 'bowled' })
      striker = next++; entry(striker)
    } else if (runs % 2) { [striker, partner] = [partner, striker] }
    if (index % 6 === 5) [striker, partner] = [partner, striker]
  }
  for (const batter of entries.values()) batter.is_striker = batter.player.id === batting.players[striker].id
  const bowlerPlayer = bowling.players[(Math.floor((balls.length - 1) / 6) + 1) % 6]
  const bowlerBalls = balls.filter(b => b.bowler_id === bowlerPlayer.id)
  const score = computeScore(balls)
  return { batting_team: batting, bowling_team: bowling, batsmen: Array.from(entries.values()),
    bowler: { player: bowlerPlayer, overs_bowled: Math.floor(bowlerBalls.length / 6), balls_in_current_over: bowlerBalls.length % 6,
      runs_conceded: bowlerBalls.reduce((s, b) => s + getBallRuns(b.type, b.runs), 0), wickets: bowlerBalls.filter(b => b.type === 'wicket').length, dots: bowlerBalls.filter(b => b.type === 'dot').length, wides: 0, no_balls: 0 },
    score, balls, partnerships: [], fall_of_wickets: fall, current_partnership: null, retired_players: [], return_eligible_players: [], bounce_this_over: 0 }
}
const first = [1,0,4,1,2,0,6,1,0,4,1,2,0,1,4,6,1,0,2,1,4,0,1,6,1,2,0,4,1,1,6,0,2,4,1,2]
const second = [0,4,1,1,6,0,2,1,4,0,1,2,6,1,0,4,2,1,0,1,4,1,6,0,2,4,1,1,0,6,1,2,4,1,6,4]
export function createDemoMatch(id: string, live = false, date = '2026-11-17'): Match {
  const a = demoBalance.team_a, b = demoBalance.team_b
  const one = innings(a, b, first, [8, 20, 31], `${id}-1`)
  const two = innings(b, a, live ? second.slice(0, 26) : second, [11, 23], `${id}-2`)
  // Live scoring expects just the current two batters; completed scorecards retain all recorded batters.
  if (live) {
    const out = new Set(two.fall_of_wickets.map(w => w.player_id))
    two.batsmen = two.batsmen.filter(p => !out.has(p.player.id))
  }
  const winner = two.score.runs > one.score.runs ? b : one.score.runs > two.score.runs ? a : null
  return { id, team_a: a, team_b: b, rules, toss_winner_id: a.id, toss_decision: 'bat', innings: 2,
    innings1: one, innings2: two, current_innings: two, target: one.score.runs + 1,
    ...(live ? {} : { result: winner?.id === a.id ? 'team_a_won' as const : winner ? 'team_b_won' as const : 'tie' as const, winner_team_id: winner?.id, completed_at: `${date}T12:00:00.000Z` }),
    commentary: two.balls.slice(-6).reverse().map(ball => ({ id: `comment-${ball.id}`, ball_id: ball.id, text: ball.type === 'wicket' ? 'Bowled! The stumps go flying.' : ball.runs === 6 ? 'Six! That one is out of the gully.' : ball.runs === 4 ? 'Four! Finds the gap beautifully.' : `${ball.runs} run${ball.runs === 1 ? '' : 's'} added to the board.`, type: 'ball', timestamp: created, is_highlight: ball.runs >= 4 || ball.type === 'wicket' })),
    momentum: [], is_super_over: false, created_at: `${date}T10:00:00.000Z`, status: live ? 'live' : 'completed' }
}
export function createDemoData() {
  return structuredClone({ players: demoPlayers, matches: [createDemoMatch('demo-match-1'), createDemoMatch('demo-match-2', false, '2026-11-15'), createDemoMatch('demo-match-3', false, '2026-11-12')] })
}
export type DemoData = ReturnType<typeof createDemoData>
