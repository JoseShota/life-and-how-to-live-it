// Q-3 area editor: the "Areas" card in Control (order, edit, add, archive) and its editor sheet.
// Rules in src/game/areaEdit.ts; writes in src/game/areaStore.ts.
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Area } from '@/db/types';
import { AREA_COLORS, AREA_KINDS, AREA_NAME_MAX, AREA_SHORT_MAX, areaByOrder, areaDraftError, blankAreaDraft, draftOfArea, type AreaDraft } from '@/game/areaEdit';
import { addArea, areaUsage, deleteArea, moveAreaStep, saveArea, setAreaArchived } from '@/game/areaStore';
import { useToast } from '@/lib/toast';
import { cx } from '@/lib/util';
import { Glyph } from './Glyph';
import { IconPicker } from './IconPicker';
import { Button, Card, Input, Label, Modal } from './ui';

const square = 'mac-btn flex h-10 w-10 shrink-0 items-center justify-center bg-white disabled:opacity-30';

function SquareButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className={square} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

const kindLabel = (k: Area['kind']) => AREA_KINDS.find(x => x.kind === k)?.label ?? k;

/** Edit an area, or add one when `area` is undefined. */
export function AreaEditor({ area, areas = [], onClose }: { area?: Area; areas?: Area[]; onClose: () => void }) {
  const toast = useToast();
  const all = useLiveQuery(() => db.areas.toArray(), [], []);
  const [d, setD] = useState<AreaDraft>(() => (area ? draftOfArea(area) : blankAreaDraft(areas)));
  const [hours, setHours] = useState(() => String(d.weeklyHoursTarget));
  const [picking, setPicking] = useState(false);
  const usage = useLiveQuery(() => (area ? areaUsage(area.id) : undefined), [area?.id]);
  const err = areaDraftError(d, all.filter(a => a.id !== area?.id));
  const set = (patch: Partial<AreaDraft>) => setD(x => ({ ...x, ...patch }));
  /** Runs a write, then thanks and closes; `false` from `fn` means "cancelled": stay open, say nothing. */
  const act = (fn: () => Promise<unknown>, done: string) => async () => {
    try { if ((await fn()) === false) return; toast(done, 'gold'); onClose(); } catch (e) { toast(String((e as Error).message ?? e), 'bad'); }
  };
  const kind = AREA_KINDS.find(k => k.kind === d.kind);

  return (
    <Modal open onClose={onClose} title={area ? area.name : 'New area'}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2.5rem_1fr] items-end gap-2">
          <button type="button" onClick={() => setPicking(p => !p)} aria-label="Change icon" aria-expanded={picking} title="Change icon"
            className="mac-inset flex h-10 w-10 items-center justify-center bg-white hover:bg-mint/50"><Glyph name={d.icon} size={22} /></button>
          <Label text="Name"><Input value={d.name} maxLength={AREA_NAME_MAX + 20} onChange={e => set({ name: e.target.value })} placeholder="e.g. Job market" /></Label>
        </div>
        {picking && <IconPicker value={d.icon} onChange={icon => { set({ icon }); setPicking(false); }} />}

        <div className="grid grid-cols-2 gap-3">
          <Label text="Short name (#tag)"><Input value={d.short} maxLength={AREA_SHORT_MAX + 4} onChange={e => set({ short: e.target.value })} placeholder="e.g. Jobs" /></Label>
          <Label text="Hours a week"><Input inputMode="decimal" value={hours} onChange={e => { setHours(e.target.value); const n = Number(e.target.value.replace(',', '.')); set({ weeklyHoursTarget: e.target.value.trim() === '' ? 0 : n }); }} /></Label>
        </div>
        <p className="-mt-1 text-xs text-ink/60">The short name labels tiles and charts, and quick capture finds it: "#{(d.short.trim() || 'jobs').toLowerCase()}".</p>

        <div className="flex flex-col gap-1">
          <span className="font-display text-[13px] text-lav">Color</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Color">
            {AREA_COLORS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={c} title={c} onClick={() => set({ color: c })}
                className={cx('flex h-10 w-10 items-center justify-center', d.color === c ? 'mac-inset' : 'mac-btn')} style={{ background: c }}>
                {d.color === c && <Glyph name="check" size={16} />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-display text-[13px] text-lav">Kind</span>
          <div className="mac-inset grid w-fit grid-cols-2 bg-white p-0.5 sm:grid-cols-4" role="radiogroup" aria-label="Kind">
            {AREA_KINDS.map(k => (
              <button key={k.kind} type="button" role="radio" aria-checked={d.kind === k.kind} onClick={() => set({ kind: k.kind })}
                className={cx('min-h-[40px] px-3 font-display text-sm', d.kind === k.kind ? 'mac-btn bg-xp/20' : 'text-ink/60')}>{k.label}</button>
            ))}
          </div>
          {kind && <p className="text-xs text-ink/60">{kind.hint}</p>}
        </div>

        <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={d.monetizable} onChange={e => set({ monetizable: e.target.checked })} />
          Earns money (offered for income and invoices, counted in the real MXN/h)
        </label>
        {area && <p className="text-xs text-ink/60">Kind and money changes apply from now on. Focus XP and money already logged stay as they were.</p>}

        {err && (d.name.trim() || area) && <p className="text-xs text-hp">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!err} onClick={act(() => (area ? saveArea(area, d) : addArea(d)), area ? 'Saved' : 'Area added')}>{area ? 'Save' : 'Add area'}</Button>
          {area && (area.archived
            ? <Button variant="ghost" onClick={act(() => setAreaArchived(area, false), 'Restored')}>Restore</Button>
            : <Button variant="ghost" onClick={act(async () => {
                if (usage?.openQuests && !confirm(`"${area.name}" has ${usage.openQuests} open quest${usage.openQuests === 1 ? '' : 's'}. They stay in All Quests. Archive it?`)) return false;
                await setAreaArchived(area, true);
              }, 'Archived. Restore it from Control → Areas.')}>Archive</Button>)}
          {area && usage && usage.total === 0 && (
            <Button variant="danger" onClick={act(async () => {
              if (!confirm(`Delete "${area.name}"? Nothing is filed under it yet, so no history is lost.`)) return false;
              if (!(await deleteArea(area))) throw new Error('Something was filed under it since: archive it instead.');
            }, 'Deleted')}><Glyph name="trash" size={16} />Delete</Button>
          )}
        </div>
        {area && usage && usage.total > 0 && <p className="text-xs text-ink/60">Quests, hours or money are filed here, so it can be archived, not deleted. Archiving hides it from menus, tiles and targets; its history stays.</p>}
      </div>
    </Modal>
  );
}

function AreaLine({ a, children }: { a: Area; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border border-line/50 bg-panel2/60 px-2 py-1">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink" style={{ background: a.color }}><Glyph name={a.icon} size={22} stroke={1.5} /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.name}</div>
        <div className="text-[11px] text-ink/60">#{a.short} · {kindLabel(a.kind)} · {a.weeklyHoursTarget} h/wk{a.monetizable ? ' · earns' : ''}</div>
      </div>
      {children}
    </div>
  );
}

/** Control → Areas: the active areas in order (Quests tiles, menus and charts follow it), plus archived ones. */
export function AreasCard() {
  const all = useLiveQuery(() => db.areas.toArray(), [], []);
  const [editing, setEditing] = useState<Area | 'new' | null>(null);
  const active = all.filter(a => !a.archived).sort(areaByOrder);
  const archived = all.filter(a => a.archived).sort(areaByOrder);
  const hours = active.reduce((s, a) => s + a.weeklyHoursTarget, 0);

  return (
    <div id="areas" className="scroll-mt-24">
      <Card id="Areas" title="Areas · where quests and hours go" action={<Button variant="ghost" className="!px-3" onClick={() => setEditing('new')}><Glyph name="plus" size={16} />Add area</Button>}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink/60">The order here is the order of the tiles on Quests and of every area menu.</p>
          {active.map((a, i) => (
            <AreaLine key={a.id} a={a}>
              <SquareButton label={`Move ${a.short} up`} disabled={i === 0} onClick={() => moveAreaStep(active, a.id, -1)}><Glyph name="arrow" size={16} className="-rotate-90" /></SquareButton>
              <SquareButton label={`Move ${a.short} down`} disabled={i === active.length - 1} onClick={() => moveAreaStep(active, a.id, 1)}><Glyph name="arrow" size={16} className="rotate-90" /></SquareButton>
              <SquareButton label={`Edit ${a.short}`} onClick={() => setEditing(a)}><Glyph name="pencil" size={16} /></SquareButton>
            </AreaLine>
          ))}
          <p className="text-xs text-ink/60">{active.length} area{active.length === 1 ? '' : 's'}, {hours} h a week planned in all.</p>
          {archived.length > 0 && (
            <details>
              <summary className="flex min-h-[40px] cursor-pointer items-center font-display text-[13px] text-lav">Archived ({archived.length})</summary>
              <div className="flex flex-col gap-2">
                {archived.map(a => (
                  <AreaLine key={a.id} a={a}>
                    <Button variant="ghost" className="!px-3" onClick={() => setAreaArchived(a, false)}>Restore</Button>
                    <SquareButton label={`Edit ${a.short}`} onClick={() => setEditing(a)}><Glyph name="pencil" size={16} /></SquareButton>
                  </AreaLine>
                ))}
              </div>
            </details>
          )}
        </div>
      </Card>
      {editing && <AreaEditor key={editing === 'new' ? 'new' : editing.id} area={editing === 'new' ? undefined : editing} areas={all} onClose={() => setEditing(null)} />}
    </div>
  );
}
