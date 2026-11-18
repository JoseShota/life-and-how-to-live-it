// The "laurel won" signal. Its own tiny module so the toast layer (in the entry chunk) can listen without pulling
// achievements.ts, and through it finance and wealth, into the startup bundle (P1-9).
import type { AchievementDef } from './achievements';

type Listener = (a: AchievementDef) => void;
const listeners = new Set<Listener>();
export const onAchievement = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emitAchievement = (a: AchievementDef) => listeners.forEach(l => l(a));
