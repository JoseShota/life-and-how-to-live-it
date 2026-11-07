// P2 sync, part 1: change tracking. This file is in the startup bundle, so it stays small and has no imports
// from the app: the sync engine itself (src/sync/engine.ts) is loaded lazily.
//
// A Dexie DBCore middleware sees every write in the app (about 90 call sites, plus Collection.modify/delete and
// clear()), so none of them had to change. For each row that really changed it records `{table, key, hlc}` in
// the local `syncOutbox` table, in the same transaction as the write. Pushing later reads the row's current
// value (or notices it is gone, which is a delete). The domain rows themselves keep their exact shape.
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, DBCoreTransaction, Middleware } from 'dexie';

/** Device-only settings: never pushed, never overwritten by a pull. */
export const LOCAL_SETTINGS: readonly string[] = ['activeTimer', 'lastBackupAt', 'showMarquee', 'lastExpenseCategory'];

export const OUTBOX = 'syncOutbox';
export const SYNC_STATE = 'syncState';

/**
 * How a transaction's writes are tracked:
 * - 'remote': rows applied from a pull. Not recorded (they are already in the cloud) and they fire no toasts.
 * - 'weak': "create it if it's missing" (seed rows, the next tax quest, the next instance of a repeating quest).
 *   Recorded with hlc 0, so any real edit on another device wins over them and they never overwrite it.
 */
export type WriteKind = 'remote' | 'weak';

/** One pending change. `id` = `${t}|${k}`; repeated writes to a row collapse into one entry. */
export interface OutboxEntry { id: string; t: string; k: string; hlc: number }

/** Local sync bookkeeping (syncState rows hold any JSON value under a key). */
export interface SyncStateRow { key: string; value: unknown }

/** The hybrid logical clock state, stored in syncState under 'clock'. */
export interface ClockState { hlc: number; offset: number }

type Tagged = DBCoreTransaction & { __sync?: WriteKind; mode?: string };

/** Tags the current Dexie transaction (call it first thing inside `db.transaction(...)`). */
export function tagTransaction(trans: { idbtrans: unknown } | null | undefined, kind: WriteKind) {
  if (!trans) throw new Error('tagTransaction needs an open transaction');
  (trans.idbtrans as Tagged).__sync = kind;
}

/** The tag of a Dexie transaction (for hooks, which get the Dexie Transaction). */
export const transactionKind = (trans: { idbtrans?: unknown } | null | undefined) => (trans?.idbtrans as Tagged | undefined)?.__sync;

// ---- quiet mode: the engine re-checks pulled days without replaying the other device's toasts ----
let quietDepth = 0;
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  quietDepth++;
  try { return await fn(); } finally { quietDepth--; }
}
export const isQuiet = (trans?: { idbtrans?: unknown } | null) => quietDepth > 0 || transactionKind(trans) === 'remote';

// ---- hybrid logical clock ----
/**
 * Timestamps for last-write-wins: microsecond-ish integers (ms × 1000 + a counter) that never go backwards on
 * a device, jump past any change the device has already seen, and are corrected by the server's clock offset.
 * A device whose clock runs fast therefore can't keep winning, and two writes on one device never tie.
 */
export function nextHlc(clock: ClockState, now = Date.now()) {
  return Math.max(clock.hlc + 1, Math.round(now + clock.offset) * 1000);
}

/** Order two versions of a row: hlc first, then the device id (so ties break the same way everywhere). */
export const newer = (a: { hlc: number; dev?: string }, b: { hlc: number; dev?: string }) =>
  a.hlc !== b.hlc ? a.hlc > b.hlc : (a.dev ?? '') > (b.dev ?? '');

/** Deep equality for stored rows; a property set to `undefined` counts as missing (IndexedDB keeps both). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => sameValue(x, bb[i]));
  }
  const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!sameValue(ao[k], bo[k])) return false;
  return true;
}

const keyString = (k: unknown) => String(k);

/** The middleware. `synced` = the tables that sync (everything except the two sync tables). */
export function trackChanges(synced: readonly string[]): Middleware<DBCore> {
  const isSynced = new Set(synced);
  return {
    stack: 'dbcore',
    name: 'sync-track',
    create: down => ({
      ...down,
      // Every read-write transaction on a synced table also opens the outbox and the clock, so the change log
      // is written atomically with the change itself.
      transaction(stores, mode, opts) {
        const extra = mode === 'readwrite' && stores.some(s => isSynced.has(s))
          ? [OUTBOX, SYNC_STATE].filter(s => !stores.includes(s)) : [];
        return down.transaction(extra.length ? [...stores, ...extra] : stores, mode, opts);
      },
      table(name) {
        const table = down.table(name);
        if (!isSynced.has(name)) return table;
        const pk = table.schema.primaryKey;
        const keyOf = (v: unknown) => pk.extractKey!(v);
        return {
          ...table,
          async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
            const trans = req.trans as Tagged;
            // Upgrades run on every device by themselves, and pulled rows are already in the cloud.
            if (trans.mode === 'versionchange' || trans.__sync === 'remote') return table.mutate(req);
            let candidates: unknown[];
            if (req.type === 'add') candidates = req.values.map(keyOf);
            else if (req.type === 'put') candidates = await changedKeys(table, trans, req.values, keyOf);
            else if (req.type === 'delete') candidates = await existingKeys(table, trans, req.keys);
            else candidates = (await table.query({ trans, query: { index: pk, range: req.range }, values: false })).result;
            const res = await table.mutate(req);
            const failed = new Set(Object.keys(res.failures ?? {}).map(Number));
            const keys = req.type === 'add' || req.type === 'put'
              ? candidates.filter((k, i) => k !== undefined && !failed.has(i)) : candidates;
            const record = keys.map(keyString).filter(k => name !== 'settings' || !LOCAL_SETTINGS.includes(k));
            if (record.length) await recordChanges(down, trans, name, record, trans.__sync === 'weak');
            return res;
          }
        };
      }
    })
  };
}

/** Keys of `values` whose stored row differs (so a write that changes nothing is not a change). */
async function changedKeys(table: DBCoreTable, trans: DBCoreTransaction, values: readonly unknown[], keyOf: (v: unknown) => unknown) {
  const keys = values.map(keyOf);
  const before = await table.getMany({ trans, keys });
  return keys.map((k, i) => (before[i] !== undefined && sameValue(before[i], values[i]) ? undefined : k));
}

async function existingKeys(table: DBCoreTable, trans: DBCoreTransaction, keys: unknown[]) {
  const rows = await table.getMany({ trans, keys });
  return keys.filter((_, i) => rows[i] !== undefined);
}

async function recordChanges(down: DBCore, trans: DBCoreTransaction, t: string, keys: string[], weak: boolean) {
  const state = down.table(SYNC_STATE), outbox = down.table(OUTBOX);
  const clockRow = await state.get({ trans, key: 'clock' }) as SyncStateRow | undefined;
  const clock = (clockRow?.value as ClockState | undefined) ?? { hlc: 0, offset: 0 };
  const ids = keys.map(k => `${t}|${k}`);
  let hlc = 0;
  if (!weak) {
    hlc = nextHlc(clock);
    await state.mutate({ type: 'put', trans, values: [{ key: 'clock', value: { ...clock, hlc } }] });
  }
  // A weak write never lowers a pending real change on the same row.
  const pending = weak ? await outbox.getMany({ trans, keys: ids }) as (OutboxEntry | undefined)[] : [];
  const values: OutboxEntry[] = ids.map((id, i) => ({ id, t, k: keys[i], hlc: weak ? pending[i]?.hlc ?? 0 : hlc }));
  await outbox.mutate({ type: 'put', trans, values });
}
