import { z } from 'zod'

const text = z.string().trim().min(1).max(100)
const count = z.number().int().min(0).max(10000000)
export const playerContextSchema = z.object({
  id: text, name: text,
  role: z.enum(['batsman', 'bowler', 'allrounder', 'wicketkeeper']),
  batting: z.number().min(0).max(10), bowling: z.number().min(0).max(10), fielding: z.number().min(0).max(10),
  matches: count, runs: count, wickets: count,
  strike_rate: z.number().min(0).max(10000), economy: z.number().min(0).max(10000),
})
const teamSchema = z.object({ name: text, players: z.array(playerContextSchema).min(1).max(30) })
export const teamsContextSchema = z.object({
  team_a: teamSchema, team_b: teamSchema, common_player_id: text.optional(),
}).superRefine((value, ctx) => {
  const a = value.team_a.players.map(p => p.id)
  const b = value.team_b.players.map(p => p.id)
  const overlap = a.filter(id => b.includes(id))
  if (new Set(a).size !== a.length || new Set(b).size !== b.length || a.length !== b.length ||
    overlap.some(id => id !== value.common_player_id) ||
    (value.common_player_id && !overlap.includes(value.common_player_id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Teams must have equal size and unique players, except the shared common player.' })
  }
})
export const coachContextSchema = z.object({
  player: playerContextSchema,
  focus: z.enum(['batting', 'bowling', 'fielding']),
  goal: z.string().trim().max(500),
})
export const matchContextSchema = z.object({
  teams: z.array(text).length(2),
  winner: text.nullable(),
  result: z.enum(['team_a_won', 'team_b_won', 'tie', 'no_result']).nullable(),
  max_overs: z.number().int().min(1).max(200),
  innings: z.array(z.object({
    team: text, runs: count, wickets: count, legal_balls: count, extras: count,
    overs: z.array(z.object({ over: count, runs: count, wickets: count })).max(200),
    batting: z.array(z.object({ name: text, runs: count, balls: count })).max(60),
  })).min(1).max(2),
})
const point = z.object({ title: z.string().min(1).max(100), detail: z.string().min(1).max(900) })
export const reportSchema = z.object({
  title: z.string().min(1).max(150),
  summary: z.string().min(1).max(1500),
  insights: z.array(point).min(1).max(4),
  actions: z.array(point).min(1).max(4),
  data_note: z.string().min(1).max(800),
  swap: z.object({ from_a: text, from_b: text, reason: z.string().min(1).max(700) }).nullable(),
})
export type AiFeature = 'teams' | 'match' | 'coach'
export type AiReport = z.infer<typeof reportSchema>
export type TeamsContext = z.infer<typeof teamsContextSchema>
export type CoachContext = z.infer<typeof coachContextSchema>
export type MatchContext = z.infer<typeof matchContextSchema>

export const reportJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' }, summary: { type: 'string' },
    insights: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] } },
    actions: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] } },
    data_note: { type: 'string' },
    swap: { anyOf: [{ type: 'null' }, { type: 'object', properties: { from_a: { type: 'string' }, from_b: { type: 'string' }, reason: { type: 'string' } }, required: ['from_a', 'from_b', 'reason'] }] },
  },
  required: ['title', 'summary', 'insights', 'actions', 'data_note', 'swap'],
}

export function validateTeamSwap(report: Pick<AiReport, 'swap'>, context: TeamsContext) {
  if (!report.swap) return
  const { from_a, from_b } = report.swap
  if (from_a === from_b || from_a === context.common_player_id || from_b === context.common_player_id ||
    !context.team_a.players.some(p => p.id === from_a) || !context.team_b.players.some(p => p.id === from_b)) {
    throw new Error('Gemini suggested an invalid player swap.')
  }
}
