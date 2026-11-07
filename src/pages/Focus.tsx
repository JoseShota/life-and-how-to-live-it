import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { db } from '@/db/db';
import { logSession, deleteSession, SessionOverlapError } from '@/game/engine';
import { sessionXp, STILL_WORKING_MINUTES, MAX_SESSION_MINUTES } from '@/game/rules';
import { useToast } from '@/lib/toast';
import { useNow, useToday, useWorkTargets } from '@/lib/hooks';
import { hm } from '@/lib/util';
import { Button, Card, Ring, Select, Label, Input, Modal, Empty, PageTitle } from '@/components/ui';

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
  const { today: targets } = useWorkTargets(today);
  const total = sessions.reduce((s, x) => s + x.minutes, 0);
  const elapsed = active ? Math.floor((now - active.start) / 1000) : 0;
  const block = 50 * 60; // 50-min sprint

  const start = async () => {
    const a = areaId || areas[0]?.id;
    if (!a) return;
    await db.settings.put({ key: 'activeTimer', value: { areaId: a, taskId: taskId || undefined, start: Date.now() } });
  };
  const toast = useToast();
  const [stoppedAt, setStoppedAt] = useState('');
  const stop = async (end = Date.now()) => {
    if (!active) return;
    try {
      await logSession(active.areaId, active.start, end, active.taskId);
      await db.settings.delete('activeTimer');
    } catch (e) {
      if (!(e instanceof SessionOverlapError)) throw e;
      toast(e.message, 'bad');
      await db.settings.delete('activeTimer');
    }
  };
  /** "I actually stopped at HH:MM": for a timer left running. */
  const stopAt = async () => {
    if (!active || !stoppedAt) return;
    const [h, m] = stoppedAt.split(':').map(Number);
    const d = new Date(active.start); d.setHours(h, m, 0, 0);
    if (d.getTime() <= active.start) d.setDate(d.getDate() + 1);
    await stop(Math.min(Date.now(), d.getTime()));
    setStoppedAt('');
  };
  const longRun = active && elapsed / 60 >= STILL_WORKING_MINUTES;
  const area = areas.find(a => a.id === selArea);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'), ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="集中" plain="timer" sub="fifty-minute sprints. the mind like a jazz solo, held.">Focus</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Focus Timer" className="[&>div:last-child]:flex [&>div:last-child]:flex-col [&>div:last-child]:items-center [&>div:last-child]:gap-5 [&>div:last-child]:py-8">
          <Ring value={active ? (elapsed % block) / block : 0} size={250} stroke={14} color={area?.color ?? '#e3b9b2'}>
            <div className="text-xp font-display text-6xl leading-none tabular-nums">{mm}:{ss}</div>
            <div className="mt-1 max-w-[150px] text-xs text-ink/80">{active ? `${area?.short} · +${sessionXp(Math.floor(elapsed / 60))} XP` : `50-min sprints · 20 XP/h up to ${targets.full} h`}</div>
          </Ring>
          {!active ? (
            <div className="grid w-full max-w-sm gap-3">
              <Select value={areaId || areas[0]?.id || ''} onChange={e => { setAreaId(e.target.value); setTaskId(''); }}>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <Select value={taskId} onChange={e => setTaskId(e.target.value)}>
                <option value="">— no specific quest —</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
              <Button onClick={start} className="h-14 text-base"><Glyph name="play" size={20}/>Start focus</Button>
            </div>
          ) : (
            <div className="grid w-full max-w-sm gap-3">
              {longRun && (
                <div role="status" className="mac-inset bg-laurel/40 p-3 text-sm">
                  <p className="font-display">Still working?</p>
                  <p className="mt-1 text-ink/70">This timer has run for {hm(elapsed / 60)}. If you stopped earlier, log the real end time. Sessions count {MAX_SESSION_MINUTES / 60} h at most.</p>
                  <div className="mt-2 flex gap-2">
                    <Input type="time" aria-label="I stopped at" value={stoppedAt} onChange={e => setStoppedAt(e.target.value)} />
                    <Button variant="ghost" onClick={stopAt} disabled={!stoppedAt}>Stop at this time</Button>
                  </div>
                </div>
              )}
              <Button variant="danger" onClick={() => stop()} className="h-14 w-full text-base"><Glyph name="stop" size={18}/>Stop & claim XP</Button>
            </div>
          )}
        </Card>

        <Card title={`Sessions · ${hm(total)} · ${targets.done}h done · ${targets.full}h full`} action={<Button variant="ghost" className="!px-3" onClick={() => setManual(true)}><Glyph name="plus" size={16}/>Log time</Button>}>
          <div className="flex flex-col gap-2">
            {sessions.length === 0 ? <Empty>No focus logged yet. The first sprint is the hardest — start a 50-minute one.</Empty> :
              sessions.map(s => {
                const a = areas.find(x => x.id === s.areaId);
                return (
                  <div key={s.id} className="flex items-center gap-3 bg-panel2/60 px-3 py-2 text-sm">
                    <Glyph name={a?.icon ?? 'dot'} size={20} />
                    <div className="flex-1"><div className="font-medium">{a?.short} · {hm(s.minutes)}</div>
                      <div className="text-[11px] text-ink/55">{new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>
                    <button onClick={() => { if (confirm('Delete this session?')) deleteSession(s.id); }} className="flex h-10 w-10 items-center justify-center text-ink/55 hover:text-hp" aria-label="Delete session"><Glyph name="trash" size={15}/></button>
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
  const [err, setErr] = useState('');
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const [areaId, setAreaId] = useState('');
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('11:00');
  const save = async () => {
    const d = new Date();
    const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), fh, fm).getTime();
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), th, tm).getTime();
    if (e <= s) { setErr('"To" must be after "From".'); return; }
    try {
      await logSession(areaId || areas[0].id, s, e);
    } catch (x) {
      if (x instanceof SessionOverlapError) { setErr(x.message); return; }
      throw x;
    }
    setErr('');
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Log time manually (today)">
      <div className="flex flex-col gap-3">
        <Label text="Area"><Select value={areaId || areas[0]?.id || ''} onChange={e => setAreaId(e.target.value)}>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="From"><Input type="time" value={from} onChange={e => setFrom(e.target.value)} /></Label>
          <Label text="To"><Input type="time" value={to} onChange={e => setTo(e.target.value)} /></Label>
        </div>
        {err && <p role="alert" className="font-type text-sm text-hp">{err}</p>}
        <Button onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
