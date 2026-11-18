import { z } from 'zod'
import type { Match } from '@/types'

const team = z.object({ id: z.string(), name: z.string(), players: z.array(z.object({ id: z.string().uuid() }).passthrough()) }).passthrough()
const innings = z.object({
  batting_team: team, bowling_team: team,
  balls: z.array(z.object({
    striker_id: z.string().uuid(), bowler_id: z.string().uuid(),
    type: z.enum(['dot', 'run', 'four', 'six', 'wide', 'no_ball', 'wicket', 'bounce']),
    runs: z.number().int().min(0), is_legal: z.boolean(),
  }).passthrough()),
  fall_of_wickets: z.array(z.object({ player_id: z.string().uuid(), dismissal_type: z.string() }).passthrough()),
}).passthrough()

export const matchSnapshotSchema = z.object({
  id: z.string().uuid(), team_a: team, team_b: team,
  innings1: innings, innings2: innings.nullable(), current_innings: innings,
  innings: z.union([z.literal(1), z.literal(2)]),
  status: z.enum(['setup', 'toss', 'live', 'innings_break', 'completed']),
  rules: z.object({ max_overs: z.number().int().min(1).max(50) }).passthrough(),
  created_at: z.string().datetime(),
}).passthrough().transform(value => value as unknown as Match)

export const settingsSchema = z.object({
  defaultRules: z.object({
    roof_catch_enabled: z.boolean(), caught_behind_enabled: z.boolean(), one_tip_one_hand_enabled: z.boolean(),
    bounce_rule_enabled: z.boolean(), direct_six_out_enabled: z.boolean(), free_hit_enabled: z.boolean(), powerplay_enabled: z.boolean(),
    max_overs: z.number().int().min(1).max(50), max_players: z.number().int().min(2).max(30),
    ball_type: z.enum(['tape_ball', 'tennis', 'rubber', 'leather']), ground_type: z.string().max(100),
    retirement_mode: z.enum(['returnable', 'retire_out', 'score_based', 'unlimited_swap']), retirement_score_limit: z.number().int().min(1),
  }),
  soundEnabled: z.boolean(),
})
