// Quick capture: one typed line becomes a quest. Pure (no database), tested in tests/quickAdd.test.ts.
// Marks are optional and can sit anywhere in the line; a mark that matches nothing stays in the title.
//   #area   the area, by the start of its short name or name (#cide, #free)
//   !       today (also !today, !week, !later)
//   >when   due: >today, >tomorrow, >fri, >20 (day of this or next month), >12-05, >2026-12-05
//   *level  difficulty: *trivial, *easy, *medium, *hard (or *1 to *4). Epic needs a "done means" note: use the form.
import type { Area, Difficulty } from '@/db/types';
import { dateKey, parseKey } from './util';

export interface QuickQuest {
  title: string;
  areaId?: string;
  difficulty?: Difficulty;
  priority?: 1 | 2 | 3;
  dueDate?: string;
}

export const QUICK_HINT = '#area  !today  >fri  *hard';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LEVELS: Record<string, Difficulty> = { trivial: 1, easy: 2, medium: 3, hard: 4, '1': 1, '2': 2, '3': 3, '4': 4 };
const PRIORITY: Record<string, 1 | 2 | 3> = { '': 1, today: 1, week: 2, later: 3, someday: 3 };

const addDays = (key: string, n: number) => { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); };
const valid = (y: number, m: number, d: number) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d; };
const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The date a `>when` mark means, counted from `today`; undefined when it isn't a date. */
export function parseWhen(word: string, today: string): string | undefined {
  const w = fold(word);
  if (w === 'today') return today;
  if (w === 'tomorrow') return addDays(today, 1);
  const dow = DAYS.indexOf(w.slice(0, 3));
  if (dow >= 0 && w.length >= 3 && 'sunday monday tuesday wednesday thursday friday saturday'.split(' ')[dow].startsWith(w)) {
    // The next such weekday, never today (say >today for that).
    const ahead = (dow - parseKey(today).getDay() + 7) % 7 || 7;
    return addDays(today, ahead);
  }
  const [ty, tm, td] = today.split('-').map(Number);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w);
  if (m) return valid(+m[1], +m[2], +m[3]) ? key(+m[1], +m[2], +m[3]) : undefined;
  m = /^(\d{1,2})-(\d{1,2})$/.exec(w);
  if (m) {
    // Month-day: this year, or next year when that day has already passed.
    const y = key(ty, +m[1], +m[2]) < today ? ty + 1 : ty;
    return valid(y, +m[1], +m[2]) ? key(y, +m[1], +m[2]) : undefined;
  }
  m = /^(\d{1,2})$/.exec(w);
  if (m) {
    // A bare day: this month, or next month when it has already passed.
    const d = +m[1];
    if (d >= td && valid(ty, tm, d)) return key(ty, tm, d);
    const ny = tm === 12 ? ty + 1 : ty, nm = tm === 12 ? 1 : tm + 1;
    return valid(ny, nm, d) ? key(ny, nm, d) : undefined;
  }
  return undefined;
}

/** The area a `#word` mark means: short name first, then full name, by prefix. */
export function matchArea(word: string, areas: Pick<Area, 'id' | 'name' | 'short'>[]) {
  const w = fold(word);
  if (!w) return undefined;
  return areas.find(a => fold(a.short) === w) ?? areas.find(a => fold(a.short).startsWith(w)) ?? areas.find(a => fold(a.name).split(/[^a-z0-9]+/).some(part => part.startsWith(w)));
}

/** One line to one quest, or null when nothing is left for a title. */
export function parseQuick(line: string, areas: Pick<Area, 'id' | 'name' | 'short'>[], today: string): QuickQuest | null {
  const q: QuickQuest = { title: '' };
  const words: string[] = [];
  // Leading list marks from a pasted list: "- ", "* ", "[ ] ", "1. ".
  const text = line.replace(/^\s*(?:[-*•]\s+|\[[ x]?\]\s*|\d+[.)]\s+)+/i, '');
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const mark = tok[0], rest = tok.slice(1);
    if (mark === '#' && rest) { const a = matchArea(rest, areas); if (a) { q.areaId = a.id; continue; } }
    else if (mark === '!' && fold(rest) in PRIORITY) { q.priority = PRIORITY[fold(rest)]; continue; }
    else if (mark === '>' && rest) { const d = parseWhen(rest, today); if (d) { q.dueDate = d; continue; } }
    else if (mark === '*' && fold(rest) in LEVELS) { q.difficulty = LEVELS[fold(rest)]; continue; }
    words.push(tok);
  }
  q.title = words.join(' ');
  return q.title ? q : null;
}

/** A pasted block: one quest per non-empty line. */
export const parseQuickLines = (text: string, areas: Pick<Area, 'id' | 'name' | 'short'>[], today: string) =>
  text.split(/\r?\n/).map(l => parseQuick(l, areas, today)).filter((q): q is QuickQuest => !!q);
