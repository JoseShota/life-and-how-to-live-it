import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { useNavigate } from 'react-router-dom';
import { db } from '@/db/db';
import type { Area, ChecklistItem, Difficulty, Recurrence, Task } from '@/db/types';
import { RECURRENCE_LABEL, makeRecurrence } from '@/lib/recurrence';
import { completeTask, reopenTask, revoke } from '@/game/engine';
import { checkAchievements } from '@/game/achievements';
import { DIFFICULTY_LABEL, TASK_XP } from '@/game/rules';
import { cx, dateKey, uid } from '@/lib/util';
import { QUICK_HINT, parseQuick, parseQuickLines, type QuickQuest } from '@/lib/quickAdd';
import { useToast } from '@/lib/toast';
import { Button, Chip, Input, Label, Modal, Select } from './ui';

export function TaskRow({ task, area, compact, hideToday }: { task: Task; area?: Area; compact?: boolean; hideToday?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [popping, setPopping] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const steps = task.checklist ?? [];
  const stepsDone = steps.filter(c => c.done).length;
  const tickStep = (id: string) => db.tasks.update(task.id, { checklist: steps.map(c => (c.id === id ? { ...c, done: !c.done } : c)) });
  const nav = useNavigate();
  const done = task.status === 'done';
  const overdue = !done && task.dueDate && task.dueDate < dateKey();
  const toggle = async () => {
    if (done) await reopenTask(task);
    else { setPopping(true); await completeTask(task); }
  };
  const startFocus = async () => {
    await db.settings.put({ key: 'activeTimer', value: { areaId: task.areaId, taskId: task.id, start: Date.now() } });
    nav('/focus');
  };
  return (
    <div className={cx('group border border-line/50 bg-panel2/60 transition hover:border-cyan/60 hover:bg-panel2', done && 'opacity-50')}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={toggle} aria-label={done ? 'Reopen' : 'Complete'} className={cx('flex h-10 w-10 shrink-0 items-center justify-center transition', done ? 'mac-inset bg-mint text-ink' : 'mac-inset bg-white hover:bg-pink/40', popping && 'pop')} onAnimationEnd={() => setPopping(false)}>
          {done && <Glyph name="check" size={16} stroke={2.6}/>}
        </button>
        <div className="min-w-0 flex-1">
          <div className={cx('truncate text-sm font-medium', done && 'line-through')}>{task.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {task.unsorted ? <Chip color="#e5d6a1">Inbox</Chip> : area && !compact && <Chip color={area.color}><Glyph name={area.icon} size={13} stroke={2} />{area.short}</Chip>}
            <Chip color="#c7c2e3">+{TASK_XP[task.difficulty]} XP</Chip>
            {task.priority === 1 && !done && !hideToday && <Chip color="#e3b9b2">Today</Chip>}
            {task.recurrence && <Chip color="#a6d9d1"><Glyph name="path" size={12} stroke={2} />{RECURRENCE_LABEL[task.recurrence.every]}</Chip>}
            {task.dueDate && <Chip color={overdue ? '#a8383a' : '#d4d9d6'}>{overdue ? 'Overdue ' : ''}{task.dueDate.slice(5)}</Chip>}
          </div>
        </div>
        {steps.length > 0 && (
          <button onClick={() => setShowSteps(v => !v)} aria-expanded={showSteps} aria-label={`Steps: ${stepsDone} of ${steps.length} done`} className={cx('flex h-10 shrink-0 items-center px-2 font-display text-[13px]', showSteps ? 'mac-inset bg-white' : 'text-ink/70 hover:text-ink', stepsDone === steps.length && 'text-ok')}>{stepsDone}/{steps.length}</button>
        )}
        {!done && <button onClick={startFocus} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/55 hover:bg-panel hover:text-xp" aria-label="Focus on this"><Glyph name="hourglass" size={16}/></button>}
        <button onClick={() => setEdit(true)} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/55 hover:bg-panel hover:text-ink/90" aria-label="Edit"><Glyph name="pencil" size={16}/></button>
      </div>
      {showSteps && (
        <ul className="border-t border-line/50 px-3 py-1">
          {steps.map(c => (
            <li key={c.id}>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={c.done} onChange={() => tickStep(c.id)} />
                <span className={cx(c.done && 'text-ink/50 line-through')}>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {edit && <TaskForm open onClose={() => setEdit(false)} task={task} />}
    </div>
  );
}

export function TaskForm({ open, onClose, task, defaultAreaId, defaultPriority = 2 }: { open: boolean; onClose: () => void; task?: Task; defaultAreaId?: string; defaultPriority?: 1 | 2 | 3 }) {
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const [f, setF] = useState<Partial<Task>>(task ?? {});
  const [err, setErr] = useState('');
  const [every, setEvery] = useState<Recurrence['every'] | ''>(task?.recurrence?.every ?? '');
  const [steps, setSteps] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [step, setStep] = useState('');
  // A step still in the box counts: nobody should lose one by pressing Save first.
  const allSteps = () => (step.trim() ? [...steps, { id: uid(), text: step.trim(), done: false }] : steps);
  const addStep = () => { setSteps(allSteps()); setStep(''); };
  const v = { title: '', areaId: defaultAreaId ?? areas[0]?.id, difficulty: 2 as Difficulty, priority: defaultPriority, ...f };
  const save = async () => {
    if (!v.title?.trim() || !v.areaId) return;
    // Epic is self-rated and pays the most, so it has to say what "done" looks like.
    if (v.difficulty === 5 && !v.notes?.trim()) { setErr('An Epic quest needs a note: what does "done" look like?'); return; }
    setErr('');
    const id = task?.id ?? uid();
    // A repeating quest needs a due date to step from: today when none is set.
    const dueDate = v.dueDate || (every ? dateKey() : undefined);
    const prev = task?.recurrence;
    const recurrence = every ? { ...makeRecurrence(every, prev?.series ?? id, dueDate!), ...(prev?.keepMissed ? { keepMissed: true } : {}) } : undefined;
    const checklist = allSteps().length ? allSteps() : undefined;
    // Saved from the form, a quest has been looked at: it leaves the inbox.
    if (task) await db.tasks.update(task.id, { title: v.title.trim(), areaId: v.areaId, difficulty: v.difficulty, priority: v.priority, dueDate, notes: v.notes, recurrence, checklist, unsorted: undefined });
    else await db.tasks.add({ id, title: v.title.trim(), areaId: v.areaId, difficulty: v.difficulty as Difficulty, priority: v.priority as 1 | 2 | 3, dueDate, notes: v.notes, status: 'todo', createdAt: Date.now(), recurrence, checklist });
    setF({}); setSteps([]); setStep('');
    onClose();
  };
  const remove = async () => {
    if (!task || !confirm('Delete this quest?')) return;
    await revoke(`task:${task.id}`);
    await db.tasks.delete(task.id);
    await checkAchievements();
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit quest' : 'New quest'}>
      <div className="flex flex-col gap-3">
        <Label text="Quest"><Input autoFocus value={v.title} onChange={e => setF({ ...v, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && save()} placeholder="e.g. Grade midterm exams" /></Label>
        <Label text="Area">
          <Select value={v.areaId} onChange={e => setF({ ...v, areaId: e.target.value })}>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Difficulty (XP)">
            <Select value={v.difficulty} onChange={e => setF({ ...v, difficulty: Number(e.target.value) as Difficulty })}>
              {([1, 2, 3, 4, 5] as Difficulty[]).map(d => <option key={d} value={d}>{DIFFICULTY_LABEL[d]} · {TASK_XP[d]} XP</option>)}
            </Select>
          </Label>
          <Label text="Priority">
            <Select value={v.priority} onChange={e => setF({ ...v, priority: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>Today</option><option value={2}>This week</option><option value={3}>Someday</option>
            </Select>
          </Label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Due date"><Input type="date" value={v.dueDate ?? ''} onChange={e => setF({ ...v, dueDate: e.target.value })} /></Label>
          <Label text="Repeats">
            <Select value={every} onChange={e => setEvery(e.target.value as Recurrence['every'] | '')}>
              <option value="">Never</option><option value="day">Every day</option><option value="week">Every week</option><option value="month">Every month</option>
            </Select>
          </Label>
        </div>
        {every && <p className="text-xs text-ink/60">Completing it creates the next one, {RECURRENCE_LABEL[every]} from its due date{task?.recurrence?.keepMissed ? ' (every period, even when late)' : '; missed periods are skipped'}.</p>}
        <div className="flex flex-col gap-1">
          <span className="font-display text-[13px] text-lav">Steps (optional)</span>
          {steps.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 shrink-0" aria-label={`Done: ${c.text}`} checked={c.done} onChange={() => setSteps(steps.map(x => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
              <Input value={c.text} aria-label="Step" onChange={e => setSteps(steps.map(x => (x.id === c.id ? { ...x, text: e.target.value } : x)))} />
              <button type="button" onClick={() => setSteps(steps.filter(x => x.id !== c.id))} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/45 hover:text-hp" aria-label={`Remove step: ${c.text}`}><Glyph name="close" size={14} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={step} aria-label="New step" placeholder="Add a step, press Enter" onChange={e => setStep(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }} />
            <Button type="button" variant="ghost" className="!px-3" aria-label="Add step" disabled={!step.trim()} onClick={addStep}><Glyph name="plus" size={16} /></Button>
          </div>
        </div>
        {task?.autoNotes && (
          <div className="mac-inset bg-panel2 p-2 text-sm">
            <div className="font-display text-[13px] text-lav">Estimate · kept current by the app</div>
            <p className="font-type">{task.autoNotes}</p>
          </div>
        )}
        <Label text={v.difficulty === 5 ? 'Done means… (required for Epic)' : task?.autoNotes ? 'Your notes' : 'Notes'}><textarea value={v.notes ?? ''} onChange={e => setF({ ...v, notes: e.target.value })} rows={3} className="mac-inset w-full bg-white p-3 text-sm outline-none" /></Label>
        {err && <p role="alert" className="font-type text-sm text-hp">{err}</p>}
        {v.difficulty === 5 && <p className="text-xs text-ink/60">Only your first Epic each day pays Epic XP; later ones pay Hard.</p>}
        <div className="mt-2 flex gap-2">
          {task && <Button variant="danger" onClick={remove}><Glyph name="trash" size={16}/></Button>}
          <Button className="flex-1" onClick={save}>{task ? 'Save' : 'Add quest'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Quick capture: type a pending thing, press Enter, keep typing. Marks are optional (src/lib/quickAdd.ts);
 * pasting several lines adds one quest per line. What a mark leaves unsaid comes from where the line sits:
 * the area being viewed or focused on, and that list's priority.
 */
export function QuickAdd({ areaId, priority = 2, placeholder = 'Add a quest, press Enter', onEmpty }: { areaId?: string; priority?: 1 | 2 | 3; placeholder?: string; /** The + button with nothing typed: open the full form. */ onEmpty?: () => void }) {
  const toast = useToast();
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const [text, setText] = useState('');
  const fallback = areaId ?? areas[0]?.id;
  const add = async (quests: QuickQuest[]) => {
    if (!quests.length || !fallback) return;
    const now = Date.now();
    // Clear the box before saving: whatever is typed next, while the save is in flight, must not be wiped.
    setText('');
    await db.tasks.bulkAdd(quests.map((q, i) => ({
      id: uid(), title: q.title, areaId: q.areaId ?? fallback, difficulty: q.difficulty ?? (2 as Difficulty), priority: q.priority ?? priority,
      dueDate: q.dueDate, status: 'todo' as const, createdAt: now + i,
      // No area said and none implied by the screen: it waits in the inbox (filed under the first area until sorted).
      ...(q.areaId || areaId ? {} : { unsorted: true })
    })));
    if (quests.length > 1) toast(`${quests.length} quests added`, 'gold');
  };
  const preview = text.trim() ? parseQuick(text, areas, dateKey()) : null;
  const area = areas.find(a => a.id === (preview?.areaId ?? fallback));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input value={text} aria-label="Quick add a quest" placeholder={placeholder} enterKeyHint="done" autoCapitalize="sentences"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && preview) add([preview]); }}
          onPaste={e => {
            const pasted = e.clipboardData.getData('text');
            if (!/\n/.test(pasted.trim())) return;
            e.preventDefault();
            add(parseQuickLines(pasted, areas, dateKey()));
          }} />
        <Button variant="ghost" className="!px-3" aria-label={preview || !onEmpty ? 'Add quest' : 'New quest: all the fields'} disabled={!preview && !onEmpty} onClick={() => (preview ? add([preview]) : onEmpty?.())}><Glyph name="plus" size={16} /></Button>
      </div>
      <div className="flex min-h-[20px] flex-wrap items-center gap-1.5 text-[11px] text-ink/55">
        {preview ? (<>
          {preview.areaId || areaId ? area && <Chip color={area.color}><Glyph name={area.icon} size={13} stroke={2} />{area.short}</Chip> : <Chip color="#e5d6a1">Inbox</Chip>}
          {(preview.priority ?? priority) === 1 && <Chip color="#e3b9b2">Today</Chip>}
          {preview.dueDate && <Chip>{preview.dueDate.slice(5)}</Chip>}
          {preview.difficulty && <Chip color="#c7c2e3">{DIFFICULTY_LABEL[preview.difficulty]}</Chip>}
        </>) : <span className="font-type">optional: {QUICK_HINT} · paste a list to add many</span>}
      </div>
    </div>
  );
}
