// Q-3 area editor: what may change on an area, and how. Pure (no database), tested in tests/areaEdit.test.ts.
// Areas are where quests, focus time, income and costs are filed, so an area with any of those is archived, never
// deleted: its history keeps its label. Kind and "earns money" can change at any time; they apply from then on
// (a hobby's focus pays no dr from the next session; money already logged keeps its area).
import type { Area, AreaKind } from '@/db/types';
import { moveHabit, byOrder } from './habitEdit';

export const AREA_NAME_MAX = 60;
export const AREA_SHORT_MAX = 12;
export const AREA_HOURS_MAX = 80;

/** The pastel fills an area can take: the seed palette plus a few more, all light enough for ink text on top. */
export const AREA_COLORS = [
  '#b9cfe0', '#e3b9b2', '#a6d9d1', '#c7c2e3', '#e8c9a0', '#efe3b0', '#bcd3c6', '#dccb98',
  '#cfe2e8', '#ecc7c0', '#d4d9d6', '#d9c4dc'
] as const;

export const AREA_KINDS: { kind: AreaKind; label: string; hint: string }[] = [
  { kind: 'work', label: 'Work', hint: 'Paid work and clients. Focus pays XP and dr.' },
  { kind: 'growth', label: 'Growth', hint: 'Skills and moves that raise your income later. Focus pays XP and dr.' },
  { kind: 'hobby', label: 'Hobby', hint: 'Done for its own sake. Focus pays XP only, no dr.' },
  { kind: 'personal', label: 'Personal', hint: 'Life admin and your own projects. Focus pays XP and dr.' }
];

export interface AreaDraft {
  name: string; short: string; icon: string; color: string; kind: AreaKind; weeklyHoursTarget: number; monetizable: boolean;
}

export const draftOfArea = (a: Area): AreaDraft =>
  ({ name: a.name, short: a.short, icon: a.icon, color: a.color, kind: a.kind, weeklyHoursTarget: a.weeklyHoursTarget, monetizable: a.monetizable });

/** A new area starts as growth, 2 h a week, not earning, in the first color no active area uses. */
export function blankAreaDraft(areas: Pick<Area, 'color' | 'archived'>[] = []): AreaDraft {
  const used = new Set(areas.filter(a => !a.archived).map(a => a.color.toLowerCase()));
  const color = AREA_COLORS.find(c => !used.has(c)) ?? AREA_COLORS[0];
  return { name: '', short: '', icon: 'star', color, kind: 'growth', weeklyHoursTarget: 2, monetizable: false };
}

/** Why a draft can't be saved, or null. `others` are the other areas (to keep short names apart for `#area` capture). */
export function areaDraftError(d: AreaDraft, others: Pick<Area, 'short' | 'archived'>[] = []): string | null {
  const name = d.name.trim(), short = d.short.trim();
  if (!name) return 'Give the area a name.';
  if (name.length > AREA_NAME_MAX) return `Keep the name under ${AREA_NAME_MAX} characters.`;
  if (!short) return 'Give it a short name (it labels tiles and charts).';
  if (short.length > AREA_SHORT_MAX) return `Keep the short name under ${AREA_SHORT_MAX} characters.`;
  if (others.some(o => !o.archived && o.short.trim().toLowerCase() === short.toLowerCase())) return 'Another area already has that short name.';
  if (!/^#[0-9a-f]{6}$/i.test(d.color)) return 'Choose a color.';
  if (!AREA_KINDS.some(k => k.kind === d.kind)) return 'Choose a kind.';
  if (!(Number.isFinite(d.weeklyHoursTarget) && d.weeklyHoursTarget >= 0 && d.weeklyHoursTarget <= AREA_HOURS_MAX)) return `Weekly hours go from 0 to ${AREA_HOURS_MAX}.`;
  return null;
}

/** Only the fields that changed (saving an unchanged area writes nothing and syncs nothing). Texts are trimmed. */
export function areaChanges(a: Area, d: AreaDraft): Partial<Area> {
  const next: Partial<Area> = {};
  const name = d.name.trim(), short = d.short.trim();
  if (name !== a.name) next.name = name;
  if (short !== a.short) next.short = short;
  if (d.icon !== a.icon) next.icon = d.icon;
  if (d.color !== a.color) next.color = d.color;
  if (d.kind !== a.kind) next.kind = d.kind;
  if (d.weeklyHoursTarget !== a.weeklyHoursTarget) next.weeklyHoursTarget = d.weeklyHoursTarget;
  if (d.monetizable !== a.monetizable) next.monetizable = d.monetizable;
  return next;
}

/** A new area from a draft, placed after every existing area. */
export function newArea(id: string, d: AreaDraft, all: Pick<Area, 'order'>[]): Area {
  return {
    id, name: d.name.trim(), short: d.short.trim(), icon: d.icon, color: d.color, kind: d.kind,
    weeklyHoursTarget: d.weeklyHoursTarget, monetizable: d.monetizable,
    order: all.reduce((m, a) => Math.max(m, a.order), -1) + 1, archived: false
  };
}

/** Same ordering and one-step moves as habits: only the rows whose `order` changes are returned. */
export const areaByOrder = byOrder;
export const moveArea = moveHabit;
