import type { Habit } from './types';

/** Minimum versions and if-then plans (Fogg, Gollwitzer). Edit them on Today with the pencil. */
export const HABIT_PLANS: Record<string, { minLabel?: string; plan?: string }> = {
  wake: { minLabel: 'Up by 6:30', plan: 'When the alarm rings, I stand up and drink a glass of water.' },
  sleep: { minLabel: 'In bed by 22:30', plan: 'When it is 21:15, I charge the phone outside the bedroom.' },
  exercise: { minLabel: '10 push-ups or a 10-minute walk', plan: 'When I finish my morning water, I put on my shoes and go.' },
  clean: { minLabel: '5-minute tidy', plan: 'When the 17:30 block starts, I set a 15-minute timer and clean.' },
  intel: { plan: 'When breakfast is done, I read for 45 minutes at most, then close it.' },
  work: { minLabel: '2 h of focus', plan: 'When I sit at the desk at 8:00, I start a 50-minute sprint on the money quest.' },
  money: { minLabel: "Log today's spending", plan: 'When I close the laptop at 17:30, I open the Treasury.' },
  eat: { minLabel: 'A vegetable at lunch', plan: 'When I sit down for lunch, away from the screen, I start with the vegetables.' }
};
export const EAT_HABIT: Omit<Habit, 'id'> = { key: 'eat', name: 'Eat well', icon: 'bowl', kind: 'check', xp: 10, core: false, order: 7, archived: false, ...HABIT_PLANS.eat };
