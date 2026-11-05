import { NavLink, Outlet } from 'react-router-dom';
import { Sun, Swords, Timer, Wallet, Gift, BarChart3, Settings } from 'lucide-react';
import { usePlayer } from '@/lib/hooks';
import { Bar } from './ui';
import { ActiveTimerPill } from './ActiveTimerPill';

const NAV = [
  { to: '/', icon: Sun, label: 'Today' },
  { to: '/quests', icon: Swords, label: 'Quests' },
  { to: '/focus', icon: Timer, label: 'Focus' },
  { to: '/money', icon: Wallet, label: 'Money' },
  { to: '/rewards', icon: Gift, label: 'Rewards' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/settings', icon: Settings, label: 'Settings' }
];

function Hud() {
  const p = usePlayer();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-xp to-fuchsia-500 font-display text-lg font-bold shadow-glow">{p.level}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-semibold text-slate-200">{p.name} · <span className="text-xp">{p.title}</span></span>
          <span className="shrink-0 text-slate-400">{p.into}/{p.needed} XP</span>
        </div>
        <Bar value={p.progress} className="mt-1" color="linear-gradient(90deg,#8b5cf6,#d946ef)" />
      </div>
      <div className="shrink-0 rounded-xl bg-gold/15 px-3 py-1.5 text-sm font-bold text-gold">🪙 {p.coins}</div>
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-panel/60 p-4 lg:block">
        <div className="mb-8 flex items-center gap-2 font-display text-xl font-bold"><img src="/icon.svg" className="h-8 w-8" alt="" />Ascenso</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-xp/20 text-white' : 'text-slate-400 hover:bg-panel2 hover:text-slate-200'}`}>
              <n.icon size={18} />{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur sm:px-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="mx-auto max-w-6xl"><Hud /></div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
        <ActiveTimerPill />
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-panel/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive ? 'text-xp' : 'text-slate-500'}`}>
              <n.icon size={20} />{n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
