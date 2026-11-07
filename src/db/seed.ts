import { db } from './db';
import Dexie from 'dexie';
import { tagTransaction } from '@/sync/track';
import type { Area, Habit, Account, Reward, Goal, Opportunity } from './types';
import { DEFAULT_WORK_TARGETS } from '@/game/rules';
import { HABIT_PLANS, EAT_HABIT } from './habitPlans';

export { HABIT_PLANS, EAT_HABIT };

export const SEED_AREAS: Omit<Area, 'id'>[] = [
  { name: 'Teaching · Introducción a la Economía (CIDE)', short: 'CIDE', icon: 'owl', color: '#b9cfe0', kind: 'work', weeklyHoursTarget: 8, monetizable: true, order: 0, archived: false },
  { name: 'Weaving Memories (web, media, admin)', short: 'Weaving', icon: 'spindle', color: '#e3b9b2', kind: 'work', weeklyHoursTarget: 12, monetizable: true, order: 1, archived: false },
  { name: 'Freelance web development', short: 'Freelance', icon: 'amphora', color: '#a6d9d1', kind: 'work', weeklyHoursTarget: 10, monetizable: true, order: 2, archived: false },
  { name: 'AI automation skills', short: 'AI', icon: 'cog', color: '#c7c2e3', kind: 'growth', weeklyHoursTarget: 7, monetizable: true, order: 3, archived: false },
  { name: 'Video editing (hobby)', short: 'Video', icon: 'mask', color: '#e8c9a0', kind: 'hobby', weeklyHoursTarget: 3, monetizable: false, order: 4, archived: false },
  { name: 'Writing (hobby)', short: 'Writing', icon: 'quill', color: '#efe3b0', kind: 'hobby', weeklyHoursTarget: 3, monetizable: false, order: 5, archived: false },
  { name: 'Personal webpage', short: 'Website', icon: 'temple', color: '#bcd3c6', kind: 'personal', weeklyHoursTarget: 2, monetizable: true, order: 6, archived: false },
  { name: 'Wealth & life admin', short: 'Wealth', icon: 'drachma', color: '#dccb98', kind: 'personal', weeklyHoursTarget: 2, monetizable: false, order: 7, archived: false }
];

export const SEED_HABITS: Omit<Habit, 'id'>[] = [
  { key: 'wake', name: 'Up by 5:45', icon: 'sunrise', kind: 'check', xp: 20, core: false, order: 0, archived: false, ...HABIT_PLANS.wake },
  { key: 'sleep', name: 'Slept ≥ 7.5 h', icon: 'moon', kind: 'number', target: 7.5, unit: 'h', xp: 20, core: true, order: 1, archived: false, ...HABIT_PLANS.sleep },
  { key: 'exercise', name: 'Exercise', icon: 'discus', kind: 'check', xp: 25, core: true, order: 2, archived: false, ...HABIT_PLANS.exercise },
  { key: 'clean', name: 'Clean (15 min)', icon: 'wave', kind: 'check', xp: 10, core: false, order: 3, archived: false, ...HABIT_PLANS.clean },
  { key: 'intel', name: 'Newsletters + econ videos', icon: 'scroll', kind: 'check', xp: 15, core: false, intrinsic: true, order: 4, archived: false, ...HABIT_PLANS.intel },
  { key: 'work', name: 'Deep work', icon: 'anvil', kind: 'auto', target: 6, unit: 'h', xp: 40, core: true, order: 5, archived: false, ...HABIT_PLANS.work },
  { key: 'money', name: 'Money check-in (log + review)', icon: 'scales', kind: 'check', xp: 15, core: true, order: 6, archived: false, ...HABIT_PLANS.money },
  EAT_HABIT
];

/** The plan's bucket accounts (00-MASTER-PLAN.md §4). Treasury offers to create any that are missing. */
export const BUCKET_ACCOUNTS: Omit<Account, 'id' | 'order'>[] = [
  { name: 'Apartado impuestos', institution: 'Banorte', type: 'savings', role: 'tax', openingBalance: 0, color: '#dccb98', archived: false },
  { name: 'Escudo · CETES', institution: 'cetesdirecto', type: 'savings', role: 'shield', openingBalance: 0, color: '#bcd3c6', archived: false },
  { name: 'Inversiones', institution: 'Broker', type: 'investment', role: 'invest', openingBalance: 0, color: '#c7c2e3', archived: false }
];

export const SEED_ACCOUNTS: Omit<Account, 'id'>[] = [
  { name: 'Banorte Débito', institution: 'Banorte', type: 'debit', role: 'operating', openingBalance: 0, color: '#d8a7a0', archived: false, order: 0 },
  { name: 'Banorte Crédito 1', institution: 'Banorte', type: 'credit', bank: 'banorte', dueDaysAfterCutoff: 20, creditLimit: 0, cutoffDay: 1, paymentDueDay: 21, openingBalance: 0, color: '#c99790', archived: false, order: 1 },
  { name: 'Banorte Crédito 2', institution: 'Banorte', type: 'credit', bank: 'banorte', dueDaysAfterCutoff: 20, creditLimit: 0, cutoffDay: 10, paymentDueDay: 30, openingBalance: 0, color: '#b98a8a', archived: false, order: 2 },
  { name: 'Banorte Crédito 3', institution: 'Banorte', type: 'credit', bank: 'banorte', dueDaysAfterCutoff: 20, creditLimit: 0, cutoffDay: 20, paymentDueDay: 10, openingBalance: 0, color: '#a98088', archived: false, order: 3 },
  { name: 'Efectivo', institution: 'Cash', type: 'cash', role: 'operating', openingBalance: 0, color: '#a6d9d1', archived: false, order: 4 },
  ...BUCKET_ACCOUNTS.map((b, i) => ({ ...b, order: 5 + i }))
];

export const SEED_REWARDS: Omit<Reward, 'id'>[] = [
  { title: '1 episode of a series', icon: 'mask', cost: 40, archived: false },
  { title: 'Fancy coffee', icon: 'cup', cost: 60, archived: false },
  { title: 'Guilt-free gaming hour', icon: 'dice', cost: 80, archived: false },
  { title: 'Dinner out', icon: 'bowl', cost: 250, archived: false },
  { title: 'Buy a book', icon: 'scroll', cost: 300, archived: false },
  { title: 'Full day off', icon: 'sun', cost: 1000, archived: false }
];

export const SEED_GOALS: Omit<Goal, 'id'>[] = [
  { name: 'Emergency fund (1 month)', icon: 'aspis', target: 25000, current: 0, order: 0 },
  { name: 'Emergency fund (6 months)', icon: 'temple', target: 150000, current: 0, order: 1 },
  { name: 'Credit cards at 0 revolving debt', icon: 'card', target: 1, current: 0, order: 2 },
  { name: 'First 1,000,000 MXN invested', icon: 'mountain', target: 1000000, current: 0, order: 3 }
];

export const SEED_OPPS: Omit<Opportunity, 'id' | 'createdAt'>[] = [
  { title: 'December opportunity #1 (rename me)', status: 'applied', monthlyValue: 0, probability: 0.5, expectedDate: '2026-12-15', nextAction: 'Define follow-up date and what I need to prepare' },
  { title: 'December opportunity #2 (rename me)', status: 'applied', monthlyValue: 0, probability: 0.5, expectedDate: '2026-12-15', nextAction: 'Define follow-up date and what I need to prepare' }
];

/** Onboarding quest line, by area order. Turns setup into the first XP. */
export const SEED_TASKS: [number, string, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3][] = [
  [0, 'List every remaining CIDE class, exam and grading deadline this semester', 2, 1],
  [0, 'Turn my best lecture into a reusable asset (notes → post / video / mini-course)', 4, 3],
  [1, 'Write down all open Weaving Memories deliverables with due dates', 2, 1],
  [1, 'Propose one automation that saves Weaving Memories 5+ h/month', 3, 2],
  [2, 'Define my freelance offer: 1 package, 1 price, 1 portfolio link', 3, 1],
  [2, 'Contact 5 potential clients (warm network first)', 4, 2],
  [3, 'Build my first paid-grade automation (n8n / Make / code + LLM)', 4, 2],
  [3, 'Ship 1 AI-automation case study on my website', 3, 3],
  [4, 'Edit 1 short video (≤60 s) from existing footage', 2, 3],
  [5, 'Write 300 words', 2, 3],
  [6, 'Update homepage: who I help, offer, contact button', 3, 2],
  [7, 'Money setup: enter limits, cut-off and pay-by days for my 3 Banorte cards', 2, 1],
  [7, 'Rename my two December opportunities and set their next actions', 1, 1]
];

/**
 * Seed rows get fixed ids (`seed-area-0`, `seed-habit-sleep`…), the same on every device, and are written as weak
 * changes: two fresh devices seed identical rows instead of duplicates, and a seed never overwrites real data
 * that another device already synced. Exported for tests.
 */
export const seedId = (kind: string, n: number | string) => `seed-${kind}-${n}`;

export async function seedIfEmpty() {
  const n = await db.areas.count();
  if (n > 0) return false;
  await db.transaction('rw', [db.tasks, db.areas, db.habits, db.accounts, db.rewards, db.goals, db.opportunities, db.settings], async () => {
    tagTransaction(Dexie.currentTransaction, 'weak');
    const areas = SEED_AREAS.map((a, i) => ({ ...a, id: seedId('area', i) }));
    await db.areas.bulkAdd(areas);
    await db.tasks.bulkAdd(SEED_TASKS.map(([i, title, difficulty, priority], j) => ({ id: seedId('quest', j), areaId: areas[i].id, title, difficulty, priority, status: 'todo' as const, createdAt: Date.now() })));
    await db.habits.bulkAdd(SEED_HABITS.map(h => ({ ...h, id: seedId('habit', h.key) })));
    await db.accounts.bulkAdd(SEED_ACCOUNTS.map((a, i) => ({ ...a, id: seedId('account', i) })));
    await db.rewards.bulkAdd(SEED_REWARDS.map((r, i) => ({ ...r, id: seedId('reward', i) })));
    await db.goals.bulkAdd(SEED_GOALS.map((g, i) => ({ ...g, id: seedId('goal', i) })));
    await db.opportunities.bulkAdd(SEED_OPPS.map((o, i) => ({ ...o, id: seedId('opp', i), createdAt: Date.now() })));
    await db.settings.bulkPut([
      { key: 'playerName', value: 'Economist' },
      { key: 'wakeTime', value: '05:45' },
      { key: 'bedTime', value: '21:45' },
      { key: 'workTargets', value: DEFAULT_WORK_TARGETS },
      { key: 'createdAt', value: Date.now() }
    ]);
  });
  return true;
}
