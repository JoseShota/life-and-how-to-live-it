import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { IconPicker } from '@/components/IconPicker';
import { db } from '@/db/db';
import type { Reward } from '@/db/types';
import { claimMilestoneReward, claimRef, redeem, undoRedeem } from '@/game/engine';
import { ACHIEVEMENTS, ROADS, achievementProgress, type Progress } from '@/game/achievements';
import { WEALTH_LEVELS } from '@/finance/wealth';
import { usePlayer } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cx, uid } from '@/lib/util';
import { Bar, Button, Card, Input, Label, Modal, PageTitle, Select } from '@/components/ui';

/** What a milestone reward can wait for: any laurel, or a wealth level. */
const MILESTONES = [
  ...WEALTH_LEVELS.map(w => ({ key: `wl:${w.n}`, name: `Wealth level ${w.n} · ${w.name}`, group: 'The Road' })),
  ...ROADS.flatMap(r => ACHIEVEMENTS.filter(a => a.road === r.key).map(a => ({ key: a.key, name: `${a.name} · ${a.description}`, group: r.name })))
];
const NEXT_SHOWN = 3;
const milestoneName = (key: string) => MILESTONES.find(m => m.key === key)?.name ?? key;

export default function Rewards() {
  const p = usePlayer();
  const toast = useToast();
  const rewards = useLiveQuery(() => db.rewards.filter(r => !r.archived).sortBy('cost'), [], []);
  const unlocked = useLiveQuery(() => db.unlocked.toArray(), [], []);
  // Ledger rows that matter here: wealth levels reached and promises already claimed.
  const marks = useLiveQuery(async () => new Set((await db.xp.where('source').anyOf('milestone', 'reward').toArray()).map(e => e.id)), [], new Set<string>());
  // Recounted whenever a laurel is won or lost; opening the page counts afresh.
  const progress = useLiveQuery(() => achievementProgress(), [unlocked.length], {} as Record<string, Progress>);
  const [open, setOpen] = useState(false);
  // Each road shows what is won and the three nearest laurels; the rest is one tap away, so the hall stays calm.
  const [whole, setWhole] = useState<Record<string, boolean>>({});
  // The last purchase can be undone for 30 seconds (a stray tap shouldn't cost a coffee).
  const [lastBuy, setLastBuy] = useState<{ refId: string; title: string } | null>(null);
  const remember = (refId: string, title: string) => {
    setLastBuy({ refId, title });
    setTimeout(() => setLastBuy(b => (b?.refId === refId ? null : b)), 30_000);
  };
  const buy = async (r: Reward) => {
    if (!confirm(`Spend ${r.cost} dr on "${r.title}"?`)) return;
    const refId = await redeem(r.id);
    if (!refId) return;
    toast(`Enjoy: ${r.title}`, 'gold');
    remember(refId, r.title);
  };
  const claim = async (r: Reward) => {
    if (!confirm(`Claim "${r.title}"? You promised it to yourself for this.`)) return;
    const refId = await claimMilestoneReward(r.id);
    if (!refId) return;
    toast(`Yours: ${r.title}`, 'gold');
    remember(refId, r.title);
  };
  const reached = (key: string) => (key.startsWith('wl:') ? marks.has(key) : unlocked.some(u => u.key === key));
  const remove = (r: Reward) => { if (confirm('Remove this reward?')) db.rewards.update(r.id, { archived: true }); };
  const promises = rewards.filter(r => r.unlockKey), treats = rewards.filter(r => !r.unlockKey);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="市場" plain="rewards" sub="pay in drachmae first, then enjoy it." right={<Button variant="ghost" onClick={() => setOpen(true)}><Glyph name="plus" size={16}/>Reward</Button>}>The Agora</PageTitle>
      {lastBuy && (
        <div role="status" className="mac-window flex items-center justify-between gap-2 bg-laurel/40 px-3 py-2 text-sm">
          <span>Yours: {lastBuy.title}</span>
          <Button variant="ghost" onClick={async () => { await undoRedeem(lastBuy.refId); setLastBuy(null); toast('Undone', 'bad'); }}>Undo</Button>
        </div>
      )}

      {/* Promises: what you told yourself you'd do when a real milestone is reached. No coins: the milestone pays. */}
      <Card title="Promises · for real milestones">
        <div className="flex flex-col gap-2">
          {promises.length === 0 && <p className="text-sm text-ink/70">Nothing promised yet. Name what you will do or buy when a milestone is reached (steady income, a month of shield, 30 days of exercise): it opens when you get there, and costs no drachmae.</p>}
          {promises.map(r => {
            const done = marks.has(claimRef(r.id)), ready = reached(r.unlockKey!);
            const pr = progress[r.unlockKey!];
            return (
              <div key={r.id} className={cx('flex flex-wrap items-center gap-3 border px-3 py-2', done ? 'border-ok/50 bg-ok/10' : ready ? 'border-gold/60 bg-laurel/30' : 'border-line/50 bg-panel2/60')}>
                <Glyph name={r.icon} size={30} stroke={1.3} className="shrink-0 text-cyan" />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="font-display text-lg leading-5">{r.title}</div>
                  <div className="text-[12px] text-ink/70">When: {milestoneName(r.unlockKey!)}</div>
                  {!ready && pr && pr.need > 1 && <div className="mt-1 flex items-center gap-2"><Bar value={pr.have / pr.need} height="h-2" className="max-w-[12rem]" /><span className="text-[11px] text-ink/70">{Math.min(pr.have, pr.need)} of {pr.need}</span></div>}
                </div>
                {done ? <span className="flex items-center gap-1 font-display text-ok"><Glyph name="check" size={16} />Claimed</span>
                  : <Button variant={ready ? 'gold' : 'ghost'} disabled={!ready} className="disabled:opacity-100" onClick={() => claim(r)}>{!ready && <Glyph name="lock" size={15} />}{ready ? 'Claim' : 'Not yet'}</Button>}
                <button onClick={() => remove(r)} className="flex h-10 w-10 items-center justify-center text-ink/35 hover:text-hp focus-visible:text-hp" aria-label={`Remove ${r.title}`}><Glyph name="trash" size={16}/></button>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {treats.map(r => {
          const can = p.coins >= r.cost;
          return (
            <div key={r.id} className={cx('mac-window relative flex flex-col items-center gap-2 bg-white/90 p-4 text-center', can ? 'shadow-glow' : '')}>
              {/* Always visible (touch screens have no hover). Soft delete keeps old ledger rows meaningful. */}
              <button onClick={() => remove(r)} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-ink/35 hover:text-hp focus-visible:text-hp" aria-label="Remove reward"><Glyph name="trash" size={16}/></button>
              <Glyph name={r.icon} size={44} stroke={1.3} className="text-cyan" />
              <div className="font-display text-xl leading-5">{r.title}</div>
              <Button variant={can ? 'gold' : 'ghost'} disabled={!can} className="w-full disabled:opacity-100" onClick={() => buy(r)}>{!can && <Glyph name="lock" size={15} />}{r.cost} dr</Button>
            </div>
          );
        })}
      </div>

      <Card id="Hall of Laurels" title={`Hall of Laurels (${unlocked.filter(u => ACHIEVEMENTS.some(a => a.key === u.key)).length}/${ACHIEVEMENTS.length})`}>
        <div className="flex flex-col gap-4">
          {ROADS.map(road => {
            const list = ACHIEVEMENTS.filter(a => a.road === road.key).map(a => {
              const u = unlocked.find(x => x.key === a.key);
              const pr = progress[a.key];
              return { a, u, pr, share: pr ? Math.min(1, pr.have / pr.need) : 0 };
            });
            // Won first (newest on top), then the rest by how close they are: the next laurel is always in sight.
            list.sort((x, y) => Number(!!y.u) - Number(!!x.u) || (y.u?.unlockedAt ?? 0) - (x.u?.unlockedAt ?? 0) || y.share - x.share);
            return (
              <section key={road.key}>
                <h3 className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-line pb-1">
                  <span className="inscription text-lg font-bold">{road.name}</span>
                  <span className="font-type text-[13px] text-ink/70">{road.aim}</span>
                  <span className="ml-auto font-display text-sm text-lav">{list.filter(x => x.u).length}/{list.length}</span>
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(whole[road.key] ? list : [...list.filter(x => x.u), ...list.filter(x => !x.u).slice(0, NEXT_SHOWN)]).map(({ a, u, pr, share }) => (
                    <div key={a.key} className={cx('flex items-center gap-3 p-3', u ? 'mac-window bg-gradient-to-r from-pink/70 via-white to-mint/60' : 'mac-inset bg-white/80')}>
                      <Glyph name={a.icon} size={32} stroke={1.4} className={cx('shrink-0', !u && 'text-ink/45')} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{a.name}</div>
                        <div className="text-[11px] text-ink/60">{a.description} · +{a.xp} XP</div>
                        {u ? <div className="text-[10px] text-gold">Unlocked {new Date(u.unlockedAt).toLocaleDateString()}</div>
                          : pr && pr.need > 1 && (<>
                            <Bar value={share} height="h-2" className="mt-1.5" />
                            <div className="mt-0.5 text-[11px] text-ink/70">{Math.min(pr.have, pr.need)} of {pr.need} {pr.unit}</div>
                          </>)}
                      </div>
                    </div>
                  ))}
                </div>
                {list.filter(x => !x.u).length > NEXT_SHOWN && (
                  <button onClick={() => setWhole({ ...whole, [road.key]: !whole[road.key] })} aria-expanded={!!whole[road.key]} className="mt-1 flex min-h-[40px] items-center font-display text-[13px] text-lav hover:text-xp">{whole[road.key] ? 'Show the next three' : `Show all ${list.length}`}</button>
                )}
              </section>
            );
          })}
        </div>
      </Card>

      {open && <RewardForm onClose={() => setOpen(false)} />}
    </div>
  );
}

function RewardForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('gift'); const [cost, setCost] = useState('100');
  const [promise, setPromise] = useState(false);
  const [unlockKey, setUnlockKey] = useState('rainmaker');
  const groups = [...new Set(MILESTONES.map(m => m.group))];
  const save = async () => {
    if (!title.trim()) return;
    await db.rewards.add({ id: uid(), title: title.trim(), icon, archived: false, ...(promise ? { cost: 0, unlockKey } : { cost: Number(cost) || 100 }) });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New reward">
      <div className="flex flex-col gap-3">
        <Label text="Reward"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Movie night" /></Label>
        <Label text="Icon"><IconPicker value={icon} onChange={setIcon} /></Label>
        <div className="mac-inset grid w-fit grid-cols-2 bg-white p-0.5" role="radiogroup" aria-label="How it is earned">
          {[false, true].map(m => (
            <button key={String(m)} type="button" role="radio" aria-checked={promise === m} onClick={() => setPromise(m)}
              className={cx('min-h-[40px] px-3 font-display text-sm', promise === m ? 'mac-btn bg-xp/20' : 'text-ink/60')}>{m ? 'For a milestone' : 'For drachmae'}</button>
          ))}
        </div>
        {promise
          ? <Label text="It opens when you reach"><Select value={unlockKey} onChange={e => setUnlockKey(e.target.value)}>{groups.map(g => <optgroup key={g} label={g}>{MILESTONES.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.name}</option>)}</optgroup>)}</Select></Label>
          : <Label text="Cost in drachmae (≈ 1 per 5 XP; a realistic week earns ~330–390)"><Input inputMode="numeric" value={cost} onChange={e => setCost(e.target.value)} /></Label>}
        <Button onClick={save}>Add</Button>
      </div>
    </Modal>
  );
}
