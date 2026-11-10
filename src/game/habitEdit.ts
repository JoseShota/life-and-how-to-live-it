// P1-3 habit editor: what may change on a habit, and how. Pure (no database), tested in tests/habitEdit.test.ts.
// The 4 core habits grade the day (Perfect / Good Day), so their XP, coins and core flag are fixed and they can't
// be archived. The core flag is fixed on every habit: a ritual never becomes core. A habit's kind never changes,
// so its history keeps its meaning; the sleep target is fixed too (it is the bar for a core habit).
import type { Habit } from '@/db/types';
import { RITUAL_XP_CHOICES, NEW_RITUAL_XP } from './rules';

export const HABIT_NAME_MAX = 60;
export const HABIT_TEXT_MAX = 160;
export const HABIT_NOTE_MAX = 280;
export const HABIT_UNIT_MAX = 12;

/**
 * Is this amount "done"? A tick-box needs 1. A measured habit needs its target; one without a target counts from
 * any amount above zero, so you can record what happened without first deciding a bar.
 */
export const habitDone = (h: Pick<Habit, 'kind' | 'target'>, value: number) =>
  h.kind === 'check' ? value >= 1 : h.target ? value >= h.target : value > 0;

/**
 * An amount as typed: "7.5", "7,5", or hours and minutes as "7:30" / "7h30" / "7h". Null when it isn't a number.
 * Negative amounts are refused; two decimals are kept.
 */
export function parseAmount(text: string): number | null {
  const t = text.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  const hm = /^(\d{1,3})\s*(?::|h)\s*(\d{1,2})?\s*m?$/.exec(t);
  const n = hm ? Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : 0) : /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN;
  if (hm && hm[2] && Number(hm[2]) >= 60) return null;
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

/** An amount for display: 7.5 stays 7.5, 7 stays 7, 0.333 becomes 0.33. */
export const formatAmount = (n: number) => String(Math.round(n * 100) / 100);

/** Habits the user adds get keys like `custom-<id>`; seeded ones keep their stable keys (`sleep`, `wake`…). */
export const customKey = (id: string) => `custom-${id}`;
export const isCustomHabit = (h: Pick<Habit, 'key'>) => h.key.startsWith('custom-');

export function editableFields(h: Pick<Habit, 'core' | 'kind' | 'key'>) {
  return {
    name: true,
    icon: true,
    plan: true,
    minLabel: h.kind !== 'auto', // deep work's minimum is automatic (2 h of focus)
    xp: !h.core,
    intrinsic: !h.core,
    archive: !h.core,
    /** Unit and target of a measured ritual you added. Sleep's bar is fixed: it grades the day. */
    measure: h.kind === 'number' && isCustomHabit(h),
    /** Only a habit you added, and only while it has no history (the caller checks the logs). */
    delete: !h.core && isCustomHabit(h)
  };
}

/** The XP values offered for a habit: the ritual choices, plus its current value if that is outside them. */
export function xpChoicesFor(h: Pick<Habit, 'xp'>) {
  return RITUAL_XP_CHOICES.includes(h.xp) ? RITUAL_XP_CHOICES : [...RITUAL_XP_CHOICES, h.xp].sort((a, b) => a - b);
}

export interface HabitDraft {
  name: string; icon: string; minLabel: string; plan: string; xp: number; intrinsic: boolean;
  /** New habits only: measured (an amount with a unit) instead of a tick-box. A habit's kind never changes later. */
  measured?: boolean;
  unit?: string;
  /** Measured: the amount that counts as done. Empty = any amount counts. */
  target?: number;
}

export const draftOf = (h: Habit): HabitDraft =>
  ({ name: h.name, icon: h.icon, minLabel: h.minLabel ?? '', plan: h.plan ?? '', xp: h.xp, intrinsic: !!h.intrinsic, measured: h.kind === 'number', unit: h.unit ?? '', target: h.target });

export const blankDraft = (): HabitDraft => ({ name: '', icon: 'star', minLabel: '', plan: '', xp: NEW_RITUAL_XP, intrinsic: false });

/** Why a draft can't be saved, or null. */
export function draftError(h: Pick<Habit, 'core' | 'kind' | 'key' | 'xp'>, d: HabitDraft): string | null {
  const name = d.name.trim();
  if (!name) return 'Give the habit a name.';
  if (name.length > HABIT_NAME_MAX) return `Keep the name under ${HABIT_NAME_MAX} characters.`;
  if (d.minLabel.trim().length > HABIT_TEXT_MAX || d.plan.trim().length > HABIT_TEXT_MAX) return `Keep each line under ${HABIT_TEXT_MAX} characters.`;
  if (editableFields(h).xp && d.xp !== h.xp && !RITUAL_XP_CHOICES.includes(d.xp)) return 'Choose one of the XP values.';
  if ((d.unit ?? '').trim().length > HABIT_UNIT_MAX) return `Keep the unit under ${HABIT_UNIT_MAX} characters.`;
  if (d.target !== undefined && !(Number.isFinite(d.target) && d.target > 0)) return 'The target is a number above zero, or empty.';
  return null;
}

/**
 * The fields to write for a draft: only those this habit allows and that actually changed (so saving an
 * unchanged habit writes nothing and syncs nothing). Empty texts are removed.
 */
export function habitChanges(h: Habit, d: HabitDraft): Partial<Habit> {
  const can = editableFields(h);
  const next: Partial<Habit> = {};
  const name = d.name.trim();
  if (name !== h.name) next.name = name;
  if (d.icon !== h.icon) next.icon = d.icon;
  const plan = d.plan.trim() || undefined;
  if (plan !== h.plan) next.plan = plan;
  if (can.minLabel) { const m = d.minLabel.trim() || undefined; if (m !== h.minLabel) next.minLabel = m; }
  if (can.xp && d.xp !== h.xp) next.xp = d.xp;
  if (can.intrinsic && d.intrinsic !== !!h.intrinsic) next.intrinsic = d.intrinsic || undefined;
  if (can.measure) {
    const unit = (d.unit ?? '').trim() || undefined;
    if (unit !== h.unit) next.unit = unit;
    if (d.target !== h.target) next.target = d.target;
  }
  return next;
}

/** A new ritual from a draft: a tick-box or a measured habit, never core, placed after every existing habit. */
export function newHabit(id: string, d: HabitDraft, all: Pick<Habit, 'order'>[]): Habit {
  return {
    id, key: customKey(id), name: d.name.trim(), icon: d.icon, kind: d.measured ? 'number' : 'check',
    ...(d.measured ? { unit: (d.unit ?? '').trim() || undefined, target: d.target } : {}),
    xp: RITUAL_XP_CHOICES.includes(d.xp) ? d.xp : NEW_RITUAL_XP, core: false,
    intrinsic: d.intrinsic || undefined, minLabel: d.minLabel.trim() || undefined, plan: d.plan.trim() || undefined,
    order: all.reduce((m, h) => Math.max(m, h.order), -1) + 1, archived: false
  };
}

/** Routine order: by `order`, then name (two devices can add a habit at the same position). */
export const byOrder = <T extends Pick<Habit, 'order' | 'name'>>(a: T, b: T) => a.order - b.order || a.name.localeCompare(b.name);

/**
 * Moves a habit one step up (-1) or down (+1) inside `group` (the core habits, or the rituals, as shown).
 * Returns only the rows whose `order` changes: usually the two that swap, so few rows sync. If positions are
 * tied, the group is renumbered from its first position.
 */
export function moveHabit(group: Pick<Habit, 'id' | 'order' | 'name'>[], id: string, dir: -1 | 1): { id: string; order: number }[] {
  const list = [...group].sort(byOrder);
  const i = list.findIndex(h => h.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [];
  const slots = list.map(h => h.order);
  const distinct = new Set(slots).size === slots.length;
  [list[i], list[j]] = [list[j], list[i]];
  const start = slots[0];
  return list
    .map((h, k) => ({ id: h.id, order: distinct ? slots[k] : start + k, was: h.order }))
    .filter(x => x.order !== x.was)
    .map(({ id, order }) => ({ id, order }));
}
