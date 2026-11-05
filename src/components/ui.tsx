import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect } from 'react';
import { cx } from '@/lib/util';

/** Win95-style window. `title` renders in a vaporwave title bar; omit it for a plain bevelled panel. */
export function Card({ children, className, title, action, dim }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; dim?: boolean }) {
  return (
    <section className={cx('bevel-out min-w-0 bg-panel/95 backdrop-blur-sm', className)}>
      {title && (
        <header className={cx('flex items-center justify-between gap-2 px-1.5 py-0.5', dim ? 'titlebar-dim' : 'titlebar')}>
          <h2 className="truncate font-display text-xl leading-6 tracking-wide text-white [text-shadow:1px_1px_0_#2a1850]">{title}</h2>
          <div className="flex shrink-0 items-center gap-1" aria-hidden>
            {['_', '□', '×'].map(c => <span key={c} className="bevel-btn flex h-4 w-4 items-center justify-center bg-silver font-pixel text-[8px] leading-none text-black">{c}</span>)}
          </div>
        </header>
      )}
      {action && <div className="flex justify-end border-b border-line/60 bg-panel2/40 px-3 py-1.5">{action}</div>}
      <div className={cx(!className?.includes('!p-') && 'p-3 sm:p-4')}>{children}</div>
    </section>
  );
}

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'gold' | 'danger' | 'cyan' }) {
  const v = {
    primary: 'bg-xp text-[#1d0b3d] hover:brightness-110',
    cyan: 'bg-cyan text-[#1d0b3d] hover:brightness-110',
    ghost: 'bg-panel2 text-slate-100 hover:bg-line',
    gold: 'bg-gold text-[#1d0b3d] hover:brightness-105',
    danger: 'bg-hp text-white hover:brightness-110'
  }[variant];
  return <button {...p} className={cx('bevel-btn inline-flex min-h-[40px] items-center justify-center gap-2 px-4 text-sm font-bold uppercase tracking-wider transition active:translate-x-px active:translate-y-px disabled:opacity-40 disabled:grayscale', v, className)} />;
}

/** Chunky Win95 progress bar. `color` may be any CSS background (gradient ok). */
export function Bar({ value, color = 'linear-gradient(90deg,#ff71ce,#b967ff,#01cdfe)', className, height = 'h-4' }: { value: number; color?: string; className?: string; height?: string }) {
  const chunk = 'repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 11px)';
  return (
    <div className={cx('bevel-in w-full overflow-hidden bg-[#0d0420] p-[2px]', height, className)}>
      <div className="h-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color, maskImage: chunk, WebkitMaskImage: chunk }} />
    </div>
  );
}

export function Ring({ value, size = 96, stroke = 10, color = '#ff71ce', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a1850" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .7s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const field = 'bevel-in min-h-[40px] w-full bg-[#0d0420] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:shadow-cyanglow';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(field, 'py-2', p.className)} />;
export const Label = ({ children, text }: { children: ReactNode; text: string }) => (
  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-lav">{text}{children}</label>
);

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#0d0420]/75 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="bevel-out max-h-[90vh] w-full max-w-lg overflow-y-auto bg-panel" onClick={e => e.stopPropagation()}>
        <div className="titlebar sticky top-0 z-10 flex items-center justify-between px-1.5 py-0.5">
          <h3 className="font-display text-xl text-white [text-shadow:1px_1px_0_#2a1850]">{title}</h3>
          <button onClick={onClose} className="bevel-btn flex h-7 w-7 items-center justify-center bg-silver font-pixel text-[10px] text-black" aria-label="Close">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const Chip = ({ children, color }: { children: ReactNode; color?: string }) => (
  <span className="inline-flex items-center gap-1 border px-1.5 py-px text-[11px] font-semibold" style={{ borderColor: (color ?? '#94a3b8') + '99', background: (color ?? '#94a3b8') + '1f', color: color ?? '#cbd5e1' }}>{children}</span>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="border border-dashed border-line p-4 text-center text-sm text-slate-400">
    <span className="mb-1 block font-display text-lg text-lav">🚧 under construction 🚧</span>{children}
  </p>
);

/** Page heading in the style of an old homepage: chrome text + blinking cursor. */
export const PageTitle = ({ children, sub, right }: { children: ReactNode; sub?: string; right?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="chrome-text font-display text-4xl leading-none sm:text-5xl">{children}<span className="blink text-cyan">_</span></h1>
      {sub && <p className="mt-2 inline-block bg-[#0d0420]/85 px-1.5 py-0.5 text-xs uppercase tracking-[0.25em] text-lav">{sub}</p>}
    </div>
    {right}
  </div>
);
