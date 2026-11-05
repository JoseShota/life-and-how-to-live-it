import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Plus, Check, AlertTriangle } from 'lucide-react';
import { db } from '@/db/db';
import type { Habit, HabitLog } from '@/db/types';
import { setHabit, habitStreak } from '@/game/engine';
import { usePlayer, useToday, useNow } from '@/lib/hooks';
import { IDEAL_DAY, currentBlockIndex } from '@/lib/routine';
import { cardStatus } from '@/finance/finance';
import { cx, hm, mxn } from '@/lib/util';
import { Card, Ring, Button, Bar, Empty } from '@/components/ui';
import { TaskRow, TaskForm } from '@/components/TaskBits';

function greeting(h: number) {
  if (h < 6) return 'The world sleeps. You rise.';
  if (h < 12) return 'Good morning, strategist.';
  if (h < 18) return 'Afternoon push — stay in the zone.';
  return 'Evening. Close loops, then rest.';
}

function HabitRow({ habit, log, today }: { habit: Habit; log?: HabitLog; today: string }) {
  const streak = useLiveQuery(() => habitStreak(habit.id, today), [habit.id, today, log?.done], 0);
  const done = !!log?.done;
  return (
    <div className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 transition', done ? 'bg-ok/10' : 'bg-panel2/60')}>
      <span className="text-xl">{habit.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{habit.name}</div>
        <div className="text-[11px] text-slate-500">{streak > 0 ? `🔥 ${streak}-day streak` : 'Start a streak today'} · +{habit.xp} XP</div>
      </div>
      {habit.kind === 'check' && (
        <button onClick={() => setHabit(habit, today, done ? 0 : 1)} aria-label={habit.name} className={cx('flex h-9 w-9 items-center justify-center rounded-xl border-2 transition active:scale-90', done ? 'border-ok bg-ok text-bg' : 'border-slate-600 hover:border-ok')}>
          {done && <Check size={18} strokeWidth={3} />}
        </button>
      )}
      {habit.kind === 'number' && (
        <div className="flex items-center gap-1">
          {[6, 7, 7.5, 8].map(v => (
            <button key={v} onClick={() => setHabit(habit, today, v)} className={cx('h-9 min-w-[2.4rem] rounded-lg px-1.5 text-xs font-semibold', log?.value === v ? (v >= (habit.target ?? 0) ? 'bg-ok text-bg' : 'bg-hp/70') : 'bg-panel text-slate-400 hover:bg-line')}>{v}h</button>
          ))}
        </div>
      )}
      {habit.kind === 'auto' && (
        <Link to="/focus" className={cx('rounded-lg px-2 py-1 text-xs font-semibold', done ? 'bg-ok text-bg' : 'bg-panel text-slate-300')}>{(log?.value ?? 0).toFixed(1)}/{habit.target}h</Link>
      )}
    </div>
  );
}

export default function Today() {
  const today = useToday();
  const now = useNow(60_000);
  const player = usePlayer();
  const [adding, setAdding] = useState(false);
  const habits = useLiveQuery(() => db.habits.orderBy('order').filter(h => !h.archived).toArray(), [], []);
  const logs = useLiveQuery(() => db.habitLogs.where('date').equals(today).toArray(), [today], []);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const tasks = useLiveQuery(async () => {
    const open = await db.tasks.where('status').notEqual('done').toArray();
    const doneToday = (await db.tasks.where('status').equals('done').toArray()).filter(t => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString());
    const focus = open.filter(t => t.priority === 1 || (t.dueDate && t.dueDate <= today)).sort((a, b) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z') || b.difficulty - a.difficulty);
    return [...focus, ...doneToday];
  }, [today], []);
  const minutes = useLiveQuery(async () => (await db.sessions.where('date').equals(today).toArray()).reduce((s, x) => s + x.minutes, 0), [today], 0);
  const target = (useLiveQuery(() => db.settings.get('workTargetHours'))?.value as number) ?? 8;
  const alerts = useLiveQuery(async () => {
    const accs = await db.accounts.filter(a => a.type === 'credit' && !a.archived).toArray();
    const txs = await db.transactions.toArray();
    return accs.map(a => cardStatus(a, txs)).filter(c => c.daysToDue !== undefined && c.daysToDue <= 5 && c.debt > 0);
  }, [], []);
  const xpLog = useLiveQuery(() => db.xp.where('date').equals(today).reverse().sortBy('ts'), [today], []);

  const coreDone = habits.filter(h => h.core && logs.find(l => l.habitId === h.id)?.done).length;
  const coreTotal = habits.filter(h => h.core).length;
  const cur = currentBlockIndex(new Date(now));
  const areaOf = (id: string) => areas.find(a => a.id === id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-slate-400">{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{greeting(new Date(now).getHours())}</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={coreTotal ? coreDone / coreTotal : 0} size={84} color="#22c55e"><span className="font-display text-xl font-bold">{coreDone}/{coreTotal}</span></Ring>
          <span className="text-[11px] text-slate-400">Routine</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={minutes / (target * 60)} size={84} color="#8b5cf6"><span className="font-display text-base font-bold">{hm(minutes)}</span></Ring>
          <span className="text-[11px] text-slate-400">Deep work / {target}h</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={Math.min(1, player.todayXp / 300)} size={84} color="#f5b83d"><span className="font-display text-xl font-bold">{player.todayXp}</span></Ring>
          <span className="text-[11px] text-slate-400">XP today</span>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-hp/50 bg-hp/10">
          {alerts.map(a => (
            <div key={a.account.id} className="flex items-center gap-2 text-sm"><AlertTriangle size={16} className="text-hp" />
              <b>{a.account.name}</b>: pay {mxn(a.debt)} {a.daysToDue === 0 ? 'TODAY' : `in ${a.daysToDue} days`} → <Link to="/money" className="underline">Money</Link>
            </div>
          ))}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="⚔️ Today's quests" action={<Button variant="ghost" className="!min-h-[34px] !px-3" onClick={() => setAdding(true)}><Plus size={16} />Add</Button>}>
          <div className="flex flex-col gap-2">
            {tasks.length === 0 ? <Empty>No quests marked for today. Add your top 3 — the ones that move money or mastery.</Empty> : tasks.map(t => <TaskRow key={t.id} task={t} area={areaOf(t.areaId)} />)}
          </div>
          <TaskForm open={adding} onClose={() => setAdding(false)} defaultPriority={1} />
        </Card>

        <Card title="🛡️ Daily routine" action={<span className="text-xs text-slate-400">All core = 🌟 +100 XP</span>}>
          <div className="flex flex-col gap-2">
            {habits.map(h => <HabitRow key={h.id} habit={h} log={logs.find(l => l.habitId === h.id)} today={today} />)}
          </div>
        </Card>

        <Card title="🗺️ Ideal day">
          <ol className="flex flex-col">
            {IDEAL_DAY.map((b, i) => (
              <li key={b.start} className={cx('flex gap-3 rounded-lg px-2 py-1.5 text-sm', i === cur ? 'bg-xp/20 font-semibold text-white ring-1 ring-xp' : i < cur ? 'text-slate-500' : 'text-slate-300')}>
                <span className="w-12 shrink-0 tabular-nums text-slate-500">{b.start}</span><span>{b.emoji}</span><span>{b.title}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="📜 Today's log">
          {xpLog.length === 0 ? <Empty>Nothing yet. Every action you complete lands here.</Empty> : (
            <ul className="flex flex-col gap-1.5">
              {xpLog.slice(0, 14).map(e => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-300">{e.label}</span>
                  <span className={cx('shrink-0 font-semibold', e.coins < 0 ? 'text-gold' : 'text-xp')}>{e.xp > 0 ? `+${e.xp} XP` : `${e.coins} 🪙`}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3"><Bar value={player.progress} /><p className="mt-1 text-xs text-slate-500">{player.needed - player.into} XP to level {player.level + 1}</p></div>
        </Card>
      </div>
    </div>
  );
}
