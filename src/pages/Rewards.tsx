import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { IconPicker } from '@/components/IconPicker';
import { db } from '@/db/db';
import { redeem, undoRedeem } from '@/game/engine';
import { ACHIEVEMENTS, achievementProgress, type Progress } from '@/game/achievements';
import { usePlayer } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cx, uid } from '@/lib/util';
import { Bar, Button, Card, Input, Label, Modal, PageTitle } from '@/components/ui';

export default function Rewards() {
  const p = usePlayer();
  const toast = useToast();
  const rewards = useLiveQuery(() => db.rewards.filter(r => !r.archived).sortBy('cost'), [], []);
  const unlocked = useLiveQuery(() => db.unlocked.toArray(), [], []);
  // Recounted whenever a laurel is won or lost; opening the page counts afresh.
  const progress = useLiveQuery(() => achievementProgress(), [unlocked.length], {} as Record<string, Progress>);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('gift'); const [cost, setCost] = useState('100');
  // The last purchase can be undone for 30 seconds (a stray tap shouldn't cost a coffee).
  const [lastBuy, setLastBuy] = useState<{ refId: string; title: string } | null>(null);
  const buy = async (id: string, t: string, c: number) => {
    if (!confirm(`Spend ${c} dr on "${t}"?`)) return;
    const refId = await redeem(id);
    if (!refId) return;
    toast(`Enjoy: ${t}`, 'gold');
    setLastBuy({ refId, title: t });
    setTimeout(() => setLastBuy(b => (b?.refId === refId ? null : b)), 30_000);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="市場" plain="rewards" sub="pay in drachmae first, then enjoy it." right={<Button variant="ghost" onClick={() => setOpen(true)}><Glyph name="plus" size={16}/>Reward</Button>}>The Agora</PageTitle>
      {lastBuy && (
        <div role="status" className="mac-window flex items-center justify-between gap-2 bg-laurel/40 px-3 py-2 text-sm">
          <span>Bought: {lastBuy.title}</span>
          <Button variant="ghost" onClick={async () => { await undoRedeem(lastBuy.refId); setLastBuy(null); toast('Purchase undone', 'bad'); }}>Undo</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rewards.map(r => {
          const can = p.coins >= r.cost;
          return (
            <div key={r.id} className={cx('mac-window relative flex flex-col items-center gap-2 bg-white/90 p-4 text-center', can ? 'shadow-glow' : '')}>
              {/* Always visible (touch screens have no hover). Soft delete keeps old ledger rows meaningful. */}
              <button onClick={() => { if (confirm('Remove this reward?')) db.rewards.update(r.id, { archived: true }); }} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-ink/35 hover:text-hp focus-visible:text-hp" aria-label="Remove reward"><Glyph name="trash" size={16}/></button>
              <Glyph name={r.icon} size={44} stroke={1.3} className="text-cyan" />
              <div className="font-display text-xl leading-5">{r.title}</div>
              <Button variant={can ? 'gold' : 'ghost'} disabled={!can} className="w-full disabled:opacity-100" onClick={() => buy(r.id, r.title, r.cost)}>{!can && <Glyph name="lock" size={15} />}{r.cost} dr</Button>
            </div>
          );
        })}
      </div>

      <Card id="Hall of Laurels" title={`Hall of Laurels (${unlocked.length}/${ACHIEVEMENTS.length})`}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* Won first (newest on top), then the rest by how close they are: the next laurel is always in sight. */}
          {ACHIEVEMENTS.map(a => {
            const u = unlocked.find(x => x.key === a.key);
            const p = progress[a.key];
            return { a, u, p, share: p ? Math.min(1, p.have / p.need) : 0 };
          }).sort((x, y) => Number(!!y.u) - Number(!!x.u) || (y.u?.unlockedAt ?? 0) - (x.u?.unlockedAt ?? 0) || y.share - x.share).map(({ a, u, p, share }) => (
            <div key={a.key} className={cx('flex items-center gap-3 p-3', u ? 'mac-window bg-gradient-to-r from-pink/70 via-white to-mint/60' : 'mac-inset bg-white/80')}>
              <Glyph name={a.icon} size={32} stroke={1.4} className={cx('shrink-0', !u && 'text-ink/45')} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{a.name}</div>
                <div className="text-[11px] text-ink/60">{a.description} · +{a.xp} XP</div>
                {u ? <div className="text-[10px] text-gold">Unlocked {new Date(u.unlockedAt).toLocaleDateString()}</div>
                  : p && p.need > 1 && (<>
                    <Bar value={share} height="h-2" className="mt-1.5" />
                    <div className="mt-0.5 text-[11px] text-ink/70">{Math.min(p.have, p.need)} of {p.need} {p.unit}</div>
                  </>)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New reward">
        <div className="flex flex-col gap-3">
          <Label text="Reward"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Movie night" /></Label>
          <Label text="Icon"><IconPicker value={icon} onChange={setIcon} /></Label>
          <Label text="Cost in drachmae (≈ 1 per 5 XP; a realistic week earns ~330–390)"><Input inputMode="numeric" value={cost} onChange={e => setCost(e.target.value)} /></Label>
          <Button onClick={async () => { if (!title.trim()) return; await db.rewards.add({ id: uid(), title: title.trim(), icon, cost: Number(cost) || 100, archived: false }); setTitle(''); setOpen(false); }}>Add</Button>
        </div>
      </Modal>
    </div>
  );
}
