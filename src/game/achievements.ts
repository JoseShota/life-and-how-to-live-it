import { db } from '@/db/db';
import { dateKey, uid } from '@/lib/util';

export interface AchievementDef {
  key: string;
  emoji: string;
  name: string;
  description: string;
  xp: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first-quest', emoji: '🗡️', name: 'First Blood', description: 'Complete your first quest', xp: 25 },
  { key: 'quests-50', emoji: '⚔️', name: 'Questmaster', description: 'Complete 50 quests', xp: 250 },
  { key: 'perfect-1', emoji: '🌟', name: 'Perfect Day', description: 'Complete every core habit in a day', xp: 50 },
  { key: 'perfect-7', emoji: '👑', name: 'Perfect Week', description: '7 Perfect Days in total', xp: 300 },
  { key: 'early-7', emoji: '🌅', name: 'Dawn Patrol', description: 'Up by 5:45 seven days in a row', xp: 150 },
  { key: 'deep-100', emoji: '🧠', name: 'Centurion', description: 'Log 100 hours of focus', xp: 500 },
  { key: 'workday-5', emoji: '⚒️', name: 'Grinder', description: '5 full 8-hour workdays', xp: 200 },
  { key: 'ledger-30', emoji: '📒', name: 'Bookkeeper', description: 'Log 30 transactions', xp: 100 },
  { key: 'first-income', emoji: '💸', name: 'Paid', description: 'Register income linked to an activity', xp: 50 }
];

async function conditions(): Promise<Record<string, boolean>> {
  const doneTasks = await db.tasks.where('status').equals('done').count();
  const perfect = await db.xp.where('source').equals('perfect-day').count();
  const workdays = await db.xp.where('source').equals('workday').count();
  const minutes = (await db.sessions.toArray()).reduce((s, x) => s + x.minutes, 0);
  const txs = await db.transactions.count();
  const income = await db.transactions.filter(t => t.kind === 'income' && !!t.areaId).count();
  const wake = await db.habits.where('key').equals('wake').first();
  let early7 = false;
  if (wake) {
    const done = new Set((await db.habitLogs.where('habitId').equals(wake.id).toArray()).filter(l => l.done).map(l => l.date));
    const days = [...done].sort();
    let run = 0, prev: Date | null = null;
    for (const k of days) {
      const d = new Date(k + 'T12:00:00');
      run = prev && Math.round((d.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
      prev = d;
      if (run >= 7) { early7 = true; break; }
    }
  }
  return {
    'first-quest': doneTasks >= 1,
    'quests-50': doneTasks >= 50,
    'perfect-1': perfect >= 1,
    'perfect-7': perfect >= 7,
    'early-7': early7,
    'deep-100': minutes >= 6000,
    'workday-5': workdays >= 5,
    'ledger-30': txs >= 30,
    'first-income': income >= 1
  };
}

type Listener = (a: AchievementDef) => void;
const listeners = new Set<Listener>();
export const onAchievement = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

let running = false;
export async function checkAchievements() {
  if (running) return;
  running = true;
  try {
    const c = await conditions();
    const have = new Set((await db.unlocked.toArray()).map(u => u.key));
    for (const a of ACHIEVEMENTS) {
      if (c[a.key] && !have.has(a.key)) {
        await db.unlocked.put({ key: a.key, unlockedAt: Date.now() });
        await db.xp.add({ id: uid(), ts: Date.now(), date: dateKey(), source: 'achievement', refId: `ach:${a.key}`, xp: a.xp, coins: Math.round(a.xp / 5), label: `${a.emoji} Achievement: ${a.name}` });
        listeners.forEach(l => l(a));
      }
    }
  } finally {
    running = false;
  }
}
