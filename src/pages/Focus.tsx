import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Square, Trash2, Plus } from 'lucide-react';
import { db } from '@/db/db';
import { logSession, deleteSession } from '@/game/engine';
import { sessionXp } from '@/game/rules';
import { useNow, useToday } from '@/lib/hooks';
import { hm } from '@/lib/util';
import { Button, Card, Ring, Select, Label, Input, Modal, Empty } from '@/components/ui';

export interface ActiveTimer { areaId: string; taskId?: string; start: number }

export default function Focus() {
  const today = useToday();
  const now = useNow();
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const active = useLiveQuery(() => db.settings.get('activeTimer'))?.value as ActiveTimer | undefined;
  const [areaId, setAreaId] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');
  const [manual, setManual] = useState(false);
  const selArea = active?.areaId ?? areaId ?? areas[0]?.id;
  const tasks = useLiveQuery(() => (selArea ? db.tasks.where('areaId').equals(selArea).filter(t => t.status !== 'done').toArray() : []), [selArea], []);
  const sessions = useLiveQuery(() => db.sessions.where('date').equals(today).reverse().sortBy('start'), [today], []);
  const target = (useLiveQuery(() => db.settings.get('workTargetHours'))?.value as number) ?? 8;
  const total = sessions.reduce((s, x) => s + x.minutes, 0);
  const elapsed = active ? Math.floor((now - active.start) / 1000) : 0;
  const block = 50 * 60; // 50-min sprint

  const start = async () => {
    const a = areaId || areas[0]?.id;
    if (!a) return;
    await db.settings.put({ key: 'activeTimer', value: { areaId: a, taskId: taskId || undefined, start: Date.now() } });
  };
  const stop = async () => {
    if (!active) return;
    await db.settings.delete('activeTimer');
    await logSession(active.areaId, active.start, Date.now(), active.taskId);
  };
  const area = areas.find(a => a.id === selArea);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'), ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Focus</h1>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="flex flex-col items-center gap-5 py-8">
          <Ring value={active ? (elapsed % block) / block : 0} size={220} stroke={14} color={area?.color ?? '#8b5cf6'}>
            <div className="font-display text-5xl font-bold tabular-nums">{mm}:{ss}</div>
            <div className="mt-1 text-sm text-slate-400">{active ? `${area?.emoji} ${area?.short} · +${sessionXp(Math.floor(elapsed / 60))} XP` : '50-min sprints · 20 XP/h'}</div>
          </Ring>
          {!active ? (
            <div className="grid w-full max-w-sm gap-3">
              <Select value={areaId || areas[0]?.id || ''} onChange={e => { setAreaId(e.target.value); setTaskId(''); }}>
                {areas.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
              </Select>
              <Select value={taskId} onChange={e => setTaskId(e.target.value)}>
                <option value="">— no specific quest —</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
              <Button onClick={start} className="h-14 text-base"><Play size={20} />Start focus</Button>
            </div>
          ) : (
            <Button variant="danger" onClick={stop} className="h-14 w-full max-w-sm text-base"><Square size={18} />Stop & claim XP</Button>
          )}
        </Card>

        <Card title={`Today: ${hm(total)} / ${target}h`} action={<Button variant="ghost" className="!min-h-[34px] !px-3" onClick={() => setManual(true)}><Plus size={16} />Log time</Button>}>
          <div className="flex flex-col gap-2">
            {sessions.length === 0 ? <Empty>No focus logged yet. The first sprint is the hardest — start a 50-minute one.</Empty> :
              sessions.map(s => {
                const a = areas.find(x => x.id === s.areaId);
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl bg-panel2/60 px-3 py-2 text-sm">
                    <span className="text-lg">{a?.emoji}</span>
                    <div className="flex-1"><div className="font-medium">{a?.short} · {hm(s.minutes)}</div>
                      <div className="text-[11px] text-slate-500">{new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>
                    <button onClick={() => deleteSession(s.id)} className="p-2 text-slate-500 hover:text-hp" aria-label="Delete session"><Trash2 size={15} /></button>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>
      <ManualSession open={manual} onClose={() => setManual(false)} />
    </div>
  );
}

function ManualSession({ open, onClose }: { open: boolean; onClose: () => void }) {
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const [areaId, setAreaId] = useState('');
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('11:00');
  const save = async () => {
    const d = new Date();
    const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), fh, fm).getTime();
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), th, tm).getTime();
    if (e <= s) return;
    await logSession(areaId || areas[0].id, s, e);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Log time manually (today)">
      <div className="flex flex-col gap-3">
        <Label text="Area"><Select value={areaId || areas[0]?.id || ''} onChange={e => setAreaId(e.target.value)}>{areas.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}</Select></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="From"><Input type="time" value={from} onChange={e => setFrom(e.target.value)} /></Label>
          <Label text="To"><Input type="time" value={to} onChange={e => setTo(e.target.value)} /></Label>
        </div>
        <Button onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
