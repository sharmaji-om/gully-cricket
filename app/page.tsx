'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Users, Trophy, CircleDot, History, Plus, RefreshCw, Flag, Crosshair } from 'lucide-react'
import { useMatchStore } from '@/store/matchStore'
import { usePlayerStore } from '@/store/playerStore'
import { formatOvers } from '@/scoring/engine'
interface RecentMatch { id: string; team_a_name: string; team_b_name: string; total_overs: number; created_at: string; winner_team: string | null }
export default function HomePage() {
  const { match } = useMatchStore()
  const { players, fetchPlayers, error: playerError, isLoading } = usePlayerStore()
  const [recent, setRecent] = useState<RecentMatch[]>([])
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mounted, setMounted] = useState(false)
  async function loadHistory() {
    setHistoryState('loading')
    try {
      const response = await fetch('/api/matches?status=completed')
      if (!response.ok) throw new Error('History unavailable')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Invalid match history')
      setRecent(data); setHistoryState('ready')
    } catch { setHistoryState('error') }
  }
  useEffect(() => { setMounted(true); fetchPlayers(); loadHistory() }, [fetchPlayers])
  const squad = mounted ? players : []
  const live = mounted && match && ['live', 'innings_break'].includes(match.status) ? match : null
  const score = live?.current_innings.score
  const topPlayers = [...squad].sort((a, b) => b.total_runs - a.total_runs).slice(0, 4)
  const totalRuns = squad.reduce((sum, p) => sum + p.total_runs, 0)
  const totalWickets = squad.reduce((sum, p) => sum + p.total_wickets, 0)
  return (
    <div className="club-dashboard">
      <div className="dashboard-heading"><div><p className="eyebrow"><span className="status-dot" /> THE GROUND IS YOURS</p><h1>Good day for a game<span>.</span></h1><p>Round up the squad. Make every ball a story.</p></div><Link href="/match/history" className="text-action desktop-history">Match history <ArrowUpRight size={16} /></Link></div>
      <section className="matchday-hero" aria-labelledby="hero-title">
        <div className="hero-copy"><span className="hero-issue">THE WEEKEND IS A STATE OF MIND. / 001</span><h2 id="hero-title">SMALL GROUND.<br /><span>BIG GAME.</span></h2><p>No stadium. No spotlight. Just your people,<br className="hidden sm:block" /> a bat, a ball, and something to play for.</p><Link href={live ? '/match/live' : '/teams/generator'} className="hero-cta">{live ? 'Back to the action' : 'Let’s play cricket'} <ArrowUpRight size={20} /></Link><div className="hero-footnote"><span className="hero-mini-line" /> YOUR RULES. YOUR RIVALRIES. YOUR GAME.</div></div>
        <div className="pitch-art" aria-hidden="true"><div className="pitch-ring ring-one"/><div className="pitch-ring ring-two"/><span className="art-coordinate">GULLY / NO BOUNDARIES</span><div className="art-pitch"><span className="crease crease-top"/><span className="crease crease-bottom"/><div className="stumps"><i/><i/><i/><b/><b/></div></div><div className="art-bat"><span/><i/></div><div className="art-ball"><i/><b/></div><span className="art-number">06</span><span className="art-caption">EVERY STREET HAS A LEGEND.</span></div>
      </section>
      <section className="club-stats" aria-label="Club statistics">{[{ label: 'IN THE SQUAD', value: mounted && !isLoading ? squad.length.toString().padStart(2, '0') : '—', icon: Users, detail: 'players, one passion' }, { label: 'MATCHES PLAYED', value: historyState === 'ready' ? `${recent.length}${recent.length === 50 ? '+' : ''}`.padStart(2, '0') : '—', icon: Flag, detail: 'stories worth keeping' }, { label: 'RUNS ON THE BOARD', value: mounted && !isLoading ? totalRuns.toLocaleString() : '—', icon: CircleDot, detail: 'every single one counts' }, { label: 'WICKETS TAKEN', value: mounted && !isLoading ? totalWickets.toString().padStart(2, '0') : '—', icon: Crosshair, detail: 'send the stumps flying' }].map(({label, value, icon: Icon, detail}) => <div className="club-stat" key={label}><div className="stat-label">{label}<Icon size={16}/></div><strong>{value}</strong><span>{detail}</span></div>)}</section>
      {live && score && <section className="live-match-panel"><div><p className="eyebrow"><span className="status-dot" /> {live.status === 'innings_break' ? 'INNINGS BREAK' : 'LIVE ON YOUR GROUND'}</p><h2>{live.team_a.name} <span>vs</span> {live.team_b.name}</h2></div><div className="live-score">{score.runs}<span>/{score.wickets}</span><small>{formatOvers(score.legal_balls)} ov</small></div><Link href="/match/live" className="compact-cta">Continue scoring <ArrowRight size={17}/></Link></section>}
      <div className="dashboard-columns">
        <section className="club-panel"><div className="panel-heading"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>The match book<span>.</span></h2></div><Link href="/match/history" className="round-link" aria-label="View match history"><ArrowUpRight size={19}/></Link></div>
          {historyState === 'loading' ? <div className="panel-loading" role="status"><div/><div/><span className="sr-only">Loading match history</span></div> : historyState === 'error' ? <div className="club-empty"><History size={27}/><h3>The match book is unavailable.</h3><p>We couldn’t load your matches. Try again in a moment.</p><button onClick={loadHistory} className="text-action"><RefreshCw size={14}/> Try again</button></div> : recent.length === 0 ? <div className="club-empty"><div className="empty-illustration"><Flag size={29}/></div><h3>Your next rivalry starts here.</h3><p>That last-ball six deserves more than a group chat.<br/>Play a match and keep the whole story here.</p><Link href="/teams/generator" className="text-action">Start your first match <ArrowRight size={15}/></Link></div> : <div className="match-book">{recent.slice(0, 4).map(m => <div className="book-row" key={m.id}><span className="match-date">{new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><div><h3>{m.team_a_name} <span>vs</span> {m.team_b_name}</h3><p>{m.total_overs} overs · Completed</p></div><span className="match-result">{m.winner_team ? `${m.winner_team} won` : 'Match complete'}</span></div>)}</div>}
        </section>
        <section className="club-panel squad-panel"><div className="panel-heading"><div><p className="eyebrow">FAMILIAR FACES. FIERCE RIVALS.</p><h2>The squad<span>.</span></h2></div><Link href="/players/add" className="round-link" aria-label="Add a player"><Plus size={19}/></Link></div>
          {isLoading || !mounted ? <div className="panel-loading" role="status"><div/><div/><span className="sr-only">Loading squad</span></div> : topPlayers.length ? <div className="squad-list">{topPlayers.map((p, i) => <Link href={`/players/${p.id}`} key={p.id} className="squad-row"><span className="squad-rank">{String(i + 1).padStart(2, '0')}</span><span className="squad-avatar" style={{ '--avatar-hue': (p.name.charCodeAt(0) * 37) % 360 } as React.CSSProperties}>{p.name.slice(0, 2).toUpperCase()}</span><div><h3>{p.nickname || p.name}</h3><p>{p.preferred_role.replace('allrounder', 'All-rounder').replace('wicketkeeper', 'Wicketkeeper')}</p></div><strong>{p.total_runs}<small>RUNS</small></strong></Link>)}<Link href="/players" className="squad-all">Meet the whole squad <ArrowRight size={15}/></Link></div> : <div className="club-empty"><Users size={28}/><h3>{playerError ? 'Your squad couldn’t load.' : 'Every club starts with a few mates.'}</h3><p>{playerError ? 'Check your connection and try again.' : 'Add your players. The bragging rights can wait.'}</p>{playerError ? <button onClick={fetchPlayers} className="text-action">Try again <RefreshCw size={14}/></button> : <Link href="/players/add" className="text-action">Build your squad <Plus size={15}/></Link>}</div>}
          {playerError && topPlayers.length > 0 && <p className="cached-note">Showing saved squad. Latest update unavailable.</p>}
        </section>
      </div>
      <Link href="/leaderboard" className="leaderboard-banner"><span className="banner-icon"><Trophy size={25}/></span><div><p className="eyebrow">SETTLE IT ON THE SCOREBOARD</p><h2>Who’s running your gully?</h2><p>Runs, wickets, and a little healthy competition.</p></div><span className="banner-link">Explore leaderboard <ArrowUpRight size={20}/></span></Link>
    </div>
  )
}
