import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '@/db/db';
import { levelFromXp, titleForLevel, targetsFor, DEFAULT_WORK_TARGETS, type WorkTargets } from '@/game/rules';
import { dateKey } from './util';

export function usePlayer() {
  return useLiveQuery(async () => {
    let xp = 0, coins = 0, todayXp = 0;
    const today = dateKey();
    await db.xp.each(e => { xp += e.xp; coins += e.coins; if (e.date === today) todayXp += e.xp; });
    const lvl = levelFromXp(xp);
    const name = (await db.settings.get('playerName'))?.value as string | undefined;
    return { xp, coins, todayXp, ...lvl, title: titleForLevel(lvl.level), name: name ?? 'Player' };
  }, [], { xp: 0, coins: 0, todayXp: 0, level: 1, into: 0, needed: 1, progress: 0, title: 'Neophyte', name: 'Player' });
}

/** Re-render every `ms` (for clocks/timers). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Today's date key that rolls over at midnight. */
export function useToday() {
  const now = useNow(30_000);
  return dateKey(now);
}

/** Deep-work targets from settings, and the ones that apply to `day` (weekday or weekend). */
export function useWorkTargets(day: string = dateKey()) {
  const all = (useLiveQuery(() => db.settings.get('workTargets'))?.value as WorkTargets | undefined) ?? DEFAULT_WORK_TARGETS;
  return { all, today: targetsFor(day, all) };
}
