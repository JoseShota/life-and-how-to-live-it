import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Sun, Swords, Timer, Wallet, Gift, Archive, Settings, Moon } from 'lucide-react';
import { usePlayer, useNow } from '@/lib/hooks';
import { Bar, Modal } from './ui';
import { ActiveTimerPill } from './ActiveTimerPill';

export const APP_NAME = 'Life and How to Live It';

const NAV = [
  { to: '/', icon: Sun, label: 'Today', file: 'TODAY.EXE' },
  { to: '/quests', icon: Swords, label: 'Quests', file: 'QUESTS.TXT' },
  { to: '/focus', icon: Timer, label: 'Focus', file: 'FOCUS.EXE' },
  { to: '/money', icon: Wallet, label: 'Money', file: 'TREASURY.XLS' },
  { to: '/rewards', icon: Gift, label: 'Rewards', file: 'SHOP.HTM' },
  { to: '/stats', icon: Archive, label: 'Archive', file: 'WAYBACK.DAT' },
  { to: '/settings', icon: Settings, label: 'Control', file: 'CONTROL.PNL' }
];

const TICKER = [
  '✦ Wealth = (Income − Spending) × Time × Return',
  '✦ Never miss twice',
  '✦ Deep work block 1 is always the money quest',
  '✦ Pay every card in full · every month',
  '✦ Lights out 22:00 · up 05:45',
  '✦ Information is not progress · 45 min of intel, then close it',
  '✦ Retainers beat one-off gigs',
  '✦ Raise prices when booked > 80 %'
];

function Hud() {
  const p = usePlayer();
  return (
    <div className="flex items-center gap-3">
      <img src="/icon.svg" alt="" className="hidden h-11 w-11 shrink-0 sm:block" />
      <div className="hidden min-w-0 md:block">
        <div className="chrome-text truncate font-display text-3xl leading-none">{APP_NAME}</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-lav">a personal operating system · est. 2026</div>
      </div>
      <div className="ml-auto flex min-w-0 flex-1 items-center gap-2 md:max-w-md">
        <div className="bevel-out flex h-11 w-11 shrink-0 flex-col items-center justify-center bg-panel2" title="Level">
          <span className="text-[8px] uppercase leading-none text-lav">lvl</span>
          <span className="neon-pink font-display text-2xl leading-none">{p.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate font-semibold">{p.name} · <span className="neon-cyan">{p.title}</span></span>
            <span className="shrink-0 text-slate-400">{p.into}/{p.needed}</span>
          </div>
          <Bar value={p.progress} className="mt-0.5" />
        </div>
        <div className="bevel-in shrink-0 bg-[#0d0420] px-2 py-1 font-display text-xl leading-none text-gold" title="Coins">¢{p.coins}</div>
      </div>
    </div>
  );
}

function Clock() {
  const now = useNow(15_000);
  return <div className="bevel-in hidden shrink-0 items-center px-2 font-display text-lg text-slate-200 sm:flex">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>;
}

function StartMenu({ onClose, onShutdown }: { onClose: () => void; onShutdown: () => void }) {
  const nav = useNavigate();
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="bevel-out absolute bottom-[54px] left-1 flex w-72 bg-panel" style={{ marginBottom: 'env(safe-area-inset-bottom)' }} onClick={e => e.stopPropagation()}>
        <div className="flex w-9 items-end justify-center bg-gradient-to-t from-xp via-lav to-cyan py-2">
          <span className="whitespace-nowrap font-display text-xl text-white [writing-mode:vertical-rl] [transform:rotate(180deg)]"><b>Life</b> and How to Live It</span>
        </div>
        <ul className="flex-1 py-1">
          {NAV.map(n => (
            <li key={n.to}><button onClick={() => { nav(n.to); onClose(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-xp hover:text-[#1d0b3d]"><n.icon size={18} />{n.label}<span className="ml-auto text-[10px] opacity-60">{n.file}</span></button></li>
          ))}
          <li className="mx-2 my-1 border-t border-line" />
          <li><button onClick={() => { onShutdown(); onClose(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-xp hover:text-[#1d0b3d]"><Moon size={18} />Shut down for the night…</button></li>
        </ul>
      </div>
    </div>
  );
}

export function Layout() {
  const [start, setStart] = useState(false);
  const [shutdown, setShutdown] = useState(false);
  const p = usePlayer();
  return (
    <div className="min-h-screen">
      <div className="vapor-sky" aria-hidden />
      <div className="scanlines" aria-hidden />
      <header className="sticky top-0 z-30 border-b-2 border-[#0a0416] bg-[#160a2c]/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-6xl px-3 py-2 sm:px-6"><Hud /></div>
        <div className="marquee overflow-hidden border-t border-line/70 bg-[#0d0420]/80 py-0.5 font-display text-lg text-cyan" aria-hidden>
          <div>{[...TICKER, ...TICKER].map((t, i) => <span key={i} className="px-6">{t}</span>)}</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 pb-28 pt-5 sm:px-6">
        <Outlet />
        <footer className="mt-10 flex flex-col items-center gap-2 text-center font-serif text-xs text-slate-400">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="bevel-in bg-black px-2 font-display text-base tracking-[0.2em] text-ok">{String(p.xp).padStart(7, '0')}</span>
            <span>lifetime XP · visitor counter since day one</span>
          </div>
          <p>Best viewed at 1024×768 in Netscape Navigator 4.0 · <span className="italic">Life and How to Live It</span> is a personal archive · no data leaves this device</p>
          <p className="text-lav">⟡ webring: <span className="underline">prev</span> · <span className="underline">random</span> · <span className="underline">next</span> ⟡</p>
        </footer>
      </main>

      <ActiveTimerPill />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 border-t-2 border-[#8e6bd1] bg-panel px-1 py-1" style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => setStart(s => !s)} className={`bevel-btn flex shrink-0 items-center gap-1.5 px-2 font-display text-xl ${start ? 'bg-xp text-[#1d0b3d]' : 'bg-silver text-black'}`}>
          <img src="/icon.svg" alt="" className="h-5 w-5" />Start
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide sm:flex-row sm:gap-1.5 sm:text-xs ${isActive ? 'bevel-in bg-[#0d0420] text-xp' : 'bevel-btn bg-panel2 text-slate-300 hover:text-white'}`}>
              <n.icon size={17} /><span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </div>
        <Clock />
      </nav>
      {start && <StartMenu onClose={() => setStart(false)} onShutdown={() => setShutdown(true)} />}
      <Modal open={shutdown} onClose={() => setShutdown(false)} title="Shut Down Life">
        <div className="flex flex-col items-center gap-3 bg-black p-6 text-center">
          <p className="font-display text-3xl text-[#ff9a3c]">It's now safe to go to sleep.</p>
          <p className="text-sm text-slate-300">Screens off at 21:15 · in bed 21:45 · lights out 22:00.<br />Pick tomorrow's top 3 quests before you go.</p>
        </div>
      </Modal>
    </div>
  );
}
