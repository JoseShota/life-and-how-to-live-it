import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { evaluateDay, regradeTeachingChange } from '@/game/engine';
import { useToast } from '@/lib/toast';
import { EMPTY_TEACHING_SCHEDULE, isTeachingDay, teachingHoursPerDay, teachingProblems, teachingReady, type TeachingSchedule } from '@/game/rules';
import { teachingDoubleCount } from '@/finance/finance';
import { useTeachingSchedule, useWorkTargets } from '@/lib/hooks';
import { cx, dateKey } from '@/lib/util';
import { Button, Card, Input, Label, Select } from './ui';

// Monday first, as the week is read; values are JS weekdays (0 = Sunday).
const WEEK = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']] as const;
const DAY_NAME = Object.fromEntries(WEEK) as Record<number, string>;
const PROBLEM: Record<string, string> = {
  days: 'the days', times: 'the times', 'time order': 'times in order (leave, arrive, class, home)',
  semester: 'the semester dates', 'semester order': 'a semester that ends after it starts', area: 'the area'
};

/**
 * Teaching days (T-1): the user's own schedule, stored on the device only. Until every field is in place it changes
 * nothing; then those days get the teaching Ideal Day, the 4/5 h deep-work targets and their hours away count
 * for the area's real MXN/h.
 */
export function TeachingScheduleCard() {
  const stored = useTeachingSchedule();
  const s: TeachingSchedule = { ...EMPTY_TEACHING_SCHEDULE, ...(stored ?? {}) };
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const manual = useLiveQuery(() => db.areaHours.toArray(), [], []);
  const { all: targets } = useWorkTargets();
  const today = dateKey();
  // Save on every change and re-grade today, so the targets and the Now card follow at once. Each save reads the
  // stored schedule inside the transaction, so quick edits in a row never overwrite each other with a stale copy.
  const set = (change: (cur: TeachingSchedule) => Partial<TeachingSchedule>) => db.transaction('rw', db.settings, async () => {
    const cur: TeachingSchedule = { ...EMPTY_TEACHING_SCHEDULE, ...((await db.settings.get('teachingSchedule'))?.value as Partial<TeachingSchedule> | undefined) };
    const next = { ...cur, ...change(cur) };
    await db.settings.put({ key: 'teachingSchedule', value: next });
    return [cur, next] as const;
  }).then(([before, after]) => queue(before, after));
  // Past days whose targets moved are re-graded too, so Stats and past reviews match the schedule. Once per burst
  // of edits (a date input passes through several valid years while typing), from the schedule before the burst.
  const toast = useToast();
  const burst = useRef<{ before: TeachingSchedule; after: TeachingSchedule; timer: number } | null>(null);
  const queue = (before: TeachingSchedule, after: TeachingSchedule) => {
    if (burst.current) clearTimeout(burst.current.timer);
    const from = burst.current?.before ?? before;
    burst.current = { before: from, after, timer: window.setTimeout(() => { burst.current = null; regrade(from, after); }, 1500) };
  };
  // Leaving Control mid-burst still re-grades.
  useEffect(() => () => { const b = burst.current; if (b) { clearTimeout(b.timer); regradeTeachingChange(b.before, b.after, today).then(() => evaluateDay(today)); } }, [today]);
  const regrade = async (before?: TeachingSchedule, after?: TeachingSchedule) => {
    const days = await regradeTeachingChange(before, after, today);
    if (!days.includes(today)) await evaluateDay(today);
    const past = days.filter(d => d !== today).length;
    if (past) toast(`Re-graded ${past} past day${past === 1 ? '' : 's'} with the new teaching targets`, 'xp');
  };
  /** A field's new value, read from the event now (the controlled input may re-render before the save runs). */
  const put = (patch: Partial<TeachingSchedule>) => set(() => patch);
  const toggle = (d: number) => set(cur => ({ days: cur.days.includes(d) ? cur.days.filter(x => x !== d) : [...cur.days, d].sort() }));
  const problems = teachingProblems(s);
  const ready = teachingReady(s);
  const area = areas.find(a => a.id === s.areaId);
  const perDay = ready ? teachingHoursPerDay(s) : 0;
  const twice = teachingDoubleCount(manual, s).length > 0;
  const isEmpty = !stored || JSON.stringify(s) === JSON.stringify(EMPTY_TEACHING_SCHEDULE);

  return (
    <Card title="Teaching days">
      <p className="mb-3 text-sm text-ink/60">The days you leave home to teach. They get their own Ideal Day, deep-work targets of {targets.teaching.done} h done and {targets.teaching.full} h full (prep and grading are focus; the class is not), and the hours away count for the area's real MXN/h. Stored on this device only.</p>
      <div className="flex flex-col gap-3">
        <div>
          <span className="font-display text-[13px] text-lav">Days</span>
          <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Teaching days">
            {WEEK.map(([d, name]) => (
              <button key={d} type="button" aria-pressed={s.days.includes(d)} onClick={() => toggle(d)}
                className={cx('h-10 min-w-[3rem] px-2 font-display text-sm', s.days.includes(d) ? 'mac-inset bg-laurel' : 'mac-btn bg-white')}>{name}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Label text="Leave home"><Input type="time" value={s.leave} onChange={e => put({ leave: e.target.value })} /></Label>
          <Label text="Arrive (optional)"><Input type="time" value={s.arrive ?? ''} onChange={e => put({ arrive: e.target.value || undefined })} /></Label>
          <Label text="Class starts"><Input type="time" value={s.classStart} onChange={e => put({ classStart: e.target.value })} /></Label>
          <Label text="Class ends"><Input type="time" value={s.classEnd} onChange={e => put({ classEnd: e.target.value })} /></Label>
          <Label text="Home by"><Input type="time" value={s.homeBy} onChange={e => put({ homeBy: e.target.value })} /></Label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Label text="Semester starts"><Input type="date" value={s.semesterStart} onChange={e => put({ semesterStart: e.target.value })} /></Label>
          <Label text="Semester ends"><Input type="date" value={s.semesterEnd} onChange={e => put({ semesterEnd: e.target.value })} /></Label>
          <Label text="Area"><Select value={s.areaId} onChange={e => put({ areaId: e.target.value })}>
            <option value="">Choose…</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}
          </Select></Label>
        </div>
        <p className={cx('text-[13px]', ready ? 'text-ok' : 'text-ink/60')}>
          {ready
            ? <>On: {[...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_NAME[d]).join(', ')}, {s.semesterStart} to {s.semesterEnd}. Each one counts {perDay.toFixed(perDay % 1 ? 1 : 0)} h away ({(perDay * s.days.length).toFixed(1).replace(/\.0$/, '')} h a week) for {area?.short ?? 'the area'}.{isTeachingDay(today, s) ? ' Today is a teaching day.' : ''}</>
            : isEmpty ? 'Off. Fill in every field to turn teaching days on.' : `Not on yet. Missing: ${problems.map(p => PROBLEM[p]).join(', ')}.`}
        </p>
        {twice && <p className="text-[13px] text-hp">A weekly entry under the Wealth Engine's "Other hours" for {area?.short} overlaps this semester. Teaching days already count those hours, so delete it or end it before the semester starts.</p>}
        {!isEmpty && (
          <div>
            <Button variant="ghost" onClick={async () => { if (confirm('Clear the teaching schedule? Those days go back to normal days.')) { const b = burst.current; if (b) clearTimeout(b.timer); burst.current = null; await db.settings.delete('teachingSchedule'); await regrade(b?.before ?? s, undefined); } }}>Clear schedule</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
