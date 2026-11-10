import { Suspense, lazy, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlayer, useNow } from '@/lib/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { roman } from '@/lib/util';
import { useSyncInfo } from '@/sync/status';
import { Glyph } from './Glyph';
import { Bar, Modal } from './ui';
import { ActiveTimerPill } from './ActiveTimerPill';

export const APP_NAME = 'Life and How to Live It';
export const APP_NAME_JP = '人生とその生き方';

/** Themed names, each with a plain-language meaning (shown in tooltips, the menu and page titles). */
export const NAV = [
  { to: '/', label: 'Today', jp: '今日', plain: 'what to do now' },
  { to: '/quests', label: 'Quests', jp: '冒険', plain: 'tasks' },
  { to: '/focus', label: 'Focus', jp: '集中', plain: 'timer' },
  { to: '/money', label: 'Treasury', jp: '宝庫', plain: 'money' },
  { to: '/rewards', label: 'Agora', jp: '市場', plain: 'rewards' },
  { to: '/stats', label: 'Archive', jp: '記録', plain: 'stats' },
  { to: '/settings', label: 'Control', jp: '設定', plain: 'settings' }
];
/** Pages reached from the menu (and from Today when they're due), not from the tab bar. */
export const MENU_ONLY = [
  { to: '/review', label: 'Review', jp: '回顧', plain: 'weekly review' }
];

/**
 * The ticker's lines when the user hasn't written their own (Control → Display): rules from their plan
 * (00-MASTER-PLAN.md), stated as rules. No borrowed maxims.
 */
export const DEFAULT_INSCRIPTIONS = [
  'never miss twice',
  'the money quest comes first',
  'pay every card in full',
  'lights out 22:00 · rise 05:45',
  'steady income first',
  'information is not progress',
  'the pipeline leads · income lags',
  'wealth = (income − spending) × time × return'
];

const SPARKLES = [['8%', '20%', 0, 14], ['86%', '16%', 1.4, 18], ['70%', '44%', 2.2, 12], ['18%', '52%', .7, 16], ['92%', '58%', 1.9, 10], ['44%', '12%', 2.8, 12]] as const;

// The colonnade is its own chunk (Colonnade.tsx): the tiled wall paints first and the columns arrive a moment later,
// which keeps the startup script inside its budget (scripts/check-bundle.mjs).
const Colonnade = lazy(() => import('./Colonnade'));

function Backdrop() {
  return (
    <>
      <div className="thermae-wall" aria-hidden />
      <Suspense fallback={null}><Colonnade /></Suspense>
      <div className="thermae-floor" aria-hidden />
      <div className="thermae-pool" aria-hidden />
      <div className="thermae-haze" aria-hidden />
      {SPARKLES.map(([l, t, d, sz], i) => <span key={i} className="sparkle" style={{ left: l, top: t, animationDelay: `${d}s` }} aria-hidden><Glyph name="sparkle" size={sz} stroke={0} className="fill-white" /></span>)}
      <img src="/art/bust.webp" alt="" className="thermae-bust" aria-hidden />
    </>
  );
}

/** Shown for the moment a page's code loads: the empty room, quietly. */
function PageLoading() {
  return <p role="status" className="py-16 text-center font-type text-ink/60">the room is being prepared…</p>;
}

function Clock() {
  const now = useNow(15_000);
  return <span className="tabular-nums">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
}

function MenuBar({ onShutdown, room, onRoom }: { onShutdown: () => void; room: boolean; onRoom: () => void }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const site = useLiveQuery(() => db.settings.get('site'))?.value as string | undefined;
  return (
    <div className="relative flex h-11 items-center gap-1 border-b-2 border-ink bg-white px-2 font-display text-[15px]">
      <button onClick={() => setOpen(o => !o)} className={`flex h-10 min-w-[40px] items-center justify-center px-2 ${open ? 'bg-ink text-white' : 'text-cyan'}`} aria-label="Menu"><Glyph name="laurel" size={22} /></button>
      <span className="hidden px-2 font-bold lg:inline">{APP_NAME}</span>
      <nav className="hidden flex-1 items-center md:flex">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} title={n.plain} className={({ isActive }) => `flex h-10 items-center px-2.5 ${isActive ? 'bg-ink text-white' : 'hover:bg-ink hover:text-white'}`}>{n.label}</NavLink>
        ))}
      </nav>
      <span className="ml-auto flex items-center gap-2 pr-1">
        <span className="hidden font-jp text-sm text-lav xl:inline">{APP_NAME_JP}</span>
        {/* Put the windows away and look at the room; tap again (or anywhere) to bring them back. */}
        <button onClick={onRoom} aria-pressed={room} aria-label={room ? 'Bring the windows back' : 'Hide the windows: just the room'} title={room ? 'Bring the windows back' : 'Just the room'} className={`flex h-10 w-10 items-center justify-center ${room ? 'bg-ink text-white' : 'text-ink/70 hover:text-cyan'}`}><Glyph name="eye" size={20} /></button>
        <Clock />
      </span>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <ul className="mac-window absolute left-2 top-11 w-64 py-1" onClick={e => e.stopPropagation()}>
            <li className="px-3 py-1 text-xs text-lav">About {APP_NAME}…</li>
            <li className="dither-gray mx-1 my-1 h-[2px]" />
            {[...NAV, ...MENU_ONLY].map(n => (
              <li key={n.to}><button onClick={() => { nav(n.to); setOpen(false); }} className="flex min-h-[40px] w-full items-center justify-between px-3 py-2 text-left hover:bg-ink hover:text-white">{n.label} <span className="text-xs opacity-70">{n.plain}</span><span className="font-jp text-xs opacity-70">{n.jp}</span></button></li>
            ))}
            {site && <li><a href={site} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex min-h-[40px] w-full items-center justify-between px-3 py-2 hover:bg-ink hover:text-white">{site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} <span className="text-xs opacity-70">your site</span></a></li>}
            <li className="dither-gray mx-1 my-1 h-[2px]" />
            <li><button onClick={() => { onShutdown(); setOpen(false); }} className="min-h-[40px] w-full px-3 py-2 text-left hover:bg-ink hover:text-white">Shut Down for the night…</button></li>
          </ul>
        </div>
      )}
    </div>
  );
}

/** P2: the sync state, only on a device that syncs. Tapping it opens Control → Sync. */
function SyncBadge() {
  const s = useSyncInfo();
  if (s.status === 'off') return null;
  const [glyph, label, tone] =
    s.status === 'idle' ? (s.pending ? ['cloud', 'Sync: changes waiting', 'text-ink/70'] : ['cloudCheck', 'Synced', 'text-cyan'])
    : s.status === 'syncing' ? ['cloud', 'Syncing', 'text-ink/70 motion-safe:animate-pulse']
    : s.status === 'offline' ? ['cloudOff', `Offline: ${s.pending} change${s.pending === 1 ? '' : 's'} waiting`, 'text-ink/60']
    : ['cloudAlert', s.status === 'update-needed' ? 'Sync paused: reload to update the app' : s.status === 'auth' ? 'Sync paused: sign in again' : s.status === 'locked' ? 'Sync paused: enter your passphrase again' : 'Sync error', 'text-hp'];
  return (
    <NavLink to="/settings#sync" title={label} aria-label={label} className={`mac-window flex h-10 w-10 shrink-0 items-center justify-center bg-panel ${tone}`}>
      <Glyph name={glyph} size={22} />
    </NavLink>
  );
}

function Hud() {
  const p = usePlayer();
  return (
    <div className="flex items-center gap-3">
      <div className="mac-window flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-marble" title={`Level ${p.level}`}>
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
      <SyncBadge />
      <div className="mac-window shrink-0 bg-laurel/60 px-2 py-1 font-display text-lg leading-none" title="Drachmae (coins)"><span className="flex items-center gap-1.5"><Glyph name="drachma" size={18} />{p.coins}</span></div>
    </div>
  );
}

export function Layout() {
  const [shutdown, setShutdown] = useState(false);
  const [room, setRoom] = useState(false);
  const p = usePlayer();
  const showMarquee = (useLiveQuery(() => db.settings.get('showMarquee'))?.value as boolean | undefined) ?? true;
  const own = useLiveQuery(() => db.settings.get('inscriptions'))?.value as string[] | undefined;
  const lines = own?.length ? own : DEFAULT_INSCRIPTIONS;
  return (
    <div className="min-h-screen">
      <Backdrop />
      <header className="sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <MenuBar onShutdown={() => setShutdown(true)} room={room} onRoom={() => setRoom(r => !r)} />
        {!room && (
          <div className="border-b-2 border-ink bg-white/85 backdrop-blur">
            <div className="mx-auto max-w-6xl px-3 py-2 sm:px-6"><Hud /></div>
            {showMarquee && (
              <div className="marquee overflow-hidden border-t-2 border-ink bg-laurel/70 py-0.5 text-[13px]" aria-hidden>
                <div>{[...lines, ...lines].map((t, i) => <span key={i} className="inscription inline-flex items-center gap-3 px-4 font-bold"><Glyph name="sparkle" size={10} stroke={0} className="fill-current" />{t}</span>)}</div>
              </div>
            )}
          </div>
        )}
      </header>

      {room && <button className="fixed inset-0 z-20 cursor-pointer" aria-label="Bring the windows back" onClick={() => setRoom(false)} />}

      {/* The page ends a third of a screen early, so its last window sits above the pool and the room is there to look at. */}
      <main className={`mx-auto w-full max-w-6xl px-3 pb-[34vh] pt-5 sm:px-6 ${room ? 'invisible' : ''}`}>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
        <footer className="mt-12 flex flex-col items-center gap-2 text-center text-xs">
          <div className="meander w-full max-w-md opacity-70" />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="mac-inset bg-ink px-2 font-display tracking-[0.2em] text-mint">{String(p.xp).padStart(7, '0')}</span>
            <span className="font-type">lifetime XP · visitors to this life: 1</span>
          </div>
          <p className="font-type text-ink/70">typed on a Macintosh Plus that never existed · {APP_NAME} · nothing leaves this device unencrypted</p>
          <p className="font-serif italic text-ink/60">Marble head of a youth, Greek, 4th c. BCE · The Metropolitan Museum of Art, Open Access</p>
        </footer>
      </main>

      <ActiveTimerPill />

      <nav className={`fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t-2 border-ink bg-white md:hidden ${room ? 'invisible' : ''}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-[52px] flex-col items-center justify-center font-display text-[11px] ${isActive ? 'bg-ink text-white' : ''}`}>
            <span className="font-jp text-base leading-none">{n.jp}</span>{n.label}
          </NavLink>
        ))}
      </nav>

      <Modal open={shutdown} onClose={() => setShutdown(false)} title="Special">
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <Glyph name="moon" size={56} stroke={1.2} className="text-cyan" />
          <p className="font-display text-xl">It is now safe to switch off your day.</p>
          <p className="font-type text-sm">screens off 21:15 · in bed 21:45 · lights out 22:00<br />choose tomorrow's three quests before you go</p>
        </div>
      </Modal>
    </div>
  );
}
