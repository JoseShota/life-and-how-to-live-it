import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting } from '@/db/db';
import type { Area } from '@/db/types';
import { DEFAULT_FLOOR_RATE, MIN_VERDICT_HOURS, realRates, type RealRateRow } from '@/finance/finance';
import { getTaxProfile } from '@/game/engine';
import { cx, dateKey, mxn, parseKey, uid } from '@/lib/util';
import { Button, Card, Empty, Input, Label, Modal } from './ui';
import { Glyph } from './Glyph';

const shift = (key: string, days: number) => { const d = parseKey(key); d.setDate(d.getDate() + days); return dateKey(d); };

/** Real MXN per hour over [from, to] (inclusive), recomputed live from the ledger, sessions, hours and tax profile. */
export function useRealRates(from: string, to: string) {
  return useLiveQuery(async () => {
    const [areas, txs, sessions, extra, profile, floor] = await Promise.all([
      db.areas.orderBy('order').toArray(), db.transactions.toArray(),
      db.sessions.where('date').between(from, to, true, true).toArray(), db.areaHours.toArray(),
      getTaxProfile(), db.settings.get('floorRate')
    ]);
    return realRates({ areas, txs, sessions, extra, from, to, creditIva: profile.regime === 'resico' && profile.chargesIva, floorRate: (floor?.value as number | undefined) ?? DEFAULT_FLOOR_RATE });
  }, [from, to]);
}

const WINDOWS = [30, 90, 365] as const;

/** The Wealth Engine: where an hour really pays most, after taxes, costs and all the hours an activity takes. */
export function RealRateCard() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(90);
  const to = dateKey();
  const data = useRealRates(shift(to, -(days - 1)), to);
  const [hoursFor, setHoursFor] = useState<Area | null>(null);
  const [floorEdit, setFloorEdit] = useState<string | null>(null);
  if (!data) return null;
  const hasData = data.rows.some(r => r.gross > 0 || r.costs > 0 || r.hours > 0);

  return (
    <Card title="The Wealth Engine · real MXN per hour">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="mac-inset grid grid-cols-3 bg-white p-0.5" role="group" aria-label="Window">
            {WINDOWS.map(w => <button key={w} aria-pressed={days === w} onClick={() => setDays(w)} className={cx('min-h-[40px] px-3 font-display text-sm', days === w ? 'mac-btn bg-laurel' : 'text-ink/60')}>{w} d</button>)}
          </div>
          <span className="text-sm">Average <b className="text-gold">{data.average === null ? '—' : `${mxn(data.average)}/h`}</b></span>
        </div>
        {!hasData ? <Empty>Log income with the activity that earned it, tag work expenses with their activity, and track focus time. This table ranks where your next hour really pays most.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-ink/55"><th className="py-1">Activity</th><th className="text-right">Net</th><th className="text-right">Hours</th><th className="text-right">Gross/h</th><th className="text-right">Real/h</th><th><span className="sr-only">Add hours</span></th></tr></thead>
              <tbody>{data.rows.map(r => <RateRow key={r.area.id} r={r} floor={data.floor} onHours={() => setHoursFor(r.area)} />)}</tbody>
            </table>
          </div>
        )}
        <details className="text-[12px] text-ink/70">
          <summary className="flex min-h-[40px] cursor-pointer items-center font-display text-sm text-lav">How "real" is computed</summary>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Net:</b> RESICO income counts its subtotal minus ISR at the rate its month actually reaches; IVA is the SAT's money, withholdings are prepayments. Salary counts what landed. Estimates, like the tax card.</li>
            <li><b>Costs:</b> expenses tagged with the activity (Transaction → "Cost of"), minus IVA you can credit. "Shared work costs" are split across the earning activities by hours{data.unallocatedShared > 0 ? ` (${mxn(data.unallocatedShared)} not split yet: no hours logged)` : ''}.</li>
            <li><b>Hours:</b> focus sessions plus non-focus hours (admin, sales, commute, class time), one-off or every week. Gross/h is the old view: what landed ÷ focus hours.</li>
            <li><b>Verdicts</b> (from {MIN_VERDICT_HOURS} h): below the floor means the plan's kill rule applies if it stays there 3 months; ≥ 2× the average means give it more hours and raise its price.</li>
          </ul>
        </details>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          {floorEdit === null
            ? <><span>Floor: <b>{mxn(data.floor)}/h</b></span><Button variant="ghost" className="!px-3" onClick={() => setFloorEdit(String(data.floor))} aria-label="Edit floor rate"><Glyph name="pencil" size={14} /></Button></>
            : <>
                <Label text="Floor rate (MXN/h)"><Input inputMode="decimal" value={floorEdit} onChange={e => setFloorEdit(e.target.value)} className="!w-32" /></Label>
                <Button variant="ghost" onClick={async () => { const n = Number(floorEdit); if (n > 0) await setSetting('floorRate', n); setFloorEdit(null); }}>Save</Button>
              </>}
        </div>
      </div>
      {hoursFor && <HoursForm area={hoursFor} onClose={() => setHoursFor(null)} />}
    </Card>
  );
}

function RateRow({ r, floor, onHours }: { r: RealRateRow; floor: number; onHours: () => void }) {
  const cost = r.costs + r.sharedCosts;
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2">
        <span className="inline-flex items-center gap-1.5"><Glyph name={r.area.icon} size={16} />{r.area.short}</span>
        {r.verdict === 'below-floor' && <div className="text-[11px] text-hp">below the {mxn(floor)} floor</div>}
        {r.verdict === 'scale' && <div className="text-[11px] text-ok">2× the average: scale it</div>}
        {!r.area.monetizable && <div className="text-[11px] text-ink/55">not an earning activity</div>}
      </td>
      <td className="py-2 text-right" title={`Landed ${mxn(r.gross)} · taxes and IVA ${mxn(r.taxes)} · costs ${mxn(cost)}`}>
        {mxn(r.net - cost)}
        {cost > 0 && <div className="text-[11px] text-ink/55">costs {mxn(cost)}</div>}
      </td>
      <td className="py-2 text-right">{r.hours.toFixed(1)}{r.otherHours > 0 && <div className="text-[11px] text-ink/55">+{r.otherHours.toFixed(1)} other</div>}</td>
      <td className="py-2 text-right text-ink/60">{r.grossRate ? mxn(r.grossRate) : '—'}</td>
      <td className={cx('py-2 text-right font-bold', r.realRate === null ? 'text-ink/50' : r.realRate < 0 ? 'text-hp' : 'text-gold')}>{r.realRate === null ? '—' : mxn(r.realRate)}</td>
      <td className="py-1 pl-1 text-right"><button onClick={onHours} className="flex h-10 w-10 items-center justify-center text-ink/55 hover:text-xp" aria-label={`Add non-focus hours to ${r.area.short}`}><Glyph name="hourglass" size={16} /></button></td>
    </tr>
  );
}

/** Non-focus hours for an area: one-off, or standing every week (class time, a weekly admin block). */
function HoursForm({ area, onClose }: { area: Area; onClose: () => void }) {
  const entries = useLiveQuery(() => db.areaHours.where('areaId').equals(area.id).reverse().sortBy('date'), [area.id], []);
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(dateKey());
  const [weekly, setWeekly] = useState(false);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const save = async () => {
    const h = Number(hours);
    if (!(h > 0) || (weekly && h > 100) || (!weekly && h > 24)) return;
    await db.areaHours.add({ id: uid(), areaId: area.id, date, hours: h, weekly: weekly || undefined, until: weekly && until ? until : undefined, note: note.trim() || undefined, createdAt: Date.now() });
    setHours(''); setNote(''); setUntil('');
  };
  return (
    <Modal open onClose={onClose} title={`Other hours · ${area.short}`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink/70">Time this activity takes outside focus sessions: admin, sales, commuting, class time. It lowers the real MXN/h; it pays no XP.</p>
        <div className="mac-inset grid grid-cols-2 bg-white p-0.5" role="group" aria-label="Kind">
          {[false, true].map(w => <button key={String(w)} aria-pressed={weekly === w} onClick={() => setWeekly(w)} className={cx('min-h-[40px] px-3 font-display text-sm', weekly === w ? 'mac-btn bg-laurel' : 'text-ink/60')}>{w ? 'Every week' : 'One time'}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Label text={weekly ? 'Hours per week' : 'Hours'}><Input inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} placeholder={weekly ? 'e.g. 6' : 'e.g. 1.5'} /></Label>
          <Label text={weekly ? 'From' : 'Date'}><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Label>
          {weekly && <Label text="Until (optional)"><Input type="date" value={until} onChange={e => setUntil(e.target.value)} /></Label>}
          <Label text="What"><Input value={note} onChange={e => setNote(e.target.value)} placeholder={weekly ? 'class time' : 'invoicing'} /></Label>
        </div>
        <Button onClick={save}><Glyph name="plus" size={16} />Add hours</Button>
        {entries.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {entries.map(e => (
              <li key={e.id} className="flex items-center gap-2 py-1">
                <span className="flex-1">{e.weekly ? `${e.hours} h every week from ${e.date.slice(5)}${e.until ? ` to ${e.until.slice(5)}` : ''}` : `${e.hours} h on ${e.date.slice(5)}`}{e.note ? ` · ${e.note}` : ''}</span>
                <button className="flex h-10 w-10 items-center justify-center text-ink/40 hover:text-hp" aria-label="Delete hours" onClick={async () => { if (confirm('Delete these hours?')) await db.areaHours.delete(e.id); }}><Glyph name="trash" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-ink/60">Standing weekly hours count automatically every week until their end date, so class time doesn't need logging.</p>
      </div>
    </Modal>
  );
}
