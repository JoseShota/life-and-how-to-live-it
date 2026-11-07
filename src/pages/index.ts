// Pages load on demand (P1-9): the first screen only downloads the shell and the page it shows.
// Each import() becomes its own chunk; the service worker precaches all of them, so the app stays offline-ready.
import { lazy } from 'react';

const loaders = {
  today: () => import('./Today'),
  quests: () => import('./Quests'),
  focus: () => import('./Focus'),
  money: () => import('./Money'),
  rewards: () => import('./Rewards'),
  stats: () => import('./Stats'),
  settings: () => import('./Settings'),
  review: () => import('./Review')
};

export const Today = lazy(loaders.today);
export const Quests = lazy(loaders.quests);
export const Focus = lazy(loaders.focus);
export const Money = lazy(loaders.money);
export const Rewards = lazy(loaders.rewards);
export const Stats = lazy(loaders.stats);
export const SettingsPage = lazy(loaders.settings);
export const Review = lazy(loaders.review);

/** Warms every page once the first one has rendered, so switching tabs never waits on the network or disk. */
export function preloadPages() {
  const run = () => Object.values(loaders).forEach(l => { l().catch(() => undefined); });
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(run); else setTimeout(run, 1500);
}
