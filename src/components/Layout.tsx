import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlayer, useNow } from '@/lib/hooks';
import { DR, roman } from '@/lib/util';
import { Bar, Modal } from './ui';
import { ActiveTimerPill } from './ActiveTimerPill';

export const APP_NAME = 'Life and How to Live It';
export const APP_NAME_JP = '人生とその生き方';

export const NAV = [
  { to: '/', label: 'Today', jp: '今日' },
  { to: '/quests', label: 'Quests', jp: '冒険' },
  { to: '/focus', label: 'Focus', jp: '集中' },
  { to: '/money', label: 'Treasury', jp: '宝庫' },
  { to: '/rewards', label: 'Agora', jp: '市場' },
  { to: '/stats', label: 'Archive', jp: '記録' },
  { to: '/settings', label: 'Control', jp: '設定' }
];

const INSCRIPTIONS = [
  'ΓΝΩΘΙ ΣΑΥΤΟΝ · know thyself',
  'ΜΗΔΕΝ ΑΓΑΝ · nothing in excess',
  'first thought, best thought',
  'wealth = (income − spending) × time × return',
  'never miss twice',
  'the money quest comes first',
  'pay every card in full',
  'lights out 22:00 · rise 05:45',
  'you have been here before',
  'retainers > one-off gigs',
  'the road is life'
];

const CLOUDS = [
  { top: '8%', w: 260, h: 60, dur: 140, delay: -20 },
  { top: '18%', w: 180, h: 44, dur: 110, delay: -70 },
  { top: '30%', w: 320, h: 70, dur: 170, delay: -120 },
  { top: '44%', w: 220, h: 50, dur: 130, delay: -40 },
  { top: '56%', w: 280, h: 56, dur: 190, delay: -150 }
];
const SPARKLES = [['12%', '22%', 0], ['78%', '14%', 1.2], ['64%', '38%', 2.1], ['24%', '58%', .6], ['88%', '62%', 1.7], ['40%', '8%', 2.6]] as const;

function Backdrop() {
  return (
    <>
      <div className="dream-sky" aria-hidden>
        {CLOUDS.map((c, i) => <div key={i} className="cloud" style={{ top: c.top, width: c.w, height: c.h, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />)}
      </div>
      <div className="dream-floor" aria-hidden />
      {SPARKLES.map(([l, t, d], i) => <span key={i} className="sparkle text-2xl" style={{ left: l, top: t, animationDelay: `${d}s` }} aria-hidden>✧</span>)}
      <img src="/art/bust.png" alt="" className="dream-bust" aria-hidden />
      <div className="grain" aria-hidden />
    </>
  );
}

function Clock() {
  const now = useNow(15_000);
  return <span className="tabular-nums">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
}

function MenuBar({ onShutdown }: { onShutdown: () => void }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  return (
    <div className="relative flex h-9 items-center gap-1 border-b-2 border-ink bg-white px-2 font-display text-[15px]">
      <button onClick={() => setOpen(o => !o)} className={`flex h-8 items-center px-2 text-xl ${open ? 'bg-ink text-white' : 'text-xp'}`} aria-label="Menu">✿</button>
      <span className="hidden px-2 font-bold lg:inline">{APP_NAME}</span>
      <nav className="hidden flex-1 items-center md:flex">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex h-8 items-center px-2.5 ${isActive ? 'bg-ink text-white' : 'hover:bg-ink hover:text-white'}`}>{n.label}</NavLink>
        ))}
      </nav>
      <span className="ml-auto flex items-center gap-3 pr-1"><span className="hidden font-jp text-sm text-lav sm:inline">{APP_NAME_JP}</span><Clock /></span>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <ul className="mac-window absolute left-2 top-9 w-64 py-1" onClick={e => e.stopPropagation()}>
            <li className="px-3 py-1 text-xs text-lav">About {APP_NAME}…</li>
            <li className="dither-gray mx-1 my-1 h-[2px]" />
            {NAV.map(n => (
              <li key={n.to}><button onClick={() => { nav(n.to); setOpen(false); }} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-ink hover:text-white">{n.label}<span className="font-jp text-xs opacity-70">{n.jp}</span></button></li>
            ))}
            <li className="dither-gray mx-1 my-1 h-[2px]" />
            <li><button onClick={() => { onShutdown(); setOpen(false); }} className="w-full px-3 py-2 text-left hover:bg-ink hover:text-white">Shut Down for the night…</button></li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Hud() {
  const p = usePlayer();
  return (
    <div className="flex items-center gap-3">
      <div className="mac-window flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-laurel/40" title={`Level ${p.level}`}>
        <span className="text-[9px] leading-none">LVL</span>
        <span className="inscription text-lg font-bold leading-none">{roman(p.level)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 font-display text-[13px]">
          <span className="truncate">{p.name} · <span className="text-xp">{p.title}</span></span>
          <span className="shrink-0 text-ink/60">{p.into}/{p.needed} XP</span>
        </div>
        <Bar value={p.progress} className="mt-1" />
      </div>
      <div className="mac-window shrink-0 bg-laurel/60 px-2 py-1 font-display text-lg leading-none" title="Drachmae (coins)">{DR} {p.coins}</div>
    </div>
  );
}

export function Layout() {
  const [shutdown, setShutdown] = useState(false);
  const p = usePlayer();
  return (
    <div className="min-h-screen">
      <Backdrop />
      <header className="sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <MenuBar onShutdown={() => setShutdown(true)} />
        <div className="border-b-2 border-ink bg-white/85 backdrop-blur">
          <div className="mx-auto max-w-6xl px-3 py-2 sm:px-6"><Hud /></div>
          <div className="marquee overflow-hidden border-t-2 border-ink bg-mint/60 py-0.5 text-[13px]" aria-hidden>
            <div>{[...INSCRIPTIONS, ...INSCRIPTIONS].map((t, i) => <span key={i} className="inscription px-6 font-bold">✦ {t}</span>)}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-5 sm:px-6 md:pb-10">
        <Outlet />
        <footer className="mt-12 flex flex-col items-center gap-2 text-center text-xs">
          <div className="meander w-full max-w-md opacity-70" />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="mac-inset bg-ink px-2 font-display tracking-[0.2em] text-mint">{String(p.xp).padStart(7, '0')}</span>
            <span className="font-type">lifetime XP · visitors to this life: 1</span>
          </div>
          <p className="font-type text-ink/70">typed on a Macintosh Plus that never existed · {APP_NAME} · nothing leaves this device</p>
          <p className="font-serif italic text-ink/60">Marble head of a youth, Greek, 4th c. BCE · The Metropolitan Museum of Art, Open Access</p>
        </footer>
      </main>

      <ActiveTimerPill />

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t-2 border-ink bg-white md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-[52px] flex-col items-center justify-center font-display text-[11px] ${isActive ? 'bg-ink text-white' : ''}`}>
            <span className="font-jp text-base leading-none">{n.jp}</span>{n.label}
          </NavLink>
        ))}
      </nav>

      <Modal open={shutdown} onClose={() => setShutdown(false)} title="Special">
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <div className="text-5xl text-xp">✿</div>
          <p className="font-display text-xl">It is now safe to switch off your day.</p>
          <p className="font-type text-sm">screens off 21:15 · in bed 21:45 · lights out 22:00<br />choose tomorrow's three quests before you go</p>
        </div>
      </Modal>
    </div>
  );
}
