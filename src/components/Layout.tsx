import { Suspense, useEffect, useState } from 'react';
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
  'retainers > one-off gigs',
  'information is not progress',
  'the pipeline leads · income lags',
  'wealth = (income − spending) × time × return'
];

const SPARKLES = [['8%', '20%', 0, 14], ['86%', '16%', 1.4, 18], ['70%', '44%', 2.2, 12], ['18%', '52%', .7, 16], ['92%', '58%', 1.9, 10], ['44%', '12%', 2.8, 12]] as const;

// The colonnade, drawn the way Doric columns are built: a shaft that narrows upward with a slight swell (entasis),
// twenty flutes of which ten face you, bunching toward the edges as they turn away, drums stacked with visible
// joints, a necking, the cushion (echinus) and the square slab (abacus), under an architrave and a triglyph frieze.
// Light comes from the upper left, so every flute is dark on its left wall and lit on its right.
const BAY = 300, COL_X = 44, R_LOW = 27, R_TOP = 21.5, SHAFT_TOP = 118, WALL_TOP = 118;
/** The ten visible flute edges (arrises), by angle around the shaft. */
const ARRISES = Array.from({ length: 9 }, (_, k) => {
  const t = ((-72 + k * 18) * Math.PI) / 180;
  return { top: COL_X + R_TOP * Math.sin(t), low: COL_X + R_LOW * Math.sin(t), facing: Math.cos(t) };
});

function Column({ end }: { end: number }) {
  const SHAFT_END = end;
  const drums = Array.from({ length: Math.max(0, Math.floor((end - 150) / 76)) }, (_, i) => 190 + i * 76);
  return (
    <g>
      {/* its shadow on the wall behind, falling right */}
      <path d={`M${COL_X + 10} ${SHAFT_TOP - 30}h30v${SHAFT_END - SHAFT_TOP + 30}h-30z`} fill="#2b3437" opacity=".13" filter="url(#soft)" />
      <path d={`M${COL_X - R_LOW} ${SHAFT_END}C${COL_X - R_LOW} ${end * 0.74} ${COL_X - R_TOP - 1.5} ${end * 0.45} ${COL_X - R_TOP} ${SHAFT_TOP}h${R_TOP * 2}C${COL_X + R_TOP + 1.5} ${end * 0.45} ${COL_X + R_LOW} ${end * 0.74} ${COL_X + R_LOW} ${SHAFT_END}z`} fill="url(#shaft)" />
      {ARRISES.map((a, i) => (
        <g key={i} strokeLinecap="butt">
          <path d={`M${a.top + 1.1} ${SHAFT_TOP}L${a.low + 1.4} ${SHAFT_END}`} stroke="#4a4436" strokeOpacity={0.3 * a.facing + 0.06} strokeWidth={2.4 * a.facing + 0.5} />
          <path d={`M${a.top - 0.8} ${SHAFT_TOP}L${a.low - 1} ${SHAFT_END}`} stroke="#fffdf6" strokeOpacity={0.75 * a.facing} strokeWidth={1.3 * a.facing + 0.2} />
        </g>
      ))}
      {drums.map(y => <path key={y} d={`M${COL_X - R_LOW} ${y}q${R_LOW} 3.5 ${R_LOW * 2} 0`} fill="none" stroke="#3d382c" strokeOpacity=".2" strokeWidth=".9" />)}
      {/* necking rings, echinus, abacus */}
      <path d={`M${COL_X - R_TOP} ${SHAFT_TOP + 5}q${R_TOP} 3 ${R_TOP * 2} 0M${COL_X - R_TOP} ${SHAFT_TOP + 1.5}q${R_TOP} 3 ${R_TOP * 2} 0`} fill="none" stroke="#3d382c" strokeOpacity=".4" strokeWidth="1" />
      <path d={`M${COL_X - R_TOP} ${SHAFT_TOP}c0-7-10.5-9-11-15h${R_TOP * 2 + 22}c-.5 6-11 8-11 15z`} fill="url(#shaft)" />
      <path d={`M${COL_X - R_TOP} ${SHAFT_TOP}q${R_TOP} 3.5 ${R_TOP * 2} 0`} fill="none" stroke="#3d382c" strokeOpacity=".3" />
      <rect x={COL_X - R_TOP - 13} y={SHAFT_TOP - 28} width={R_TOP * 2 + 26} height="13" fill="url(#slab)" />
      <rect x={COL_X - R_TOP - 13} y={SHAFT_TOP - 16.5} width={R_TOP * 2 + 26} height="2.5" fill="#3d382c" opacity=".22" />
    </g>
  );
}

/** One triglyph of the frieze: three uprights between two grooves and two half-grooves. */
const Triglyph = ({ x }: { x: number }) => (
  <g>
    <rect x={x - 13} y="40" width="26" height="26" fill="#e6e0d2" />
    <path d={`M${x - 8.5} 43v23M${x} 43v23M${x + 8.5} 43v23`} stroke="#3d382c" strokeOpacity=".32" strokeWidth="2.6" />
    <path d={`M${x - 7} 43v23M${x + 1.5} 43v23M${x + 10} 43v23`} stroke="#fffdf6" strokeOpacity=".7" strokeWidth="1" />
  </g>
);

/**
 * Where the tiled floor's far edge sits on screen, in px from the top. The floor is `.thermae-floor` in index.css:
 * 18vh deep, tipped back 55 degrees under a 300 px perspective, its near edge 9vh above the bottom. Keep in step.
 */
function floorTop(vh: number) {
  const depth = 0.18 * vh;
  return vh - 0.09 * vh - (depth * 0.574 * 300) / (300 + depth * 0.819);
}

function useViewport() {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/**
 * A colonnade in front of arches that open onto a pale sky: the far wall of the bathhouse. The columns stand on
 * the floor on every screen: a taller screen gets larger columns (up to 1.4 times) and then taller shafts.
 */
function Colonnade() {
  const { w, h } = useViewport();
  const tall = Math.max(320, floorTop(h) - WALL_TOP + 2);
  const scale = Math.min(1.4, Math.max(1, tall / 500));
  const H = tall / scale; // the wall's height in the drawing's own units
  return (
    <svg className="thermae-arches" width="100%" height={tall} aria-hidden>
      <defs>
        <linearGradient id="dreamsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9d8e4" /><stop offset=".55" stopColor="#e3eee9" /><stop offset="1" stopColor="#f6f1e4" />
        </linearGradient>
        {/* a cylinder of warm marble lit from the left */}
        <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9b19e" /><stop offset=".1" stopColor="#ddd6c6" /><stop offset=".34" stopColor="#fbf8f0" /><stop offset=".6" stopColor="#ece6d8" /><stop offset=".88" stopColor="#c0b8a5" /><stop offset="1" stopColor="#9d9583" />
        </linearGradient>
        <linearGradient id="slab" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf8f0" /><stop offset=".7" stopColor="#e6dfd0" /><stop offset="1" stopColor="#c9c1af" />
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f3ea" /><stop offset=".8" stopColor="#e9e3d5" /><stop offset="1" stopColor="#d3ccbb" />
        </linearGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        {/* faint veins and weathering, kept inside whatever it is applied to */}
        <filter id="vein" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".035 .009" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .2  0 0 0 -1.1 .62" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode /></feMerge>
        </filter>
        <pattern id="arcade" width={BAY} height={H} patternUnits="userSpaceOnUse">
          {/* the opening: the wall's thickness shows on the left, in shade */}
          <path d={`M104 ${H}V214a80 80 0 0 1 160 0V${H}z`} fill="#c3ccc6" />
          <path d={`M113 ${H}V214a75.5 80 0 0 1 151 0V${H}z`} fill="url(#dreamsky)" />
          <g filter="url(#soft)" fill="#fff" opacity=".9">
            <ellipse cx="168" cy="200" rx="38" ry="10" /><ellipse cx="223" cy="262" rx="30" ry="8" /><ellipse cx="158" cy="330" rx="26" ry="7" />
          </g>
          <path d={`M104 ${H}V214a80 80 0 0 1 160 0V${H}`} fill="none" stroke="#2b3437" strokeOpacity=".22" strokeWidth="1.5" />
          {/* cornice, frieze, architrave */}
          <rect y="24" width={BAY} height="10" fill="url(#beam)" />
          <rect y="34" width={BAY} height="5" fill="#3d382c" opacity=".2" />
          <rect y="39" width={BAY} height="28" fill="#f1ecdf" />
          <Triglyph x={COL_X} /><Triglyph x={COL_X + BAY / 2} />
          <rect y="66" width={BAY} height="3.5" fill="#f9f6ee" />
          <rect y="69.5" width={BAY} height="20.5" fill="url(#beam)" />
          <g filter="url(#vein)"><Column end={H - 7} /></g>
          {/* the step the columns stand on, where the wall meets the floor */}
          <rect y={H - 7} width={BAY} height="7" fill="url(#beam)" />
          <rect y={H - 7} width={BAY} height="1" fill="#3d382c" opacity=".25" />
        </pattern>
      </defs>
      <rect width={w / scale + 1} height={H} fill="url(#arcade)" transform={`scale(${scale})`} />
    </svg>
  );
}

function Backdrop() {
  return (
    <>
      <div className="thermae-wall" aria-hidden />
      <Colonnade />
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
