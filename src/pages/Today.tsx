import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Plus, Check, AlertTriangle } from 'lucide-react';
import { db } from '@/db/db';
import type { Habit, HabitLog } from '@/db/types';
import { setHabit, habitStreak } from '@/game/engine';
import { usePlayer, useToday, useNow } from '@/lib/hooks';
import { IDEAL_DAY, currentBlockIndex } from '@/lib/routine';
import { cutUp } from '@/lib/cutup';
import { cardStatus } from '@/finance/finance';
import { cx, hm, mxn } from '@/lib/util';
import { Card, Ring, Button, Bar, Empty, PageTitle } from '@/components/ui';
import { TaskRow, TaskForm } from '@/components/TaskBits';

function greeting(h: number) {
  if (h < 6) return 'the world still dreams. you rise.';
  if (h < 12) return 'morning light on marble. begin.';
  if (h < 18) return 'the afternoon hums. stay in it.';
  return 'evening. close the loops, then drift.';
}

function HabitRow({ habit, log, today }: { habit: Habit; log?: HabitLog; today: string }) {
  const streak = useLiveQuery(() => habitStreak(habit.id, today), [habit.id, today, log?.done], 0);
  const done = !!log?.done;
  return (
    <div className={cx('flex items-center gap-3 border px-3 py-2 transition', done ? 'border-ok/50 bg-ok/10' : 'border-line/50 bg-panel2/60')}>
      <span className="text-xl">{habit.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{habit.name}</div>
        <div className="text-[11px] text-ink/60">{streak > 0 ? `🔥 ${streak}-day streak` : 'Start a streak today'} · +{habit.xp} XP</div>
      </div>
      {habit.kind === 'check' && (
        <button onClick={() => setHabit(habit, today, done ? 0 : 1)} aria-label={habit.name} className={cx('flex h-10 w-10 items-center justify-center transition', done ? 'mac-inset bg-mint text-ink' : 'mac-inset bg-white hover:bg-mint/40')}>
          {done && <Check size={18} strokeWidth={3} />}
        </button>
      )}
      {habit.kind === 'number' && (
        <div className="flex items-center gap-1">
          {[6, 7, 7.5, 8].map(v => (
            <button key={v} onClick={() => setHabit(habit, today, v)} className={cx('h-10 min-w-[2.6rem] px-1.5 font-display text-lg', log?.value === v ? (v >= (habit.target ?? 0) ? 'mac-inset bg-mint' : 'mac-inset bg-hp text-white') : 'mac-btn bg-white')}>{v}h</button>
          ))}
        </div>
      )}
      {habit.kind === 'auto' && (
        <Link to="/focus" className={cx('mac-inset px-2 py-1 font-display text-lg', done ? 'bg-mint text-ink' : 'bg-white text-cyan')}>{(log?.value ?? 0).toFixed(1)}/{habit.target}h</Link>
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
      <PageTitle jp="今日" sub={`${new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase()} · ${greeting(new Date(now).getHours())}`}>Today</PageTitle>

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={coreTotal ? coreDone / coreTotal : 0} size={84} color="#05ffa1"><span className="font-display text-2xl leading-none text-ok">{coreDone}/{coreTotal}</span></Ring>
          <span className="text-[11px] text-ink/60">Routine</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={minutes / (target * 60)} size={84} color="#ff8fcf"><span className="font-display text-xl leading-none text-xp">{hm(minutes)}</span></Ring>
          <span className="text-[11px] text-ink/60">Deep work / {target}h</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={Math.min(1, player.todayXp / 300)} size={84} color="#7cc7ff"><span className="font-display text-2xl leading-none text-cyan">{player.todayXp}</span></Ring>
          <span className="text-[11px] text-ink/60">XP today</span>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card title="⚠ A Gentle Warning" className="bg-hp/10">
          {alerts.map(a => (
            <div key={a.account.id} className="flex items-center gap-2 text-sm"><AlertTriangle size={16} className="text-hp" />
              <b>{a.account.name}</b>: pay {mxn(a.debt)} {a.daysToDue === 0 ? 'TODAY' : `in ${a.daysToDue} days`} → <Link to="/money" className="underline">Money</Link>
            </div>
          ))}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Quests of the Day" action={<Button variant="ghost" className="!min-h-[34px] !px-3" onClick={() => setAdding(true)}><Plus size={16} />Add</Button>}>
          <div className="flex flex-col gap-2">
            {tasks.length === 0 ? <Empty>No quests marked for today. Add your top 3 — the ones that move money or mastery.</Empty> : tasks.map(t => <TaskRow key={t.id} task={t} area={areaOf(t.areaId)} />)}
          </div>
          <TaskForm open={adding} onClose={() => setAdding(false)} defaultPriority={1} />
        </Card>

        <Card title="The Routine" action={<span className="font-type text-sm">all core = ✿ perfect day +100 XP</span>}>
          <div className="flex flex-col gap-2">
            {habits.map(h => <HabitRow key={h.id} habit={h} log={logs.find(l => l.habitId === h.id)} today={today} />)}
          </div>
        </Card>

        <Card title="The Ideal Day">
          <ol className="flex flex-col">
            {IDEAL_DAY.map((b, i) => (
              <li key={b.start} className={cx('flex gap-3 px-2 py-1.5 text-sm', i === cur ? 'bg-ink font-bold text-white' : i < cur ? 'text-ink/45 line-through' : 'text-ink/90')}>
                <span className="w-12 shrink-0 font-display text-[14px] tabular-nums opacity-80">{b.start}</span><span>{b.emoji}</span><span>{b.title}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="The Scroll">
          <div className="scroll-paper mx-[18px] min-h-[180px] px-3 py-[6px] font-type text-[15px] leading-[28px]">
            {xpLog.length === 0 ? <p className="text-ink/60">the scroll is blank. type your day into it, one action at a time…</p> : (
              <ul>
                {xpLog.slice(0, 14).map(e => (
                  <li key={e.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {e.label.toLowerCase()}</span>
                    <span className={cx('shrink-0', e.coins < 0 ? 'text-gold' : 'text-xp')}>{e.xp > 0 ? `+${e.xp}` : `${e.coins}₯`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3"><Bar value={player.progress} /><p className="mt-1 text-xs text-ink/55">{player.needed - player.into} XP to level {player.level + 1}</p></div>
        </Card>

        <CutUpCard lines={[...tasks.map(t => t.title), ...habits.map(h => h.name), ...IDEAL_DAY.slice(4, 9).map(b => b.title)]} />
      </div>
    </div>
  );
}

function CutUpCard({ lines }: { lines: string[] }) {
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 864e5));
  const poem = cutUp(lines, seed);
  return (
    <Card title="Cut-Up · a poem from your day" className="lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <blockquote className="flex-1 border-l-4 border-xp bg-paper px-4 py-3 font-type text-lg leading-8">
          {poem.map((l, i) => <div key={i} style={{ paddingLeft: `${(i % 3) * 1.5}rem` }}>{l}</div>)}
        </blockquote>
        <div className="flex flex-col items-start gap-2 text-sm sm:w-56">
          <p className="text-ink/70">Slice today's words, shuffle the pieces, read what the day was really saying.</p>
          <Button variant="cyan" onClick={() => setSeed(s => s + 1)}>✂ cut again</Button>
        </div>
      </div>
    </Card>
  );
}
