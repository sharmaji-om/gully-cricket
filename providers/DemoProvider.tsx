'use client'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { demoEnabled } from '@/lib/demo/config'
import { createDemoData, createDemoMatch, demoBalance, type DemoData } from '@/lib/demo/fixtures'
import { createDemoApi } from '@/lib/demo/api'
import { usePlayerStore } from '@/store/playerStore'
import { useMatchStore } from '@/store/matchStore'
import { useMatchSetupStore } from '@/store/settingsStore'

const storageKey = 'gully-cricket-demo-data-v1'
export function DemoProvider({ children }: { children: ReactNode }) {
  const api = useRef<ReturnType<typeof createDemoApi> | null>(null)
  useLayoutEffect(() => {
    if (!demoEnabled) return
    let initial = createDemoData()
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) { const parsed: DemoData = JSON.parse(saved); if (Array.isArray(parsed.players) && Array.isArray(parsed.matches)) initial = parsed }
    } catch {}
    api.current = createDemoApi(initial, state => { try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch {} })
    const original = window.fetch
    const demoFetch: typeof fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/ai/')) return original(input, options)
      const req = new Request(input instanceof Request ? input.clone() : url, options)
      let body: unknown = null
      if (!['GET', 'HEAD'].includes(req.method)) { try { body = await req.clone().json() } catch {} }
      return api.current?.handle(url, req.method, body) ?? original(input, options)
    }
    window.fetch = demoFetch
    usePlayerStore.setState({ players: initial.players, isLoading: false, error: null })
    let savedMatch = false
    try { savedMatch = localStorage.getItem('gully-cricket-demo-match') !== null } catch {}
    if (!savedMatch) useMatchStore.getState().initMatch(createDemoMatch('demo-live-match', true))
    if (!useMatchSetupStore.getState().team_balance) {
      useMatchSetupStore.getState().setTeamBalance(structuredClone(demoBalance))
      useMatchSetupStore.getState().setSelectedPlayers(initial.players.map(p => p.id))
    }
    return () => { if (window.fetch === demoFetch) window.fetch = original }
  }, [])
  return <>{children}</>
}
