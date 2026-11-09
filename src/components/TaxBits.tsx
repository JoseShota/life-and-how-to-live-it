import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting } from '@/db/db';
import type { Account, Transaction } from '@/db/types';
import { getTaxProfile, transfer } from '@/game/engine';
import { loadWealthSnapshot, wealthLevelReached } from '@/game/achievements';
import { investShare } from '@/finance/wealth';
import { monthTotals } from '@/finance/finance';
import {
  DEFAULT_SPLIT, RESICO_ANNUAL_CAP, monthTax, openMonths, reserveFor, smartSuggestion, splitIncome, yearToDate, type SplitPlan
} from '@/finance/tax';
import { balanceOf } from '@/finance/finance';
import { cx, dateKey, mxn, parseKey } from '@/lib/util';
import { Bar, Button, Card, Input, Modal, Select } from './ui';
import { Glyph } from './Glyph';

const ROLE_NAME: Record<string, string> = { tax: 'Tax reserve', shield: 'Shield', invest: 'Investments', skills: 'Skills', fun: 'Fun', operating: 'Operating (stays)' };
const MONTH = (m: string) => parseKey(`${m}-01`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

export function useSplitPlan(): SplitPlan {
  return { ...DEFAULT_SPLIT, ...((useLiveQuery(() => db.settings.get('splitPlan'))?.value as Partial<SplitPlan> | undefined) ?? {}) };
}

/**
 * "Split it": the moment income lands, move the tax reserve and the plan's buckets out of the operating account.
 * Pay yourself first (Profit First), with the exact RESICO reserve for invoiced income.
 */
export function SplitSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const plan = useSplitPlan();
  const accounts = useLiveQuery(() => db.accounts.filter(a => !a.archived).toArray(), [], []);
  const ctx = useLiveQuery(async () => {
    const month = tx.date.slice(0, 7);
    const txs = await db.transactions.toArray();
    const before = txs.filter(t => t.id !== tx.id && t.kind === 'income' && t.date.startsWith(month) && t.incomeTax?.kind === 'resico').reduce((s, t) => s + t.incomeTax!.subtotal, 0);
    const snap = await loadWealthSnapshot();
    const share = investShare(await wealthLevelReached(), snap.shieldMonths);
    const t = parseKey(tx.date);
    const prev = [1, 2, 3].map(i => monthTotals(txs, dateKey(new Date(t.getFullYear(), t.getMonth() - i, 1)).slice(0, 7)).income);
    const smart = smartSuggestion(monthTotals(txs, month).income, prev, plan);
    const asked = (await db.settings.get('smartAsked'))?.value === month;
    return { reserve: reserveFor(tx, before), share, smart: asked ? null : smart, month };
  }, [tx.id, plan.savingsPct]);
  const rows = useMemo(() => (ctx ? splitIncome(tx.amount, ctx.reserve, plan, ctx.share) : []), [ctx, tx.amount, plan]);
  const [moved, setMoved] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<Record<string, string>>({});
  const accFor = (role: string) => target[role] ?? accounts.find(a => a.role === role && a.id !== tx.accountId)?.id ?? '';
  const move = async (role: string, amount: number) => {
    const to = accFor(role);
    if (!to || moved[role]) return;
    await transfer(tx.accountId, to, amount, tx.date, `Split: ${ROLE_NAME[role]}`);
    setMoved(m => ({ ...m, [role]: true }));
  };
  const movable = rows.filter(r => r.role !== 'operating');

  return (
    <Modal open onClose={onClose} title="Split it · pay yourself first">
      <div className="flex flex-col gap-3">
        <p className="font-type text-sm text-ink/70">{mxn(tx.amount, 2)} landed in your account. Move each part now, while it's still easy.{ctx && ctx.share > 0 ? ` Investing is open: ${Math.round(ctx.share * 100)}% of savings goes to investments.` : ' Savings fill the shield first; investing opens at a 3-month shield.'}</p>
        {ctx?.smart && (
          <div className="mac-inset bg-mint/30 p-2 text-sm">
            This month's income beats your 3-month median ({mxn(ctx.smart.median)}). Save {ctx.smart.to}% instead of {ctx.smart.from}% from now on?
            <div className="mt-2 flex gap-2">
              <Button variant="cyan" onClick={async () => { await setSetting('splitPlan', { ...plan, savingsPct: ctx.smart!.to }); await setSetting('smartAsked', ctx.month); }}>Yes, +2 points</Button>
              <Button variant="ghost" onClick={() => setSetting('smartAsked', ctx.month)}>Not now</Button>
            </div>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map(r => (
            <li key={r.role} className="flex flex-col gap-1 border-b border-line/40 pb-2 text-sm last:border-0">
              <div className="flex items-baseline justify-between gap-2"><span className="font-display">{ROLE_NAME[r.role]}</span><b>{mxn(r.amount, 2)}</b></div>
              {r.role !== 'operating' && (
                <div className="flex gap-2">
                  <Select aria-label={`Account for ${ROLE_NAME[r.role]}`} className="flex-1" value={accFor(r.role)} onChange={e => setTarget(t => ({ ...t, [r.role]: e.target.value }))}>
                    <option value="">— choose account —</option>
                    {accounts.filter((a: Account) => a.id !== tx.accountId && a.type !== 'credit').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                  <Button variant={moved[r.role] ? 'ghost' : 'primary'} disabled={moved[r.role] || !accFor(r.role)} onClick={() => move(r.role, r.amount)}>{moved[r.role] ? 'Moved' : 'Move'}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {ctx && ctx.reserve > 0 && <p className="text-xs text-ink/60">Tax reserve = (ISR at this month's RESICO rate − ISR withheld, never below 0) + (IVA charged − IVA withheld). An estimate; the SAT declaration is the truth.</p>}
        <div className="flex gap-2">
          <Button variant="gold" className="flex-1" disabled={movable.every(r => moved[r.role])} onClick={async () => { for (const r of movable) await move(r.role, r.amount); }}>Move all</Button>
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

/** RESICO this month (and last month until its 17th): ISR and IVA estimates, the reserve, and the 3.5 M cap. */
export function TaxCard() {
  const profile = useLiveQuery(() => getTaxProfile());
  const txs = useLiveQuery(() => db.transactions.toArray(), [], []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  // Today's first-of-month banner links here (/money#tax).
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const shown = !!profile && profile.regime === 'resico';
  useEffect(() => { if (shown && location.hash === '#tax') ref.current?.scrollIntoView({ block: 'start' }); }, [location.hash, shown]);
  if (!shown) return null;
  const months = openMonths().map(m => monthTax(txs, m));
  const owed = months.reduce((s, m) => s + m.totalDue, 0);
  const reserve = accounts.filter(a => a.role === 'tax' && !a.archived).reduce((s, a) => s + balanceOf(a, txs), 0);
  const ytd = yearToDate(txs, new Date().getFullYear(), profile.capIncludesSalary);
  return (
    <div ref={ref} id="tax" className="scroll-mt-24">
    <Card title="Taxes · RESICO (estimate)">
      <div className="flex flex-col gap-3 text-sm">
        {months.map(m => (
          <div key={m.month} className="mac-inset bg-white p-2">
            <div className="flex items-baseline justify-between"><span className="font-display">{MONTH(m.month)}</span><span className="text-[12px] text-ink/60">due {m.dueDate.slice(8)}/{m.dueDate.slice(5, 7)}</span></div>
            <table className="mt-1 w-full text-[13px]"><tbody>
              <tr><td>Income collected (no IVA)</td><td className="text-right">{mxn(m.base, 2)}</td></tr>
              <tr><td>ISR at {(m.rate * 100).toFixed(2)}% − withheld {mxn(m.isrWithheld, 2)}</td><td className="text-right">{mxn(m.isrDue, 2)}</td></tr>
              <tr><td>IVA charged − withheld − creditable</td><td className="text-right">{m.ivaInFavor > 0 ? `in favor ${mxn(m.ivaInFavor, 2)}` : mxn(m.ivaDue, 2)}</td></tr>
              <tr className="border-t border-line font-bold"><td>To pay</td><td className="text-right">{mxn(m.totalDue, 2)}</td></tr>
            </tbody></table>
            {m.isrExcess > 0 && <p className="text-[11px] text-ink/60">ISR withheld exceeds this month's ISR by {mxn(m.isrExcess, 2)}; it can be credited in the annual return.</p>}
          </div>
        ))}
        <div className={cx('flex items-center gap-2', reserve >= owed ? 'text-ok' : 'text-hp')}>
          <Glyph name={reserve >= owed ? 'check' : 'alert'} size={16} />
          Tax reserve {mxn(reserve, 2)} · owed {mxn(owed, 2)} · {reserve >= owed ? 'covered' : `short by ${mxn(owed - reserve, 2)}`}
        </div>
        <div>
          <div className="flex justify-between text-[12px]"><span>This year toward the RESICO cap{profile.capIncludesSalary ? ' (incl. salary)' : ''}</span><span>{mxn(ytd.total)} / {mxn(RESICO_ANNUAL_CAP)}</span></div>
          <Bar value={ytd.share} height="h-3" color={ytd.share > 0.8 ? '#a8383a' : '#dccb98'} className="mt-1" />
        </div>
        <p className="text-[11px] text-ink/55">Estimates for planning cash, from the invoices you log. The monthly declaration is due on the 17th; the annual one in April. RESICO has no personal deductions.</p>
      </div>
    </Card>
    </div>
  );
}

/** Settings: tax regime and the split percentages. */
export function TaxSettings() {
  const profile = useLiveQuery(() => getTaxProfile());
  const plan = useSplitPlan();
  if (!profile) return null;
  const setProfile = (p: Partial<typeof profile>) => setSetting('taxProfile', { ...profile, ...p });
  const setPlan = (k: keyof SplitPlan, v: string) => { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n <= 60) setSetting('splitPlan', { ...plan, [k]: n }); };
  return (
    <Card title="Taxes & split it">
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1 font-display text-[13px] text-lav">Tax regime
          <Select value={profile.regime} onChange={e => setProfile({ regime: e.target.value as 'resico' | 'none' })}><option value="resico">RESICO (persona física)</option><option value="none">Not tracked</option></Select>
        </label>
        <Check checked={profile.chargesIva} onChange={v => setProfile({ chargesIva: v })} label="I charge IVA (16 %) on my invoices" />
        <Check checked={profile.capIncludesSalary} onChange={v => setProfile({ capIncludesSalary: v })} label="Count salary toward the 3.5 M RESICO cap" />
        <h3 className="mt-2 font-display text-sm text-lav">Split it (% of each income after the tax reserve)</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['savingsPct', 'skillsPct', 'funPct'] as (keyof SplitPlan)[]).map(k => (
            <label key={k} className="flex flex-col gap-1 font-display text-[13px] text-lav">{{ savingsPct: 'Savings', skillsPct: 'Skills', funPct: 'Fun' }[k]} %
              <Input inputMode="numeric" value={plan[k]} onChange={e => setPlan(k, e.target.value)} />
            </label>
          ))}
        </div>
        <p className="text-xs text-ink/60">Savings go to the shield until it covers 3 months, then partly (25 %) and at 6 months fully to investments. When a month's income beats your 3-month median, the split sheet offers +2 points of savings (Save More Tomorrow).</p>
      </div>
    </Card>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-[40px] cursor-pointer items-center gap-3">
      <input type="checkbox" className="h-5 w-5 accent-[#2f716b]" checked={checked} onChange={e => onChange(e.target.checked)} />{label}
    </label>
  );
}

