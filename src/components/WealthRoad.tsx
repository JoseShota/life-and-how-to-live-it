import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting } from '@/db/db';
import { BUCKET_ACCOUNTS } from '@/db/seed';
import { loadWealthSnapshot, wealthLevelReached, checkAchievements } from '@/game/achievements';
import { WEALTH_LEVELS, investShare } from '@/finance/wealth';
import { cx, mxn, uid } from '@/lib/util';
import { Bar, Button, Card, Input, Label } from './ui';
import { Glyph } from './Glyph';

/** The plan's phases as levels: what you've reached, what the next one needs, and what it unlocks. */
export function WealthRoad() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const data = useLiveQuery(async () => ({ snap: await loadWealthSnapshot(), reached: await wealthLevelReached() }),
    [accounts], undefined);
  const estimate = useLiveQuery(() => db.settings.get('spendingEstimate'))?.value as number | undefined;
  const [est, setEst] = useState('');
  if (!data) return null;
  const { snap, reached } = data;
  const next = WEALTH_LEVELS[reached];
  const share = investShare(reached, snap.shieldMonths);
  const missing = BUCKET_ACCOUNTS.filter(b => !accounts.some(a => a.role === b.role && !a.archived));
  // Once a level is reached it stays reached; warn when today's shield has dropped below what that level needs.
  const shieldNeed = reached >= 4 ? 6 : reached >= 3 ? 3 : reached >= 2 ? 1 : 0;
  const belowLine = shieldNeed > 0 && snap.shieldMonths < shieldNeed;

  return (
    <Card title="The Road · wealth levels">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-lg">Level {reached} of {WEALTH_LEVELS.length}{reached ? ` · ${WEALTH_LEVELS[reached - 1].name}` : ' · just starting'}</span>
          <span className={cx('font-display text-sm', share > 0 ? 'text-ok' : 'text-ink/60')}>Investing: {Math.round(share * 100)}% of savings</span>
        </div>
        <ol className="flex gap-1" aria-label="Wealth levels">
          {WEALTH_LEVELS.map(l => <li key={l.n} title={l.name} className={cx('h-3 flex-1 border-2 border-ink', l.n <= reached ? 'bg-mint' : 'bg-white')} />)}
        </ol>
        {belowLine && <p role="status" className="mac-inset bg-pink/40 p-2 text-sm">The shield is at {snap.shieldMonths.toFixed(1)} months, under the {shieldNeed} this level needs. Refill it before investing more; the level itself stays yours.</p>}
        {next ? (
          <div>
            <div className="font-display text-sm text-lav">Next: level {next.n} · {next.name} (+{next.xp} XP)</div>
            <ul className="mt-1 flex flex-col gap-2">
              {snap.requirements[next.n].map(r => (
                <li key={r.label} className="text-sm">
                  <div className="flex items-start gap-2"><Glyph name={r.met ? 'check' : 'dot'} size={16} className={cx('mt-0.5 shrink-0', r.met ? 'text-ok' : 'text-ink/50')} /><span className="flex-1">{r.label}</span></div>
                  <Bar value={r.progress} height="h-2" className="mt-1" color={r.met ? '#a6d9d1' : undefined} />
                  <div className="text-[11px] text-ink/60">{r.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-type text-sm text-ink/70">Unlocks: {next.unlock}.</p>
          </div>
        ) : <p className="font-type">every level reached. the road goes on.</p>}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="mac-inset bg-white p-2"><div className="text-[11px] text-lav">Shield (emergency fund)</div><div className="font-display text-xl">{mxn(snap.shield)}</div></div>
          <div className="mac-inset bg-white p-2"><div className="text-[11px] text-lav">Invested</div><div className="font-display text-xl">{mxn(snap.invested)}</div></div>
        </div>
        {snap.spendingMonths === 0 && (
          <div className="flex items-end gap-2">
            <Label text={`Monthly spending estimate (until a full month is logged)${estimate ? ` · now ${mxn(estimate)}` : ''}`}><Input inputMode="decimal" value={est} onChange={e => setEst(e.target.value)} placeholder="e.g. 25000" /></Label>
            <Button variant="ghost" onClick={async () => { const n = Number(est); if (n > 0) { await setSetting('spendingEstimate', n); setEst(''); await checkAchievements(); } }}>Save</Button>
          </div>
        )}
        {missing.length > 0 && (
          <div className="mac-inset bg-laurel/30 p-2 text-sm">
            <p>The plan keeps money in buckets. Missing: {missing.map(m => m.name).join(', ')}.</p>
            <Button variant="gold" className="mt-2" onClick={async () => {
              const order = accounts.length;
              await db.accounts.bulkAdd(missing.map((m, i) => ({ ...m, id: uid(), order: order + i })));
            }}><Glyph name="plus" size={14} />Create bucket accounts</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
