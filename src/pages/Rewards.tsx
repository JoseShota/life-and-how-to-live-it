import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { redeem } from '@/game/engine';
import { ACHIEVEMENTS } from '@/game/achievements';
import { usePlayer } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cx, uid } from '@/lib/util';
import { Button, Card, Input, Label, Modal, PageTitle } from '@/components/ui';

export default function Rewards() {
  const p = usePlayer();
  const toast = useToast();
  const rewards = useLiveQuery(() => db.rewards.filter(r => !r.archived).sortBy('cost'), [], []);
  const unlocked = useLiveQuery(() => db.unlocked.toArray(), [], []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(''); const [emoji, setEmoji] = useState('🎁'); const [cost, setCost] = useState('100');

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="SHOP.HTM · spend your coins guilt-free · ¢ accepted here" right={<Button variant="ghost" onClick={() => setOpen(true)}><Plus size={16} />Reward</Button>}>Reward Mall</PageTitle>
      <p className="-mt-2 text-sm text-slate-400">Spend coins guilt-free. Rule: you only enjoy the treat <b>after</b> paying for it here — that's what makes the loop work.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rewards.map(r => {
          const can = p.coins >= r.cost;
          return (
            <div key={r.id} className={cx('bevel-out group relative flex flex-col items-center gap-2 bg-panel/95 p-4 text-center', can ? 'shadow-[0_0_14px_-4px_#fffb96]' : 'opacity-60')}>
              <button onClick={() => db.rewards.update(r.id, { archived: true })} className="absolute right-2 top-2 hidden p-1 text-slate-600 hover:text-hp group-hover:block" aria-label="Remove reward"><Trash2 size={14} /></button>
              <div className="text-4xl">{r.emoji}</div>
              <div className="font-display text-xl leading-5">{r.title}</div>
              <Button variant="gold" disabled={!can} className="w-full" onClick={async () => { if (await redeem(r.id)) toast(`Enjoy: ${r.title} ${r.emoji}`, 'gold'); }}>¢{r.cost}</Button>
            </div>
          );
        })}
      </div>

      <Card title={`★ TROPHY_ROOM (${unlocked.length}/${ACHIEVEMENTS.length})`}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map(a => {
            const u = unlocked.find(x => x.key === a.key);
            return (
              <div key={a.key} className={cx('flex items-center gap-3 p-3', u ? 'bevel-out bg-gradient-to-r from-xp/30 via-lav/20 to-cyan/20' : 'bevel-in bg-[#0d0420] opacity-50 grayscale')}>
                <span className="text-3xl">{a.emoji}</span>
                <div><div className="text-sm font-semibold">{a.name}</div><div className="text-[11px] text-slate-400">{a.description} · +{a.xp} XP</div>{u && <div className="text-[10px] text-gold">Unlocked {new Date(u.unlockedAt).toLocaleDateString()}</div>}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New reward">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <Label text="Emoji"><Input value={emoji} onChange={e => setEmoji(e.target.value)} /></Label>
            <Label text="Reward"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Movie night" /></Label>
          </div>
          <Label text="Cost in coins (≈ 1 coin per 5 XP; a solid day earns ~80)"><Input inputMode="numeric" value={cost} onChange={e => setCost(e.target.value)} /></Label>
          <Button onClick={async () => { if (!title.trim()) return; await db.rewards.add({ id: uid(), title: title.trim(), emoji, cost: Number(cost) || 100, archived: false }); setTitle(''); setOpen(false); }}>Add</Button>
        </div>
      </Modal>
    </div>
  );
}
