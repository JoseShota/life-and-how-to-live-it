import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { db } from '@/db/db';
import { Button, Card, Empty, Bar, PageTitle } from '@/components/ui';
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
      <PageTitle jp="冒険" plain="tasks" sub="every pending thing, by area. go, go, go." right={<Button onClick={() => setAdding(true)}><Glyph name="plus" size={16}/>New quest</Button>}>Quest Log</PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {areas.map(a => {
          const open = tasks.filter(t => t.areaId === a.id && t.status !== 'done').length;
          const hrs = (weekMinutes.get(a.id) ?? 0) / 60;
          return (
            <button key={a.id} onClick={() => setAreaId(areaId === a.id ? 'all' : a.id)} className={cx('p-3 text-left transition', areaId === a.id ? 'mac-inset bg-white shadow-glow' : 'mac-window bg-white/90 hover:bg-panel2')}>
              <Glyph name={a.icon} size={30} stroke={1.4} />
              <div className="mt-1 flex items-center gap-1.5 truncate font-display text-lg leading-5"><span className="h-3 w-3 shrink-0 border-2 border-ink" style={{ background: a.color }} />{a.short}</div>
              <div className="text-[11px] text-ink/60">{open} open · {hrs.toFixed(1)}/{a.weeklyHoursTarget}h wk</div>
              <Bar value={hrs / (a.weeklyHoursTarget || 1)} color={a.color} className="mt-2" height="h-3" />
            </button>
          );
        })}
      </div>

      <Card title={areaId === 'all' ? 'All Quests' : `${areas.find(a => a.id === areaId)?.name}`} action={
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 px-1 text-xs text-ink/60"><input type="checkbox" className="h-5 w-5" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label>
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
