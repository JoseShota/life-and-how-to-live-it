import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { useNavigate } from 'react-router-dom';
import { db } from '@/db/db';
import type { Area, Difficulty, Task } from '@/db/types';
import { completeTask, reopenTask, revoke } from '@/game/engine';
import { checkAchievements } from '@/game/achievements';
import { DIFFICULTY_LABEL, TASK_XP } from '@/game/rules';
import { cx, dateKey, uid } from '@/lib/util';
import { Button, Chip, Input, Label, Modal, Select } from './ui';

export function TaskRow({ task, area, compact }: { task: Task; area?: Area; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [popping, setPopping] = useState(false);
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
    <div className={cx('group flex items-center gap-3 border border-line/50 bg-panel2/60 px-3 py-2 transition hover:border-cyan/60 hover:bg-panel2', done && 'opacity-50')}>
      <button onClick={toggle} aria-label={done ? 'Reopen' : 'Complete'} className={cx('flex h-10 w-10 shrink-0 items-center justify-center transition', done ? 'mac-inset bg-mint text-ink' : 'mac-inset bg-white hover:bg-pink/40', popping && 'pop')} onAnimationEnd={() => setPopping(false)}>
        {done && <Glyph name="check" size={16} stroke={2.6}/>}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-sm font-medium', done && 'line-through')}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {area && !compact && <Chip color={area.color}><Glyph name={area.icon} size={13} stroke={2} />{area.short}</Chip>}
          <Chip color="#c7c2e3">+{TASK_XP[task.difficulty]} XP</Chip>
          {task.priority === 1 && !done && <Chip color="#e3b9b2">Today</Chip>}
          {task.dueDate && <Chip color={overdue ? '#a8383a' : '#d4d9d6'}>{overdue ? 'Overdue ' : ''}{task.dueDate.slice(5)}</Chip>}
        </div>
      </div>
      {!done && <button onClick={startFocus} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/55 hover:bg-panel hover:text-xp" aria-label="Focus on this"><Glyph name="hourglass" size={16}/></button>}
      <button onClick={() => setEdit(true)} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/55 hover:bg-panel hover:text-ink/90" aria-label="Edit"><Glyph name="pencil" size={16}/></button>
      <TaskForm open={edit} onClose={() => setEdit(false)} task={task} />
    </div>
  );
}

export function TaskForm({ open, onClose, task, defaultAreaId, defaultPriority = 2 }: { open: boolean; onClose: () => void; task?: Task; defaultAreaId?: string; defaultPriority?: 1 | 2 | 3 }) {
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const [f, setF] = useState<Partial<Task>>(task ?? {});
  const [err, setErr] = useState('');
  const v = { title: '', areaId: defaultAreaId ?? areas[0]?.id, difficulty: 2 as Difficulty, priority: defaultPriority, ...f };
  const save = async () => {
    if (!v.title?.trim() || !v.areaId) return;
    // Epic is self-rated and pays the most, so it has to say what "done" looks like.
    if (v.difficulty === 5 && !v.notes?.trim()) { setErr('An Epic quest needs a note: what does "done" look like?'); return; }
    setErr('');
    if (task) await db.tasks.update(task.id, { title: v.title.trim(), areaId: v.areaId, difficulty: v.difficulty, priority: v.priority, dueDate: v.dueDate || undefined, notes: v.notes });
    else await db.tasks.add({ id: uid(), title: v.title.trim(), areaId: v.areaId, difficulty: v.difficulty as Difficulty, priority: v.priority as 1 | 2 | 3, dueDate: v.dueDate || undefined, notes: v.notes, status: 'todo', createdAt: Date.now() });
    setF({});
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
        <Label text="Due date"><Input type="date" value={v.dueDate ?? ''} onChange={e => setF({ ...v, dueDate: e.target.value })} /></Label>
        <Label text={v.difficulty === 5 ? 'Done means… (required for Epic)' : 'Notes'}><textarea value={v.notes ?? ''} onChange={e => setF({ ...v, notes: e.target.value })} rows={3} className="mac-inset w-full bg-white p-3 text-sm outline-none" /></Label>
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
