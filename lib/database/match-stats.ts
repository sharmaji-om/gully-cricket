import type { Match, PlayerStats } from '@/types'
import { getBallRuns } from '@/scoring/engine'

// Rebuild from deliveries: dismissed batters are no longer in the live pair.
export function buildMatchStats(match: Match): Omit<PlayerStats, 'created_at'>[] {
  if (match.status !== 'completed') return []
  const stats: Omit<PlayerStats, 'created_at'>[] = []
  for (const [index, innings] of [match.innings1, match.innings2].entries()) {
    if (!innings) continue
    const participants = new Set([...innings.batting_team.players, ...innings.bowling_team.players].map(p => p.id))
    for (const playerId of participants) {
      const batting = innings.balls.filter(ball => ball.striker_id === playerId)
      const bowling = innings.balls.filter(ball => ball.bowler_id === playerId)
      const dismissal = innings.fall_of_wickets.find(wicket => wicket.player_id === playerId)
      stats.push({
        player_id: playerId, match_id: match.id, innings: (index + 1) as 1 | 2,
        runs_scored: batting.reduce((sum, ball) => sum + (ball.type === 'wide' ? 0 : ball.type === 'no_ball' ? ball.runs : getBallRuns(ball.type, ball.runs)), 0),
        balls_faced: batting.filter(ball => ball.type !== 'wide').length,
        fours: batting.filter(ball => ball.type === 'four').length,
        sixes: batting.filter(ball => ball.type === 'six').length,
        wickets_taken: bowling.filter(ball => ball.type === 'wicket' && ball.wicket_type !== 'run_out').length,
        balls_bowled: bowling.filter(ball => ball.is_legal).length,
        runs_conceded: bowling.reduce((sum, ball) => sum + getBallRuns(ball.type, ball.runs), 0),
        catches: innings.balls.filter(ball => ball.fielder_id === playerId && ['caught', 'caught_behind', 'roof_catch', 'one_tip_one_hand'].includes(ball.wicket_type || '')).length,
        run_outs: innings.balls.filter(ball => ball.fielder_id === playerId && ball.wicket_type === 'run_out').length,
        is_out: Boolean(dismissal), dismissal_type: dismissal?.dismissal_type,
      })
    }
  }
  return stats
}
