// P1-3 habit editor: the "Habits" card in Control (order, edit, add, archive) and the editor sheet, which the
// pencil on Today opens too. Rules in src/game/habitEdit.ts; writes in src/game/habitStore.ts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { db } from '@/db/db';
import type { Habit } from '@/db/types';
import { blankDraft, byOrder, draftError, draftOf, editableFields, xpChoicesFor, type HabitDraft } from '@/game/habitEdit';
import { NEW_HABIT_BASE, addHabit, deleteHabit, habitHasHistory, moveHabitStep, saveHabit, setHabitArchived } from '@/game/habitStore';
import { useToast } from '@/lib/toast';
import { cx } from '@/lib/util';
import { Glyph } from './Glyph';
import { IconPicker } from './IconPicker';
import { Button, Card, Input, Label, Modal } from './ui';

const square = 'mac-btn flex h-10 w-10 shrink-0 items-center justify-center bg-white disabled:opacity-30';

function SquareButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className={square} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** Edit a habit, or add a ritual when `habit` is undefined. */
export function HabitEditor({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<HabitDraft>(() => (habit ? draftOf(habit) : blankDraft()));
  const [picking, setPicking] = useState(false);
  const base = habit ?? NEW_HABIT_BASE;
  const can = editableFields(base);
  const err = draftError(base, d);
  const history = useLiveQuery(() => (habit ? habitHasHistory(habit.id) : false), [habit?.id], true);
  const set = (patch: Partial<HabitDraft>) => setD(x => ({ ...x, ...patch }));
  /** Runs a write, then thanks and closes; `false` from `fn` means "cancelled": stay open, say nothing. */
  const act = (fn: () => Promise<unknown>, done: string) => async () => {
    try { if ((await fn()) === false) return; toast(done, 'gold'); onClose(); } catch (e) { toast(String((e as Error).message ?? e), 'bad'); }
  };

  return (
    <Modal open onClose={onClose} title={habit ? habit.name : 'New ritual'}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2.5rem_1fr] items-end gap-2">
          <button type="button" onClick={() => setPicking(p => !p)} aria-label="Change icon" aria-expanded={picking} title="Change icon"
            className="mac-inset flex h-10 w-10 items-center justify-center bg-white hover:bg-mint/50"><Glyph name={d.icon} size={22} /></button>
          <Label text="Name"><Input value={d.name} maxLength={80} onChange={e => set({ name: e.target.value })} placeholder="e.g. Read 10 pages" /></Label>
        </div>
        {picking && <IconPicker value={d.icon} onChange={icon => { set({ icon }); setPicking(false); }} />}

        {can.minLabel
          ? <Label text="Minimum version (still counts on a bad day)"><Input value={d.minLabel} onChange={e => set({ minLabel: e.target.value })} placeholder="e.g. 1 page" /></Label>
          : <p className="text-xs text-ink/60">Deep work counts as its minimum version from 2 h of focus.</p>}
        <Label text="Plan: When…, I will…"><Input value={d.plan} onChange={e => set({ plan: e.target.value })} placeholder="When I finish my coffee, I will…" /></Label>
        <p className="text-xs text-ink/60">A specific when-then plan makes follow-through more likely (Gollwitzer). Anchor it to something you already do.</p>

        {can.xp ? (
          <div className="flex flex-col gap-1">
            <span className="font-display text-[13px] text-lav">XP per check-off</span>
            <div className="mac-inset flex w-fit bg-white p-0.5" role="radiogroup" aria-label="XP per check-off">
              {xpChoicesFor(base).map(x => (
                <button key={x} type="button" role="radio" aria-checked={d.xp === x} onClick={() => set({ xp: x })}
                  className={cx('min-h-[40px] min-w-[3rem] px-3 font-display text-sm', d.xp === x ? 'mac-btn bg-xp/20' : 'text-ink/60')}>{x}</button>
              ))}
            </div>
            <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={d.intrinsic} onChange={e => set({ intrinsic: e.target.checked })} />
              I already enjoy it: XP only, no dr
            </label>
            {habit && <p className="text-xs text-ink/60">XP and dr changes apply from the next check-off. What you already earned stays.</p>}
          </div>
        ) : (
          <p className="text-xs text-ink/60">Core habit: +{base.xp} XP, fixed. The 4 core habits decide Perfect and Good Days, so their XP and dr don't change and they can't be archived.</p>
        )}

        {err && d.name.trim() && <p className="text-xs text-hp">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!err} onClick={act(() => (habit ? saveHabit(habit, d) : addHabit(d)), habit ? 'Saved' : 'Ritual added')}>{habit ? 'Save' : 'Add ritual'}</Button>
          {habit && can.archive && (habit.archived
            ? <Button variant="ghost" onClick={act(() => setHabitArchived(habit, false), 'Restored')}>Restore</Button>
            : <Button variant="ghost" onClick={act(() => setHabitArchived(habit, true), 'Archived. Restore it from Control → Habits.')}>Archive</Button>)}
          {habit && can.delete && !history && (
            <Button variant="danger" onClick={act(async () => {
              if (!confirm(`Delete "${habit.name}"? It has never been checked, so no history is lost.`)) return false;
              if (!(await deleteHabit(habit))) throw new Error('It has been checked since: archive it instead.');
            }, 'Deleted')}><Glyph name="trash" size={16} />Delete</Button>
          )}
        </div>
        {habit && can.archive && history && <p className="text-xs text-ink/60">Archiving hides it from Today and Stats; its history and XP stay.</p>}
      </div>
    </Modal>
  );
}

function HabitLine({ h, children }: { h: Habit; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border border-line/50 bg-panel2/60 px-2 py-1">
      <Glyph name={h.icon} size={22} stroke={1.5} className="shrink-0 text-cyan" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{h.name}</div>
        <div className="text-[11px] text-ink/60">+{h.xp} XP{h.intrinsic ? ' · no dr' : ''}{h.kind === 'auto' ? ' · from focus' : ''}{h.minLabel ? ` · min: ${h.minLabel}` : ''}</div>
      </div>
      {children}
    </div>
  );
}

function Group({ title, list, edit }: { title: string; list: Habit[]; edit: (h: Habit) => void }) {
  return (
    <>
      <h3 className="mt-2 font-display text-sm text-lav">{title}</h3>
      {list.map((h, i) => (
        <HabitLine key={h.id} h={h}>
          <SquareButton label={`Move ${h.name} up`} disabled={i === 0} onClick={() => moveHabitStep(list, h.id, -1)}><Glyph name="arrow" size={16} className="-rotate-90" /></SquareButton>
          <SquareButton label={`Move ${h.name} down`} disabled={i === list.length - 1} onClick={() => moveHabitStep(list, h.id, 1)}><Glyph name="arrow" size={16} className="rotate-90" /></SquareButton>
          <SquareButton label={`Edit ${h.name}`} onClick={() => edit(h)}><Glyph name="pencil" size={16} /></SquareButton>
        </HabitLine>
      ))}
    </>
  );
}

/** Control → Habits: the core habits and rituals in routine order, plus archived ones. */
export function HabitsCard() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (location.hash === '#habits') ref.current?.scrollIntoView({ block: 'start' }); }, [location.hash]);
  const all = useLiveQuery(() => db.habits.toArray(), [], []);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const active = all.filter(h => !h.archived).sort(byOrder);
  const core = active.filter(h => h.core), rituals = active.filter(h => !h.core);
  const archived = all.filter(h => h.archived).sort(byOrder);
  const ritualXp = rituals.reduce((s, h) => s + h.xp, 0);

  return (
    <div ref={ref} id="habits" className="scroll-mt-24">
      <Card title="Habits · core and rituals" action={<Button variant="ghost" className="!px-3" onClick={() => setEditing('new')}><Glyph name="plus" size={16} />Add ritual</Button>}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink/60">The order here is the order on Today. The 4 core habits decide Perfect and Good Days, so their XP is fixed and they stay. Rituals are yours to shape.</p>
          <Group title="Core" list={core} edit={setEditing} />
          <Group title="Rituals" list={rituals} edit={setEditing} />
          {rituals.length === 0 && <p className="text-sm text-ink/60">No rituals. Add one when you're ready.</p>}
          <p className="text-xs text-ink/60">{rituals.length} ritual{rituals.length === 1 ? '' : 's'}, {ritualXp} XP a day at base. A few kept daily beat many kept rarely.</p>
          {archived.length > 0 && (
            <details>
              <summary className="flex min-h-[40px] cursor-pointer items-center font-display text-[13px] text-lav">Archived ({archived.length})</summary>
              <div className="flex flex-col gap-2">
                {archived.map(h => (
                  <HabitLine key={h.id} h={h}>
                    <Button variant="ghost" className="!px-3" onClick={() => setHabitArchived(h, false)}>Restore</Button>
                    <SquareButton label={`Edit ${h.name}`} onClick={() => setEditing(h)}><Glyph name="pencil" size={16} /></SquareButton>
                  </HabitLine>
                ))}
              </div>
            </details>
          )}
        </div>
      </Card>
      {editing && <HabitEditor key={editing === 'new' ? 'new' : editing.id} habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
