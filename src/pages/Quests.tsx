import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { db } from '@/db/db';
import { Button, Card, Empty, Bar } from '@/components/ui';
import { TaskRow, TaskForm } from '@/components/TaskBits';
import { cx, dateKey } from '@/lib/util';
import { startOfWeek } from 'date-fns';

export default function Quests() {
  const [areaId, setAreaId] = useState<string | 'all'>('all');
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const weekStart = dateKey(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekMinutes = useLiveQuery(async () => {
    const m = new Map<string, number>();
    (await db.sessions.where('date').aboveOrEqual(weekStart).toArray()).forEach(s => m.set(s.areaId, (m.get(s.areaId) ?? 0) + s.minutes));
    return m;
  }, [weekStart], new Map());

  const visible = tasks
    .filter(t => (areaId === 'all' || t.areaId === areaId) && (showDone ? true : t.status !== 'done'))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.priority - b.priority || (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z'));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Quest log</h1>
        <Button onClick={() => setAdding(true)}><Plus size={16} />New quest</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {areas.map(a => {
          const open = tasks.filter(t => t.areaId === a.id && t.status !== 'done').length;
          const hrs = (weekMinutes.get(a.id) ?? 0) / 60;
          return (
            <button key={a.id} onClick={() => setAreaId(areaId === a.id ? 'all' : a.id)} className={cx('rounded-2xl border bg-panel p-3 text-left transition', areaId === a.id ? 'border-xp shadow-glow' : 'border-line hover:border-slate-500')}>
              <div className="text-2xl">{a.emoji}</div>
              <div className="mt-1 truncate text-sm font-semibold">{a.short}</div>
              <div className="text-[11px] text-slate-400">{open} open · {hrs.toFixed(1)}/{a.weeklyHoursTarget}h wk</div>
              <Bar value={hrs / (a.weeklyHoursTarget || 1)} color={a.color} className="mt-2" height="h-1.5" />
            </button>
          );
        })}
      </div>

      <Card title={areaId === 'all' ? 'All quests' : areas.find(a => a.id === areaId)?.name} action={
        <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label>
      }>
        <div className="flex flex-col gap-2">
          {visible.length === 0 ? <Empty>No quests here. Break the next big outcome into a quest you can finish in one sitting.</Empty> :
            visible.map(t => <TaskRow key={t.id} task={t} area={areas.find(a => a.id === t.areaId)} compact={areaId !== 'all'} />)}
        </div>
      </Card>
      <TaskForm open={adding} onClose={() => setAdding(false)} defaultAreaId={areaId === 'all' ? undefined : areaId} />
    </div>
  );
}
