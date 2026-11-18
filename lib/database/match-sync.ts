import type { Match } from '@/types'

// Keep snapshots in order even when scoring is faster than the network.
export function createSaveQueue<T>(save: (snapshot: T) => Promise<void>) {
  let tail: Promise<void> = Promise.resolve()
  return (snapshot: T) => {
    const next = tail.catch(() => {}).then(() => save(snapshot))
    tail = next
    return next
  }
}

export const saveMatchSnapshot = createSaveQueue(async (match: Match) => {
  const response = await fetch('/api/matches/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not save the match to Supabase')
  }
})
