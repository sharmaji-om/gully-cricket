-- Gully Cricket: repeatable, non-destructive shared-club schema.
-- Run in Supabase SQL Editor before npm run db:seed.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PLAYERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  name TEXT NOT NULL,
  nickname TEXT,
  batting_skill INTEGER NOT NULL DEFAULT 5 CHECK (batting_skill BETWEEN 1 AND 10),
  bowling_skill INTEGER NOT NULL DEFAULT 5 CHECK (bowling_skill BETWEEN 1 AND 10),
  fielding_skill INTEGER NOT NULL DEFAULT 5 CHECK (fielding_skill BETWEEN 1 AND 10),
  matches_played INTEGER NOT NULL DEFAULT 0,
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_wickets INTEGER NOT NULL DEFAULT 0,
  strike_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  economy DECIMAL(5,2) NOT NULL DEFAULT 0,
  catches INTEGER NOT NULL DEFAULT 0,
  run_outs INTEGER NOT NULL DEFAULT 0,
  mvps INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  preferred_role TEXT NOT NULL DEFAULT 'allrounder' CHECK (preferred_role IN ('batsman', 'bowler', 'allrounder', 'wicketkeeper')),
  ai_balance_score DECIMAL(5,2) NOT NULL DEFAULT 5.0,
  form_trend TEXT NOT NULL DEFAULT 'stable' CHECK (form_trend IN ('rising', 'stable', 'falling')),
  clutch_factor DECIMAL(5,2) NOT NULL DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MATCHES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  state JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'toss', 'live', 'innings_break', 'completed')),
  team_a_name TEXT,
  team_b_name TEXT,
  winner_team TEXT,
  total_overs INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- BALLS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.balls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  innings INTEGER NOT NULL CHECK (innings IN (1, 2)),
  over_number INTEGER NOT NULL,
  ball_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('dot', 'run', 'four', 'six', 'wide', 'no_ball', 'wicket', 'bounce')),
  runs INTEGER NOT NULL DEFAULT 0,
  striker_id UUID REFERENCES public.players(id),
  non_striker_id UUID REFERENCES public.players(id),
  bowler_id UUID REFERENCES public.players(id),
  wicket_type TEXT CHECK (wicket_type IN ('bowled', 'caught', 'run_out', 'lbw', 'stumped', 'hit_wicket', 'caught_behind', 'one_tip_one_hand', 'direct_six_out', 'roof_catch')),
  fielder_id UUID REFERENCES public.players(id),
  is_legal BOOLEAN NOT NULL DEFAULT TRUE,
  bounce_count INTEGER DEFAULT 0,
  commentary TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PLAYER STATS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  runs_scored INTEGER NOT NULL DEFAULT 0,
  balls_faced INTEGER NOT NULL DEFAULT 0,
  fours INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  wickets_taken INTEGER NOT NULL DEFAULT 0,
  balls_bowled INTEGER NOT NULL DEFAULT 0,
  runs_conceded INTEGER NOT NULL DEFAULT 0,
  catches INTEGER NOT NULL DEFAULT 0,
  run_outs INTEGER NOT NULL DEFAULT 0,
  is_out BOOLEAN NOT NULL DEFAULT FALSE,
  dismissal_type TEXT,
  innings INTEGER NOT NULL CHECK (innings IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, match_id, innings)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_balls_match_id ON public.balls(match_id);
CREATE INDEX IF NOT EXISTS idx_balls_innings ON public.balls(match_id, innings);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_id ON public.player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_match_id ON public.player_stats(match_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_updated_at ON public.players;
CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS matches_updated_at ON public.matches;
CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Server routes use service_role; browser clients cannot access tables directly
-- ============================================================
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ANALYTICS VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.player_analytics AS
SELECT
  p.id AS player_id,
  p.name,
  p.nickname,
  p.user_id,
  COUNT(DISTINCT ps.match_id) AS total_matches,
  COALESCE(SUM(ps.runs_scored), 0) AS total_runs,
  COALESCE(SUM(ps.wickets_taken), 0) AS total_wickets,
  COALESCE(SUM(ps.balls_faced), 0) AS total_balls_faced,
  COALESCE(SUM(ps.balls_bowled), 0) AS total_balls_bowled,
  COALESCE(SUM(ps.runs_conceded), 0) AS total_runs_conceded,
  COALESCE(SUM(ps.catches), 0) AS total_catches,
  COALESCE(SUM(ps.fours), 0) AS total_fours,
  COALESCE(SUM(ps.sixes), 0) AS total_sixes,
  CASE
    WHEN SUM(ps.balls_faced) > 0
    THEN ROUND((SUM(ps.runs_scored)::DECIMAL / SUM(ps.balls_faced)) * 100, 2)
    ELSE 0
  END AS batting_strike_rate,
  CASE
    WHEN SUM(ps.balls_bowled) > 0
    THEN ROUND((SUM(ps.runs_conceded)::DECIMAL / SUM(ps.balls_bowled)) * 6, 2)
    ELSE 0
  END AS bowling_economy,
  CASE
    WHEN COUNT(CASE WHEN ps.is_out = TRUE THEN 1 END) > 0
    THEN ROUND(SUM(ps.runs_scored)::DECIMAL / COUNT(CASE WHEN ps.is_out = TRUE THEN 1 END), 2)
    ELSE SUM(ps.runs_scored)
  END AS batting_average
FROM public.players p
LEFT JOIN public.player_stats ps ON p.id = ps.player_id
GROUP BY p.id, p.name, p.nickname, p.user_id;

REVOKE ALL ON public.player_analytics FROM anon, authenticated;
GRANT SELECT ON public.player_analytics TO service_role;


CREATE TABLE IF NOT EXISTS public.club_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  settings JSONB NOT NULL
);
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.club_settings (id, settings) VALUES ('default', '{"defaultRules":{"roof_catch_enabled":false,"caught_behind_enabled":false,"one_tip_one_hand_enabled":true,"bounce_rule_enabled":true,"direct_six_out_enabled":false,"free_hit_enabled":true,"powerplay_enabled":false,"max_overs":6,"max_players":6,"ball_type":"tennis","ground_type":"street","retirement_mode":"returnable","retirement_score_limit":30},"soundEnabled":true}') ON CONFLICT DO NOTHING;

-- All totals are rebuilt from per-match records, so retries and deletions are safe.
CREATE OR REPLACE FUNCTION public.refresh_cricket_totals() RETURNS void
LANGUAGE sql SET search_path = public AS $$
  WITH performance AS (
    SELECT player_id, SUM(runs_scored) runs, SUM(wickets_taken) wickets,
      SUM(balls_faced) faced, SUM(balls_bowled) bowled, SUM(runs_conceded) conceded,
      SUM(catches) catches, SUM(run_outs) run_outs
    FROM player_stats GROUP BY player_id
  ), appearances AS (
    SELECT m.id match_id, (member->>'id')::uuid player_id,
      bool_or(team->>'id' = m.state->>'winner_team_id') won,
      m.state->>'winner_team_id' winner, m.state->>'mvp_player_id' mvp
    FROM matches m
    CROSS JOIN LATERAL jsonb_array_elements(jsonb_build_array(m.state->'team_a', m.state->'team_b')) team
    CROSS JOIN LATERAL jsonb_array_elements(team->'players') member
    WHERE m.status = 'completed'
    GROUP BY m.id, member->>'id', m.state->>'winner_team_id', m.state->>'mvp_player_id'
  ), results AS (
    SELECT player_id, COUNT(*) matches,
      COUNT(*) FILTER (WHERE won) wins,
      COUNT(*) FILTER (WHERE NOT won AND winner IS NOT NULL) losses,
      COUNT(*) FILTER (WHERE mvp = player_id::text) mvps
    FROM appearances GROUP BY player_id
  )
  UPDATE players p SET
    matches_played = COALESCE(r.matches, 0), total_runs = COALESCE(s.runs, 0),
    total_wickets = COALESCE(s.wickets, 0), catches = COALESCE(s.catches, 0),
    run_outs = COALESCE(s.run_outs, 0), wins = COALESCE(r.wins, 0),
    losses = COALESCE(r.losses, 0), mvps = COALESCE(r.mvps, 0),
    strike_rate = CASE WHEN s.faced > 0 THEN round(s.runs::numeric * 100 / s.faced, 2) ELSE 0 END,
    economy = CASE WHEN s.bowled > 0 THEN round(s.conceded::numeric * 6 / s.bowled, 2) ELSE 0 END
  FROM players base LEFT JOIN performance s ON s.player_id = base.id
    LEFT JOIN results r ON r.player_id = base.id
  WHERE p.id = base.id;
$$;

CREATE OR REPLACE FUNCTION public.save_cricket_match(p_match jsonb, p_stats jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_match_id uuid := (p_match->>'id')::uuid;
BEGIN
  -- Shared totals are rebuilt in the same transaction; serialize all writers.
  PERFORM pg_advisory_xact_lock(704201);
  INSERT INTO matches (id, state, status, team_a_name, team_b_name, winner_team, total_overs, created_at, completed_at)
  VALUES (v_match_id, p_match, p_match->>'status', p_match->'team_a'->>'name', p_match->'team_b'->>'name',
    CASE WHEN p_match->>'winner_team_id' = p_match->'team_a'->>'id' THEN p_match->'team_a'->>'name'
         WHEN p_match->>'winner_team_id' = p_match->'team_b'->>'id' THEN p_match->'team_b'->>'name' ELSE NULL END,
    (p_match->'rules'->>'max_overs')::integer, (p_match->>'created_at')::timestamptz, (p_match->>'completed_at')::timestamptz)
  ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, status = EXCLUDED.status,
    team_a_name = EXCLUDED.team_a_name, team_b_name = EXCLUDED.team_b_name,
    winner_team = EXCLUDED.winner_team, total_overs = EXCLUDED.total_overs, completed_at = EXCLUDED.completed_at;

  DELETE FROM player_stats WHERE player_stats.match_id = v_match_id;
  IF p_match->>'status' = 'completed' THEN
    INSERT INTO player_stats (player_id, match_id, innings, runs_scored, balls_faced, fours, sixes,
      wickets_taken, balls_bowled, runs_conceded, catches, run_outs, is_out, dismissal_type)
    SELECT s.player_id, v_match_id, s.innings, s.runs_scored, s.balls_faced, s.fours, s.sixes,
      s.wickets_taken, s.balls_bowled, s.runs_conceded, s.catches, s.run_outs, s.is_out, s.dismissal_type
    FROM jsonb_to_recordset(p_stats) AS s(player_id uuid, innings integer, runs_scored integer,
      balls_faced integer, fours integer, sixes integer, wickets_taken integer, balls_bowled integer,
      runs_conceded integer, catches integer, run_outs integer, is_out boolean, dismissal_type text);
  END IF;
  PERFORM refresh_cricket_totals();
  RETURN v_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_cricket_matches(p_id uuid DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(704201);
  DELETE FROM matches WHERE (p_id IS NULL OR id = p_id) AND (p_status IS NULL OR status = p_status);
  PERFORM refresh_cricket_totals();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_cricket_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_cricket_match(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_cricket_matches(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_cricket_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.save_cricket_match(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_cricket_matches(uuid, text) TO service_role;
GRANT ALL ON public.players, public.matches, public.player_stats, public.balls, public.club_settings TO service_role;
