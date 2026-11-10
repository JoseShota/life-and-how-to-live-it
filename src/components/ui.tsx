import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { cx } from '@/lib/util';

/** Which windows are rolled up, per device (a view preference: not synced, not in backups). */
const SHADE_KEY = 'shade';
function readShades(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(SHADE_KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}
function useShade(id: string | undefined, defaultShut: boolean) {
  const [shut, setShut] = useState(() => (id ? readShades()[id] ?? defaultShut : false));
  const toggle = () => setShut(v => {
    if (id) { try { localStorage.setItem(SHADE_KEY, JSON.stringify({ ...readShades(), [id]: !v })); } catch { /* private mode: the choice lasts until reload */ } }
    return !v;
  });
  return [shut, toggle] as const;
}

/**
 * Macintosh System 6 window. With `title`: pinstriped title bar + close box. Without: plain 1-bit panel.
 * A titled window rolls up to its title bar when the bar is tapped (WindowShade), so the room shows through;
 * the choice is kept on this device under `id` (the title, when it is plain text).
 */
export function Card({ children, className, title, action, id, defaultShut = false }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; id?: string; defaultShut?: boolean }) {
  const padded = !className?.includes('!p-');
  const shadeId = id ?? (typeof title === 'string' ? title : undefined);
  const [shut, toggle] = useShade(title ? shadeId : undefined, defaultShut);
  return (
    <section className={cx('mac-window min-w-0', shut && 'self-start', className)}>
      {title && (
        <header className={cx('mac-titlebar', shut && '!border-b-0')}>
          <span className={cx('mac-close', shut && 'mac-close-shut')} aria-hidden />
          <h2 className="mac-title">{title}</h2>
          {/* The whole bar is the control: 26 px tall to look right, 40 px to tap. */}
          {shadeId && <button type="button" onClick={toggle} aria-expanded={!shut} aria-label={`${shadeId}: ${shut ? 'open' : 'roll up'}`} title={shut ? 'Open' : 'Roll up'} className="absolute inset-x-0 -inset-y-[7px] cursor-pointer" />}
        </header>
      )}
      {!shut && action && <div className="flex justify-end border-b-2 border-line bg-panel2 px-3 py-1.5">{action}</div>}
      {!shut && <div className={cx(padded && 'p-3 sm:p-4')}>{children}</div>}
    </section>
  );
}

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'gold' | 'danger' | 'cyan' }) {
  const v = {
    primary: 'bg-pink mac-default',
    cyan: 'bg-mint',
    ghost: 'bg-white',
    gold: 'bg-laurel mac-default',
    danger: 'bg-white text-hp'
  }[variant];
  return <button {...p} className={cx('mac-btn inline-flex min-h-[40px] items-center justify-center gap-2 px-4 font-display text-[15px] text-ink transition hover:brightness-[1.03] disabled:opacity-40', v, className)} />;
}

/** Mac progress bar: 1-bit frame, dithered pink fill. `color` overrides the fill (any CSS background). */
export function Bar({ value, color, className, height = 'h-4' }: { value: number; color?: string; className?: string; height?: string }) {
  return (
    <div className={cx('mac-inset w-full overflow-hidden', height, className)}>
      <div className={cx('h-full border-r-2 border-ink transition-all duration-700', !color && 'fill-pool')} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color, borderRightWidth: value > 0 && value < 1 ? 2 : 0 }} />
    </div>
  );
}

export function Ring({ value, size = 96, stroke = 10, color = '#9c4a57', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2 - 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r + stroke / 2} stroke="#2b3437" strokeWidth={2} fill="#fff" />
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2} stroke="#2b3437" strokeWidth={2} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke - 2} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .7s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const field = 'mac-inset min-h-[40px] w-full px-3 text-[15px] text-ink outline-none placeholder:text-ink/40 focus:shadow-glow';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(field, 'py-2', p.className)} />;
export const Label = ({ children, text }: { children: ReactNode; text: string }) => (
  <label className="flex flex-col gap-1 font-display text-[13px] text-lav">{text}{children}</label>
);

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-white/50 p-0 backdrop-blur-[3px] sm:items-center sm:p-4" onClick={onClose}>
      <div className="mac-window max-h-[90vh] w-full max-w-lg overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="mac-titlebar sticky top-0 z-10">
          <button onClick={onClose} className="mac-close cursor-pointer" aria-label="Close" />
          <h3 className="mac-title">{title}</h3>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const Chip = ({ children, color }: { children: ReactNode; color?: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink px-2 text-[12px] font-bold leading-[18px]" style={{ background: (color ?? '#d4d9d6') + '66' }}>{children}</span>
);

/** Empty state: one plain line saying what is missing. */
export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="mac-inset border-dashed bg-panel2/60 p-4 text-center">
    <p className="text-sm text-ink/70">{children}</p>
  </div>
);

/** Page heading: marble inscription + katakana + typewritten subtitle, framed by a Greek key. */
export const PageTitle = ({ children, jp, sub, right, plain }: { children: ReactNode; jp?: string; sub?: string; right?: ReactNode; plain?: string }) => (
  <div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {jp && <div className="font-jp text-lg leading-none text-xp [text-shadow:1px_1px_0_#fff]">{jp}{plain && <span className="ml-2 align-middle font-display text-sm text-ink/70">· {plain}</span>}</div>}
        <h1 className="marble-text inscription text-4xl font-bold leading-tight sm:text-5xl">{children}</h1>
        {sub && <p className="mt-1 inline-block bg-white/80 px-1.5 font-type text-sm text-ink">{sub}<span className="blink">▌</span></p>}
      </div>
      {right}
    </div>
    <div className="meander mt-3 opacity-70" />
  </div>
);
