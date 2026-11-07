// Two simulated devices for sync tests: each has its own fake IndexedDB and its own copy of the app's modules.
import { IDBFactory } from 'fake-indexeddb';
import { expect, vi } from 'vitest';
import type { SyncServer } from '../../src/sync/server';

export const PASS = 'correct horse battery staple';

export async function device(server: SyncServer) {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  const { db } = await import('../../src/db/db');
  const { seedIfEmpty } = await import('../../src/db/seed');
  const game = await import('../../src/game/engine');
  const { createSyncEngine } = await import('../../src/sync/engine');
  await seedIfEmpty();
  const sync = createSyncEngine(server);
  const snapshot = async () => {
    const out: Record<string, unknown[]> = {};
    for (const t of ['areas', 'tasks', 'habits', 'habitLogs', 'sessions', 'accounts', 'transactions', 'goals', 'xp', 'unlocked', 'rewards', 'opportunities'])
      out[t] = (await db.table(t).toArray()).map(r => ({ ...r, ts: undefined })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    out.settings = (await db.settings.toArray()).filter(s => !['activeTimer', 'lastBackupAt', 'showMarquee', 'lastExpenseCategory'].includes(s.key));
    return out;
  };
  return { db, game, sync, snapshot };
}
export type Device = Awaited<ReturnType<typeof device>>;

/** Sync the devices in turn until neither has anything left (a few rounds). */
export async function settle(...ds: Device[]) {
  for (let i = 0; i < 4; i++) {
    for (const d of ds) expect((await d.sync.syncNow()).status).toBe('idle');
  }
}
