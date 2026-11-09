// P1-3 habit editor: what may change on a habit, and how. Pure (no database), tested in tests/habitEdit.test.ts.
// The 4 core habits grade the day (Perfect / Good Day), so their XP, coins and core flag are fixed and they can't
// be archived. The core flag is fixed on every habit: a ritual never becomes core. A habit's kind never changes,
// so its history keeps its meaning; the sleep target is fixed too (it is the bar for a core habit).
import type { Habit } from '@/db/types';
import { RITUAL_XP_CHOICES, NEW_RITUAL_XP } from './rules';

export const HABIT_NAME_MAX = 60;
export const HABIT_TEXT_MAX = 160;

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
    /** Only a habit you added, and only while it has no history (the caller checks the logs). */
    delete: !h.core && isCustomHabit(h)
  };
}

/** The XP values offered for a habit: the ritual choices, plus its current value if that is outside them. */
export function xpChoicesFor(h: Pick<Habit, 'xp'>) {
  return RITUAL_XP_CHOICES.includes(h.xp) ? RITUAL_XP_CHOICES : [...RITUAL_XP_CHOICES, h.xp].sort((a, b) => a - b);
}

export interface HabitDraft { name: string; icon: string; minLabel: string; plan: string; xp: number; intrinsic: boolean }

export const draftOf = (h: Habit): HabitDraft =>
  ({ name: h.name, icon: h.icon, minLabel: h.minLabel ?? '', plan: h.plan ?? '', xp: h.xp, intrinsic: !!h.intrinsic });

export const blankDraft = (): HabitDraft => ({ name: '', icon: 'star', minLabel: '', plan: '', xp: NEW_RITUAL_XP, intrinsic: false });

/** Why a draft can't be saved, or null. */
export function draftError(h: Pick<Habit, 'core' | 'kind' | 'key' | 'xp'>, d: HabitDraft): string | null {
  const name = d.name.trim();
  if (!name) return 'Give the habit a name.';
  if (name.length > HABIT_NAME_MAX) return `Keep the name under ${HABIT_NAME_MAX} characters.`;
  if (d.minLabel.trim().length > HABIT_TEXT_MAX || d.plan.trim().length > HABIT_TEXT_MAX) return `Keep each line under ${HABIT_TEXT_MAX} characters.`;
  if (editableFields(h).xp && d.xp !== h.xp && !RITUAL_XP_CHOICES.includes(d.xp)) return 'Choose one of the XP values.';
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
  return next;
}

/** A new ritual from a draft: a tick-box habit, never core, placed after every existing habit. */
export function newHabit(id: string, d: HabitDraft, all: Pick<Habit, 'order'>[]): Habit {
  return {
    id, key: customKey(id), name: d.name.trim(), icon: d.icon, kind: 'check',
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
