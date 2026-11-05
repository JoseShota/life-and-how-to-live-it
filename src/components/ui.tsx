import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/util';

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel p-4 sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold tracking-wide text-slate-200">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'gold' | 'danger' }) {
  const v = {
    primary: 'bg-xp text-white hover:bg-violet-500 shadow-glow',
    ghost: 'bg-panel2 text-slate-200 hover:bg-line',
    gold: 'bg-gold text-slate-900 hover:bg-amber-300',
    danger: 'bg-hp/20 text-red-300 hover:bg-hp/30'
  }[variant];
  return <button {...p} className={cx('inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40', v, className)} />;
}

export function Bar({ value, color = '#8b5cf6', className, height = 'h-2.5' }: { value: number; color?: string; className?: string; height?: string }) {
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-slate-800', height, className)}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, size = 96, stroke = 10, color = '#8b5cf6', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1e293b" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .7s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx('min-h-[40px] w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-xp', p.className)} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx('min-h-[40px] w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-xp', p.className)} />
);
export const Label = ({ children, text }: { children: ReactNode; text: string }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">{text}{children}</label>
);

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-panel2" aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Chip = ({ children, color }: { children: ReactNode; color?: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: (color ?? '#64748b') + '26', color: color ?? '#cbd5e1' }}>{children}</span>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-slate-500">{children}</p>
);
