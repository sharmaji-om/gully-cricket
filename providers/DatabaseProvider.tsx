'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useMatchStore } from '@/store/matchStore'
import { useSettingsStore, useMatchSetupStore } from '@/store/settingsStore'
import { createSaveQueue } from '@/lib/database/match-sync'

async function readDatabase(path: string) {
  const response = await fetch(path, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not load cricket data')
  return data
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [settingsError, setSettingsError] = useState(false)
  const { isSyncing, syncError, lastSyncAt, syncToSupabase } = useMatchStore()

  useEffect(() => {
    let disposed = false
    let unsubscribeMatch = () => {}
    let unsubscribeSettings = () => {}
    async function load() {
      try {
        setError(null)
        const matchId = new URL(window.location.href).searchParams.get('match')
        const [match, settings] = await Promise.all([
          readDatabase(matchId ? `/api/matches/${encodeURIComponent(matchId)}` : '/api/matches?active=true'),
          readDatabase('/api/settings'),
        ])
        if (disposed) return
        useMatchStore.setState({ match, syncError: null, lastSyncAt: null })
        useSettingsStore.setState(settings)
        useMatchSetupStore.getState().updateRules(settings.defaultRules)
        unsubscribeMatch = useMatchStore.subscribe((state, previous) => {
          if (state.match && state.match !== previous.match) state.syncToSupabase().catch(() => {})
        })
        const saveSettings = createSaveQueue(async (snapshot: ReturnType<typeof useSettingsStore.getState>) => {
          const response = await fetch('/api/settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultRules: snapshot.defaultRules, soundEnabled: snapshot.soundEnabled }),
          })
          if (!response.ok) throw new Error('Settings could not be saved')
          if (!disposed) setSettingsError(false)
        })
        unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
          if (state.defaultRules !== previous.defaultRules || state.soundEnabled !== previous.soundEnabled) {
            saveSettings(state).catch(() => { if (!disposed) setSettingsError(true) })
          }
        })
        setReady(true)
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Database unavailable')
      }
    }
    load()
    return () => { disposed = true; unsubscribeMatch(); unsubscribeSettings() }
  }, [attempt])

  useEffect(() => {
    function protectUnsaved(event: BeforeUnloadEvent) {
      if (useMatchStore.getState().isSyncing || useMatchStore.getState().syncError) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', protectUnsaved)
    return () => window.removeEventListener('beforeunload', protectUnsaved)
  }, [])

  if (!ready) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
    {error ? <><h1 className="text-xl font-bold">Cricket data could not load</h1><p role="alert" className="text-sm text-zinc-400">{error}</p><button className="btn-neon" onClick={() => setAttempt(value => value + 1)}>Try again</button></> : <p role="status">Loading from Supabase...</p>}
  </div>

  return <>
    {(isSyncing || syncError || lastSyncAt || settingsError) && <div role={syncError || settingsError ? 'alert' : 'status'} className="relative z-40 px-4 py-2 text-center text-xs bg-surface-900 border-b border-white/10">
      {syncError ? <span className="text-red-300">Match not saved. Keep this page open. <button className="underline" onClick={() => syncToSupabase().catch(() => {})}>Retry save</button></span> : isSyncing ? 'Saving match...' : lastSyncAt ? 'Match saved to Supabase' : null}
      {settingsError && <span className="text-red-300 ml-2">Settings not saved. Try changing the setting again.</span>}
    </div>}
    {children}
  </>
}
