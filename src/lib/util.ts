import { format } from 'date-fns';

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const dateKey = (d: Date | number = new Date()) => format(d, 'yyyy-MM-dd');

export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const mxn = (n: number, digits = 0) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

export const hm = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
};

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Roman numerals for levels (classical flavour). */
export function roman(n: number): string {
  if (n <= 0) return '—';
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Coins are drachmae. */
export const DR = '₯';
