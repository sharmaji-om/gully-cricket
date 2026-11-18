'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, CircleDot, Home, Trophy, Users, History, Settings, Plus, Radio } from 'lucide-react'
const navigation = [
  { href: '/', label: 'Overview', icon: Home },
  { href: '/players', label: 'The squad', icon: Users },
  { href: '/teams/generator', label: 'Match centre', icon: CircleDot },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/match/history', label: 'Match history', icon: History },
]
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  if (path === '/login') return <>{children}</>
  const inMatch = path.startsWith('/teams') || (path.startsWith('/match') && !path.startsWith('/match/history'))
  const active = (href: string) => href === '/' ? path === '/' : href === '/teams/generator' ? inMatch : path.startsWith(href)
  const title = navigation.find(item => active(item.href))?.label || 'Settings'
  return (
    <div className={`app-shell ${inMatch ? 'match-mode' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="club-sidebar">
        <Link href="/" className="club-brand" aria-label="Gully Cricket home"><span className="brand-mark"><CircleDot size={25} /></span><span>GULLY<span className="brand-sub">CRICKET CLUB</span></span></Link>
        <span className="nav-eyebrow">YOUR HOME GROUND</span>
        <nav aria-label="Main navigation" className="club-nav">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={active(href) ? 'is-active' : ''} aria-current={active(href) ? 'page' : undefined}><Icon size={18} /><span>{label}</span>{active(href) && <span className="nav-active-dot" />}</Link>)}</nav>
        <div className="sidebar-bottom"><div className="club-note"><span className="tiny-label">BUILT FOR THE GULLY</span><h3>Big games.<br />Small grounds.</h3><p>Your rules. Your people.<br />Every run counts.</p><Link href="/teams/generator">Let’s play <ArrowUpRight size={17} /></Link></div><Link className="settings-link" href="/settings"><Settings size={17} /> Settings</Link><div className="sidebar-signoff"><span className="status-dot" /> THE GAME GOES ON.</div></div>
      </aside>
      <div className="app-workspace"><header className="workspace-header"><div><span className="header-club">GULLY / </span><span>{title}</span></div><div className="header-actions"><span className="header-tag"><Radio size={13} /> Made for match day</span><Link href="/teams/generator" className="compact-cta"><Plus size={16} /> New match</Link></div></header><main id="main-content" className={`route-content ${path === '/' ? 'home-route' : 'inner-route'}`} tabIndex={-1}>{children}</main><footer className="workspace-footer"><span>GULLY CRICKET CLUB</span><span>From the first ball to the last light.</span></footer></div>
      <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.slice(0, 4).map(({href, label, icon: Icon}) => <Link key={href} href={href} className={active(href) ? 'is-active' : ''} aria-current={active(href) ? 'page' : undefined}><Icon size={19}/><span>{label === 'Match centre' ? 'Play' : label === 'The squad' ? 'Squad' : label}</span></Link>)}<Link href="/settings" aria-label="Settings"><Settings size={19}/><span>Settings</span></Link></nav>
    </div>
  )
}
