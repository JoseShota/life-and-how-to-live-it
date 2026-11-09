import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Glyph } from '@/components/Glyph';
import { db } from '@/db/db';
import type { Area, Habit, HabitLog, Task } from '@/db/types';
import { setHabit, habitStreak, weekStats, weekStartKey, shieldBank } from '@/game/engine';
import { PERFECT_DAY_XP, GOOD_DAY_XP, GOOD_DAY_MIN_CORE, WEEKLY_SCORECARD, type DayTargets } from '@/game/rules';
import { usePlayer, useToday, useNow, useWorkStart, useWorkTargets } from '@/lib/hooks';
import { idealDayFor, currentBlockIndex, toMin, type Block } from '@/lib/routine';
import { cutUp } from '@/lib/cutup';
import { cardAlerts } from '@/finance/finance';
import { cx, dateKey, hm, mxn, parseKey } from '@/lib/util';
import { Card, Ring, Button, Bar, Empty, PageTitle } from '@/components/ui';
import { TaskRow, TaskForm } from '@/components/TaskBits';
import { HabitEditor } from '@/components/HabitBits';
import { FreshStartBanner, SeasonBanner } from '@/components/SeasonBits';

function greeting(h: number) {
  if (h < 6) return 'the world still dreams. you rise.';
  if (h < 12) return 'morning light on marble. begin.';
  if (h < 18) return 'the afternoon hums. stay in it.';
  return 'evening. close the loops, then drift.';
}

function HabitRow({ habit, log, today, targets }: { habit: Habit; log?: HabitLog; today: string; targets: DayTargets }) {
  const streak = useLiveQuery(() => habitStreak(habit.id, today), [habit.id, today, log?.done, log?.min], 0);
  const [editing, setEditing] = useState(false);
  const done = !!log?.done && !log?.min;
  const min = !!log?.min;
  const minBtn = habit.minLabel && habit.kind !== 'auto' && (
    <button onClick={() => setHabit(habit, today, 0, !min)} aria-label={`${habit.name}: minimum version (${habit.minLabel})`} title={habit.minLabel}
      className={cx('h-10 min-w-[2.75rem] px-1.5 font-display text-[13px]', min ? 'mac-inset bg-laurel' : 'mac-btn bg-white')}>min</button>
  );
  return (
    <div className={cx('flex items-center gap-3 border px-3 py-2 transition', done ? 'border-ok/50 bg-ok/10' : min ? 'border-gold/50 bg-laurel/20' : 'border-line/50 bg-panel2/60')}>
      <Glyph name={habit.icon} size={24} stroke={1.5} className="shrink-0 text-cyan" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{habit.name}{min && <span className="text-gold"> · min: {habit.minLabel}</span>}</div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink/60">{streak > 0 ? <><Glyph name="flame" size={12} className="text-xp" />{streak}-day streak</> : 'Start a streak today'} · +{habit.xp} XP{habit.minLabel ? ` (min ${Math.round(habit.xp / 2)})` : ''}{habit.intrinsic ? ' · no dr (you already enjoy it)' : ''}</div>
        {habit.plan && <div className="truncate font-type text-[12px] text-ink/60" title={habit.plan}>{habit.plan}</div>}
      </div>
      <button onClick={() => setEditing(true)} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/45 hover:text-xp" aria-label={`Edit ${habit.name}`}><Glyph name="pencil" size={14} /></button>
      {habit.kind === 'check' && (<>
        {minBtn}
        <button onClick={() => setHabit(habit, today, done ? 0 : 1)} aria-label={habit.name} className={cx('flex h-10 w-10 items-center justify-center transition', done ? 'mac-inset bg-mint text-ink' : 'mac-inset bg-white hover:bg-mint/40')}>
          {done && <Glyph name="check" size={18} stroke={2.6}/>}
        </button>
      </>)}
      {habit.kind === 'number' && (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {minBtn}
          {[6, 7, 7.5, 8].map(v => (
            <button key={v} onClick={() => setHabit(habit, today, v)} className={cx('h-10 min-w-[2.6rem] px-1.5 font-display text-lg', log?.value === v && !min ? (v >= (habit.target ?? 0) ? 'mac-inset bg-mint' : 'mac-inset bg-hp text-white') : 'mac-btn bg-white')}>{v}h</button>
          ))}
        </div>
      )}
      {habit.kind === 'auto' && (
        <Link to="/focus" className={cx('mac-inset flex min-h-[40px] items-center px-2 font-display text-lg', done ? 'bg-mint text-ink' : min ? 'bg-laurel text-ink' : 'bg-white text-cyan')}>{(log?.value ?? 0).toFixed(1)}/{targets.done}h</Link>
      )}
      {editing && <HabitEditor habit={habit} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Which area each ideal-day work block is for (by the block's glyph); the money block takes the top quest anywhere. */
const BLOCK_AREA_ICON: Record<string, string> = { amphora: 'amphora', owl: 'owl', cog: 'cog' };
const XP_DAY_GUIDE = 250; // about a realistic good day (scripts/eval-sim.ts)

/**
 * The 5-second answer to "what should I do now?": the current block of the ideal day and one primary action.
 */
function NowCard({ now, habits, logs, tasks, areas, today, blocks, teaching }: { now: number; habits: Habit[]; logs: HabitLog[]; tasks: Task[]; areas: Area[]; today: string; blocks: Block[]; teaching: boolean }) {
  const nav = useNavigate();
  const active = useLiveQuery(() => db.settings.get('activeTimer'))?.value as { areaId: string; start: number } | undefined;
  const i = currentBlockIndex(new Date(now), blocks);
  const block = i >= 0 ? blocks[i] : undefined;
  // After the last block, "next" is tomorrow's first one (the same wake-up every day).
  const next = blocks[i + 1] ?? blocks[0];
  const habit = (key: string) => habits.find(h => h.key === key);
  const isDone = (h?: Habit) => !!h && !!logs.find(l => l.habitId === h.id && l.done);
  const open = tasks.filter(t => t.status !== 'done');
  const best = (areaId?: string) => open.filter(t => !areaId || t.areaId === areaId).sort((a, b) => a.priority - b.priority || b.difficulty - a.difficulty)[0];
  const startFocus = async (areaId: string, taskId?: string) => {
    await db.settings.put({ key: 'activeTimer', value: { areaId, taskId, start: Date.now() } });
    nav('/focus');
  };
  const HabitButtons = ({ h }: { h?: Habit }) => !h ? null : isDone(h)
    ? <span className="flex items-center gap-1 font-display text-ok"><Glyph name="check" size={16} />{h.name} done</span>
    : <div className="flex flex-wrap gap-2">
        <Button onClick={() => setHabit(h, today, h.kind === 'number' ? (h.target ?? 1) : 1)}><Glyph name="check" size={16} />{h.name}</Button>
        {h.minLabel && <Button variant="ghost" onClick={() => setHabit(h, today, 0, true)}>min: {h.minLabel}</Button>}
      </div>;

  let what: string, action: JSX.Element | null = null;
  if (!block) {
    what = 'Sleep. Lights out by 22:00, up at 5:45.';
  } else if (block.role === 'travel') {
    // On the road: nothing to tap. The hours count for the real MXN/h by themselves (Control → Teaching days).
    what = `${block.title}.`;
  } else if (block.role === 'classroom') {
    what = 'Set up the classroom: board, slides, attendance.';
  } else if (block.role === 'class') {
    what = `${block.title}. Teach; the timer stays off.`;
  } else if (block.role === 'pack') {
    what = 'Money check-in, then pack and go.';
    action = <div className="flex flex-wrap gap-2"><Link to="/money" className="mac-btn inline-flex min-h-[40px] items-center gap-2 bg-laurel px-4 font-display text-[15px]"><Glyph name="drachma" size={16} />Log money</Link><HabitButtons h={habit('money')} /></div>;
  } else if (block.kind === 'work') {
    const area = block.areaId ? areas.find(a => a.id === block.areaId) : BLOCK_AREA_ICON[block.icon] ? areas.find(a => a.icon === BLOCK_AREA_ICON[block.icon]) : undefined;
    const quest = best(area?.id) ?? best();
    what = block.title;
    action = active
      ? <Button onClick={() => nav('/focus')}><Glyph name="hourglass" size={16} />Focus running · {Math.floor((now - active.start) / 60000)} min</Button>
      : <Button onClick={() => startFocus(quest?.areaId ?? area?.id ?? areas[0]?.id, quest?.id)}><Glyph name="play" size={16} />Start focus{quest ? ` · ${quest.title}` : area ? ` · ${area.short}` : ''}</Button>;
  } else if (block.icon === 'discus') { what = 'Exercise'; action = <HabitButtons h={habit('exercise')} />; }
  else if (block.icon === 'sunrise') { what = block.title; action = <HabitButtons h={habit('wake')} />; }
  else if (block.icon === 'scroll') { what = `Intel: ${toMin(block.end) - toMin(block.start)} minutes, then close it.`; action = <HabitButtons h={habit('intel')} />; }
  else if (block.icon === 'wave') {
    what = 'Clean 15 minutes, then the money check-in.';
    action = <div className="flex flex-wrap gap-2"><Link to="/money" className="mac-btn inline-flex min-h-[40px] items-center gap-2 bg-laurel px-4 font-display text-[15px]"><Glyph name="drachma" size={16} />Log money</Link><HabitButtons h={habit('money')} /></div>;
  } else if (block.icon === 'lamp') {
    what = "Shutdown: pick tomorrow's top 3 quests.";
    action = <Link to="/quests" className="mac-btn inline-flex min-h-[40px] items-center gap-2 bg-pink px-4 font-display text-[15px]"><Glyph name="scroll" size={16} />Open quests</Link>;
  } else { what = block.title; }

  return (
    <Card title={`${block ? `Now · ${block.start}–${block.end}` : 'Now · night'}${teaching ? ' · teaching day' : ''}`} className="border-xp">
      <div className="flex flex-col gap-2">
        <p className="font-display text-xl leading-6">{what}</p>
        {action}
        <p className="text-[12px] text-ink/60">Next: {next.start} · {next.title}</p>
      </div>
    </Card>
  );
}

export default function Today() {
  const today = useToday();
  const now = useNow(60_000);
  const player = usePlayer();
  const [adding, setAdding] = useState(false);
  const habits = useLiveQuery(() => db.habits.orderBy('order').filter(h => !h.archived).toArray(), [], []);
  // The routine can be logged for yesterday too (you only know how you slept the morning after).
  const [onYesterday, setOnYesterday] = useState(false);
  const yesterday = (() => { const d = parseKey(today); d.setDate(d.getDate() - 1); return dateKey(d); })();
  const habitDay = onYesterday ? yesterday : today;
  const logs = useLiveQuery(() => db.habitLogs.where('date').equals(today).toArray(), [today], []);
  const dayLogs = useLiveQuery(() => db.habitLogs.where('date').equals(habitDay).toArray(), [habitDay], []);
  const shields = useLiveQuery(() => shieldBank(), [logs], 0);
  const { today: dayTargets } = useWorkTargets(habitDay);
  const areas = useLiveQuery(() => db.areas.toArray(), [], []);
  const tasks = useLiveQuery(async () => {
    const open = await db.tasks.where('status').notEqual('done').toArray();
    const doneToday = (await db.tasks.where('status').equals('done').toArray()).filter(t => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString());
    const focus = open.filter(t => t.priority === 1 || (t.dueDate && t.dueDate <= today)).sort((a, b) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z') || b.difficulty - a.difficulty);
    return [...focus, ...doneToday];
  }, [today], []);
  const minutes = useLiveQuery(async () => (await db.sessions.where('date').equals(today).toArray()).reduce((s, x) => s + x.minutes, 0), [today], 0);
  const { today: targets, teaching, schedule } = useWorkTargets(today);
  const place = areas.find(a => a.id === schedule?.areaId)?.short;
  const workStart = useWorkStart();
  const blocks = idealDayFor(today, schedule, place, workStart);
  const week = useLiveQuery(() => weekStats(weekStartKey(today)), [today, logs, minutes]);
  const alerts = useLiveQuery(async () => cardAlerts(await db.accounts.toArray(), await db.transactions.toArray(), await db.statements.toArray(), await db.installments.toArray(), today), [today], []);
  const xpLog = useLiveQuery(() => db.xp.where('date').equals(today).reverse().sortBy('ts'), [today], []);

  const coreDone = habits.filter(h => h.core && logs.find(l => l.habitId === h.id)?.done).length;
  const coreTotal = habits.filter(h => h.core).length;
  const cur = currentBlockIndex(new Date(now), blocks);
  const areaOf = (id: string) => areas.find(a => a.id === id);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="今日" plain="what to do now" sub={`${new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase()} · ${greeting(new Date(now).getHours())}`}>Today</PageTitle>

      <NowCard now={now} habits={habits} logs={logs} tasks={tasks} areas={areas} today={today} blocks={blocks} teaching={teaching} />

      <FreshStartBanner today={today} />

      <SeasonBanner today={today} />

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={coreTotal ? coreDone / coreTotal : 0} size={84} color="#2f7a5f"><span className="font-display text-2xl leading-none text-ok">{coreDone}/{coreTotal}</span></Ring>
          <span className="text-center text-[11px] text-ink/60">Core · {GOOD_DAY_MIN_CORE} good · {coreTotal} perfect</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={minutes / (targets.full * 60)} size={84} color="#cf9a95"><span className="font-display text-xl leading-none text-xp">{hm(minutes)}</span></Ring>
          <span className="text-center text-[11px] text-ink/60">Deep work · {targets.done}h done · {targets.full}h full{teaching ? ' · teaching day' : ''}</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 !p-3">
          <Ring value={Math.min(1, player.todayXp / XP_DAY_GUIDE)} size={84} color="#8fc3cf"><span className="font-display text-2xl leading-none text-cyan">{player.todayXp}</span></Ring>
          <span className="text-center text-[11px] text-ink/60">XP today · a good day ≈ {XP_DAY_GUIDE}</span>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card title="A Gentle Warning" className="bg-pink/40">
          {alerts.map(a => (
            <div key={a.account.id + a.kind} className="flex min-h-[40px] flex-wrap items-center gap-x-2 text-sm"><Glyph name="alert" size={16} className="text-hp"/>
              <b>{a.account.name}</b>:
              {a.kind === 'enter-statement'
                ? <span>enter the statement for corte {a.cutoffDate.slice(5)} (estimate {mxn(a.estimate)})</span>
                : a.kind === 'late'
                  ? <span className="text-hp">{mxn(a.amount, 2)} of the pago para no generar intereses is late; pay it now to stop interest</span>
                  : <span>pay {mxn(a.amount, 2)} (pago para no generar intereses) {a.daysToDue === 0 ? 'TODAY' : `in ${a.daysToDue} days`}</span>}
              <Link to="/money" className="underline">Treasury</Link>
            </div>
          ))}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Quests of the Day" action={<Button variant="ghost" className="!px-3" onClick={() => setAdding(true)}><Glyph name="plus" size={16}/>Add</Button>}>
          <div className="flex flex-col gap-2">
            {tasks.length === 0 ? <Empty>No quests marked for today. Add your top 3 — the ones that move money or mastery.</Empty> : tasks.map(t => <TaskRow key={t.id} task={t} area={areaOf(t.areaId)} />)}
          </div>
          <TaskForm open={adding} onClose={() => setAdding(false)} defaultPriority={1} />
        </Card>

        <Card title="The Routine" action={<span className="font-type text-sm">{GOOD_DAY_MIN_CORE} core = good day +{GOOD_DAY_XP} · all {coreTotal} = perfect +{PERFECT_DAY_XP}</span>}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="mac-inset grid grid-cols-2 bg-white p-0.5" role="group" aria-label="Day">
                {[false, true].map(y => <button key={String(y)} aria-pressed={onYesterday === y} onClick={() => setOnYesterday(y)} className={cx('min-h-[40px] px-3 font-display text-sm', onYesterday === y ? 'mac-btn bg-xp/20' : 'text-ink/60')}>{y ? 'Yesterday' : 'Today'}</button>)}
              </div>
              <span className="flex items-center gap-1 font-display text-sm" title="Streak shields: earned every 7 good days in a row; one covers a missed day automatically"><Glyph name="aspis" size={16} className="text-cyan" />{shields} shield{shields === 1 ? '' : 's'}</span>
            </div>
            <h3 className="font-display text-sm text-lav">Core</h3>
            {habits.filter(h => h.core).map(h => <HabitRow key={h.id} habit={h} log={dayLogs.find(l => l.habitId === h.id)} today={habitDay} targets={dayTargets} />)}
            <h3 className="mt-2 font-display text-sm text-lav">Rituals</h3>
            {habits.filter(h => !h.core).map(h => <HabitRow key={h.id} habit={h} log={dayLogs.find(l => l.habitId === h.id)} today={habitDay} targets={dayTargets} />)}
            <Link to="/settings#habits" className="flex min-h-[40px] w-fit items-center gap-2 font-display text-[13px] text-lav hover:text-xp"><Glyph name="pencil" size={14} />Add, reorder or archive habits</Link>
          </div>
          {week && (
            <div className="mt-3 border-t-2 border-line pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-2"><span className="font-display">This week</span><span className={cx('font-display', week.earned ? 'text-ok' : 'text-ink/70')}>{week.count}/4 · {WEEKLY_SCORECARD.needed} for +{WEEKLY_SCORECARD.xp} XP</span></div>
              <ul className="mt-1 grid grid-cols-2 gap-x-3 text-[12px] text-ink/70">
                <li className={cx(week.hits.focus && 'text-ok')}>Focus {week.stats.focusHours.toFixed(1)}/{WEEKLY_SCORECARD.focusHours} h</li>
                <li className={cx(week.hits.exercise && 'text-ok')}>Exercise {week.stats.exerciseDays}/{WEEKLY_SCORECARD.exerciseDays} days</li>
                <li className={cx(week.hits.money && 'text-ok')}>Money check-in {week.stats.moneyDays}/{WEEKLY_SCORECARD.moneyDays} days</li>
                <li className={cx(week.hits.good && 'text-ok')}>Good days {week.stats.goodDays}/{WEEKLY_SCORECARD.goodDays}</li>
              </ul>
            </div>
          )}
        </Card>

        <Card title={teaching ? 'The Ideal Day · teaching day' : 'The Ideal Day'}>
          <ol className="flex flex-col">
            {blocks.map((b, i) => (
              <li key={b.start} className={cx('flex gap-3 px-2 py-1.5 text-sm', i === cur ? 'bg-ink font-bold text-white' : i < cur ? 'text-ink/45 line-through' : 'text-ink/90')}>
                <span className="w-12 shrink-0 font-display text-[14px] tabular-nums opacity-80">{b.start}</span><Glyph name={b.icon} size={16} className="mt-0.5 shrink-0" /><span>{b.title}</span>
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
                    <span className={cx('shrink-0', e.coins < 0 ? 'text-gold' : 'text-xp')}>{e.xp > 0 ? `+${e.xp}` : `${e.coins} dr`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3"><Bar value={player.progress} /><p className="mt-1 text-xs text-ink/55">{player.needed - player.into} XP to level {player.level + 1}</p></div>
        </Card>

        <CutUpCard lines={[...tasks.map(t => t.title), ...habits.map(h => h.name), ...blocks.slice(4, 9).map(b => b.title)]} />
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
          <Button variant="cyan" onClick={() => setSeed(s => s + 1)}><Glyph name="scissors" size={16} />cut again</Button>
        </div>
      </div>
    </Card>
  );
}
