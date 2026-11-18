'use client'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Player } from '@/types'
interface PlayerCardProps { player: Player; compact?: boolean; showAiScore?: boolean }
const roles = { batsman: 'Batter', bowler: 'Bowler', allrounder: 'All-rounder', wicketkeeper: 'Wicketkeeper' }
export default function PlayerCard({ player, compact = false, showAiScore = true }: PlayerCardProps) {
  const hue = (player.name.charCodeAt(0) * 37) % 360
  const FormIcon = player.form_trend === 'rising' ? TrendingUp : player.form_trend === 'falling' ? TrendingDown : Minus
  return <article className={`club-player-card ${compact ? 'is-compact' : ''}`}><div className="player-card-top"><div className="player-card-avatar" style={{ background: `hsl(${hue} 24% 25%)`, color: `hsl(${hue} 45% 80%)` }}>{player.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate">{player.name}</h3><p>{player.nickname ? `${player.nickname} · ` : ''}{roles[player.preferred_role]}</p></div><span className={`player-form ${player.form_trend === 'rising' ? 'text-pitch-300' : player.form_trend === 'falling' ? 'text-red-300' : 'text-zinc-400'}`} title={`Form: ${player.form_trend}`}><FormIcon size={14}/><span className="sr-only">{player.form_trend}</span></span></div><div className="player-card-stats"><div><strong>{player.total_runs}</strong><span>RUNS</span></div><div><strong>{player.total_wickets}</strong><span>WICKETS</span></div><div><strong>{player.matches_played}</strong><span>MATCHES</span></div></div>{showAiScore && <div className="mt-4 flex items-center justify-between text-[9px] text-zinc-400"><span>TEAM BALANCE RATING</span><span className="text-pitch-300 font-semibold">{player.ai_balance_score} / 10</span></div>}</article>
}
