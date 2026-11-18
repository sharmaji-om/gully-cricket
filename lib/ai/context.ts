import type { Match, Player, TeamBalance, InningsState } from '@/types'
import { getOverSummaries } from '@/scoring/engine'
import type { TeamsContext, MatchContext } from './contracts'

// Send cricket facts only: no account identifiers, email, avatar URLs, or entire store snapshots.
export function playerContext(player: Player) {
  return { id: player.id, name: player.nickname ? `${player.name} (${player.nickname})` : player.name,
    role: player.preferred_role, batting: player.batting_skill, bowling: player.bowling_skill,
    fielding: player.fielding_skill, matches: player.matches_played, runs: player.total_runs,
    wickets: player.total_wickets, strike_rate: player.strike_rate, economy: player.economy }
}
export function teamsContext(balance: TeamBalance): TeamsContext {
  return { team_a: { name: balance.team_a.name, players: balance.team_a.players.map(playerContext) },
    team_b: { name: balance.team_b.name, players: balance.team_b.players.map(playerContext) },
    common_player_id: balance.common_player_id }
}
export function matchContext(match: Match): MatchContext {
  const innings = [match.innings1, match.innings2].filter((i): i is InningsState => i !== null)
  return { teams: [match.team_a.name, match.team_b.name],
    winner: match.winner_team_id === match.team_a.id ? match.team_a.name : match.winner_team_id === match.team_b.id ? match.team_b.name : null,
    result: match.result ?? null, max_overs: match.rules.max_overs,
    innings: innings.map(i => ({ team: i.batting_team.name, runs: i.score.runs, wickets: i.score.wickets,
      legal_balls: i.score.legal_balls, extras: i.score.extras,
      overs: getOverSummaries(i.balls).map(o => ({ over: o.overNumber + 1, runs: o.runs, wickets: o.wickets })),
      batting: [...i.batsmen, ...i.retired_players].filter((p, index, all) => all.findIndex(other => other.player.id === p.player.id) === index)
        .map(p => ({ name: p.player.name, runs: p.runs, balls: p.balls_faced })),
    })) }
}
