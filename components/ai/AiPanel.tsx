'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react'
import {
  reportSchema, type AiFeature, type AiReport,
  type TeamsContext, type CoachContext, type MatchContext,
} from '@/lib/ai/contracts'

interface Props {
  feature: AiFeature
  title: string
  description: string
  context: TeamsContext | CoachContext | MatchContext
  onSwap?: (swap: NonNullable<AiReport['swap']>) => void
}

export function AiPanel({ feature, title, description, context, onSwap }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ report: AiReport; model: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  const contextKey = JSON.stringify(context)

  useEffect(() => {
    const controller = new AbortController()
    setConnectionFailed(false)
    fetch('/api/ai/status', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Connection check failed')
        return response.json()
      })
      .then(data => {
        if (typeof data.configured !== 'boolean') throw new Error('Invalid connection status')
        if (!controller.signal.aborted) setConfigured(data.configured)
      })
      .catch(() => { if (!controller.signal.aborted) setConnectionFailed(true) })
    return () => controller.abort()
  }, [connectionAttempt])

  // Never show an analysis or allow a swap based on old teams, stats, or goals.
  useEffect(() => {
    request.current?.abort()
    request.current = null
    setBusy(false)
    setResult(null)
    setError('')
    return () => { request.current?.abort() }
  }, [contextKey])

  async function generate() {
    if (request.current || !configured) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/ai/${feature}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: contextKey, signal: controller.signal,
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.code === 'NOT_CONFIGURED') setConfigured(false)
        throw new Error(data.error || 'The analysis couldn’t be generated. Please try again.')
      }
      const parsed = reportSchema.safeParse(data.report)
      if (!parsed.success) throw new Error('Gemini returned an incomplete review. Please try again.')
      const report = parsed.data
      if (!controller.signal.aborted) setResult({ report, model: typeof data.model === 'string' ? data.model : 'Gemini' })
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Couldn’t connect to Gemini.')
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false) }
    }
  }

  const swap = result?.report.swap
  const swapLabel = swap && 'team_a' in context
    ? `${context.team_a.players.find(p => p.id === swap.from_a)?.name || 'Team A player'} ↔ ${context.team_b.players.find(p => p.id === swap.from_b)?.name || 'Team B player'}`
    : ''

  return (
    <section className="ai-panel" aria-label={title} aria-busy={busy}>
      <div className="ai-panel-heading">
        <span className="ai-feature-icon"><Sparkles size={20} /></span>
        <div><p className="eyebrow">THE CLUB’S SECOND OPINION</p><h2>{title}</h2></div>
        <span className="ai-provider">GEMINI</span>
      </div>
      <p className="ai-description">{description}</p>
      <p className="ai-disclosure">Only runs when you ask. The relevant cricket stats{feature === 'coach' ? ' and your goal' : ''} are sent to Google Gemini.</p>
      {configured === false && (
        <div className="ai-connection-note" role="status"><span className="status-dot" />
          Gemini is waiting to be connected. This feature will be ready once the club’s connection is set up.
          <button className="text-action" onClick={() => setConnectionAttempt(n => n + 1)}>Check again</button>
        </div>
      )}
      {connectionFailed && <p role="alert" className="ai-error">Couldn’t check Gemini’s connection. <button className="underline" onClick={() => setConnectionAttempt(n => n + 1)}>Try again</button></p>}
      <div className="ai-panel-controls">
        <button className="compact-cta" disabled={!configured || busy} onClick={generate}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : result ? <RefreshCw size={15} /> : <Sparkles size={15} />}
          {busy ? 'Gemini is working…' : result ? 'Generate a fresh review' : configured === null && !connectionFailed ? 'Checking connection…' : feature === 'coach' ? 'Build my practice plan' : feature === 'match' ? 'Analyse this match' : 'Review and balance teams'}
          {!busy && <ArrowUpRight size={16} />}
        </button>
        {busy && <button className="text-action" onClick={() => { request.current?.abort(); request.current = null; setBusy(false) }}>Cancel</button>}
      </div>
      {error && <p className="ai-error" role="alert">{error}</p>}
      <div aria-live="polite">
        {result && <div className="ai-report">
          <p className="ai-generated-label">GENERATED BY {result.model.toUpperCase()}</p>
          <h3>{result.report.title}</h3>
          <p className="ai-summary">{result.report.summary}</p>
          <div className="ai-insights">{result.report.insights.map((point, i) => (
            <article key={i}><span>{String(i + 1).padStart(2, '0')}</span><div><h4>{point.title}</h4><p>{point.detail}</p></div></article>
          ))}</div>
          <div className="ai-actions">
            <p className="eyebrow">{feature === 'coach' ? 'TAKE IT TO THE NETS' : 'FOR YOUR NEXT MOVE'}</p>
            {result.report.actions.map((action, i) => <article key={i}><h4>{action.title}</h4><p>{action.detail}</p></article>)}
          </div>
          {swap && onSwap && <div className="ai-swap"><h4>Suggested swap: {swapLabel}</h4><p>{swap.reason}</p><button className="compact-cta" onClick={() => onSwap(swap)}>Apply suggested swap <ArrowUpRight size={16} /></button></div>}
          <p className="ai-data-note">{result.report.data_note}</p>
          <p className="ai-data-note">AI suggestions can be mistaken. Scores and player ratings stay as recorded.</p>
        </div>}
      </div>
    </section>
  )
}
