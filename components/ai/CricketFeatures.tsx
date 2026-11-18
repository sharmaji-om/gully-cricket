'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { Player, Match, TeamBalance } from '@/types'
import { playerContext, teamsContext, matchContext } from '@/lib/ai/context'
import { validateTeamSwap, type AiReport } from '@/lib/ai/contracts'
import { swapPlayerBetweenTeams } from '@/balancing/engine'
import { useMatchSetupStore } from '@/store/settingsStore'
import { AiPanel } from './AiPanel'

export function GeminiCoach({ player }: { player: Player }) {
  const [focus, setFocus] = useState<'batting' | 'bowling' | 'fielding'>('batting')
  const [goal, setGoal] = useState('')
  return (
    <div className="coach-feature">
      <div className="coach-inputs">
        <p className="coach-label">What are you working on?</p>
        <div className="coach-focus" role="group" aria-label="Practice focus">
          {(['batting', 'bowling', 'fielding'] as const).map(item => <button key={item} aria-pressed={focus === item} className={focus === item ? 'is-active' : ''} onClick={() => setFocus(item)}>{item}</button>)}
        </div>
        <label htmlFor="coach-goal">Your goal <span>(optional)</span></label>
        <textarea id="coach-goal" value={goal} maxLength={500} rows={2} onChange={e => setGoal(e.target.value)} placeholder="e.g. Rotate strike more consistently in a six-over match" />
        <p>{player.matches_played === 0 ? 'No match history yet. Your plan will use your skill ratings and goal.' : `Based on ${player.matches_played} recorded matches and your skill ratings.`}</p>
      </div>
      <AiPanel feature="coach" title="Your personal nets coach." description="A focused practice plan with drills, repetitions, and targets you can take to your next session." context={{ player: playerContext(player), focus, goal }} />
    </div>
  )
}

export function GeminiMatchAnalyst({ match }: { match: Match }) {
  return <AiPanel feature="match" title="The game, beyond the score." description="Find the turning overs, recognise the standouts, and take something useful into the next match." context={matchContext(match)} />
}

export function GeminiTeamBalancer({ balance }: { balance: TeamBalance }) {
  const context = teamsContext(balance)
  function applySwap(swap: NonNullable<AiReport['swap']>) {
    const current = useMatchSetupStore.getState().team_balance
    if (!current || JSON.stringify(teamsContext(current)) !== JSON.stringify(context)) {
      toast.error('The teams changed. Generate a fresh review first.')
      return
    }
    try {
      validateTeamSwap({ swap }, context)
      useMatchSetupStore.getState().setTeamBalance(swapPlayerBetweenTeams(current, swap.from_a, swap.from_b))
      toast.success('Suggested swap applied. Team metrics recalculated.')
    } catch { toast.error('That swap is no longer available. Review the teams again.') }
  }
  return <AiPanel key={JSON.stringify(context)} feature="teams" title="Gemini team balancer." description="Get a second look at each side’s strengths, a game plan, and an optional player swap. You make the final call." context={context} onSwap={applySwap} />
}
