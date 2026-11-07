// P2 sync engine. Loaded lazily (never in the startup bundle). One sync = pull, apply, re-check, push:
//
// 1. Pull every record after the cursor (all pages), check the schema versions, decrypt.
// 2. Apply them in ONE transaction tagged 'remote' (not re-recorded, no toasts). A row with a newer pending local
//    change keeps the local version (it is pushed next); otherwise the cloud version wins. The cursor moves in the
//    same transaction, so a crash never skips or half-applies a pull.
// 3. Re-check the days whose sessions or habit logs came in (evaluateDay, oldest first), quietly. Both devices hold
//    the same inputs by then, so the derived XP converges; when nothing changes nothing is written.
// 4. Push the outbox: read each row now (missing = deleted), encrypt, send in one atomic request. Entries are
//    cleared only if nothing changed them meanwhile. A lost reply is harmless: re-sending the same clock is a no-op.
import Dexie from 'dexie';
import { db, ALL_TABLES } from '@/db/db';
import { evaluateDay } from '@/game/engine';
import { uid } from '@/lib/util';
import { LOCAL_SETTINGS, newer, nextHlc, quietly, tagTransaction, type ClockState, type OutboxEntry } from './track';
import { createVault, open, rowId, seal, unlockVault, type Plain, type SyncKeys, type Vault } from './crypto';
import { SyncError, type CloudRecord, type PulledRecord, type SyncErrorCode, type SyncServer } from './server';

export type SyncStatus = 'off' | 'idle' | 'syncing' | SyncErrorCode;
export interface SyncInfo { status: SyncStatus; lastSyncedAt?: number; pending: number; message?: string }

const PULL_PAGE = 1000;
/** A normal push is far smaller and goes in one request. Only a first upload or an import is split. */
const PUSH_CHUNK = 1000;
/** Tables whose rows carry the date that evaluateDay re-checks after a pull. */
const DAY_TABLES = new Set(['sessions', 'habitLogs']);
const SYNCED = new Set<string>(ALL_TABLES);

interface Linked { keys: SyncKeys; vaultId: string; device: string }

const getState = async <T>(key: string) => (await db.syncState.get(key))?.value as T | undefined;
const tables = () => [...ALL_TABLES.map(t => db.table(t)), db.syncOutbox, db.syncState];

export function createSyncEngine(server: SyncServer) {
  let info: SyncInfo = { status: 'off', pending: 0 };
  const listeners = new Set<(i: SyncInfo) => void>();
  const set = (patch: Partial<SyncInfo>) => { info = { ...info, ...patch }; listeners.forEach(l => l(info)); };
  let running: Promise<SyncInfo> | null = null;

  async function linked(): Promise<Linked | null> {
    const keys = await getState<SyncKeys>('keys');
    const vaultId = await getState<string>('vaultId');
    if (!keys || !vaultId) return null;
    return { keys, vaultId, device: await deviceId() };
  }

  async function deviceId() {
    let d = await getState<string>('device');
    if (!d) { d = uid(); await db.syncState.put({ key: 'device', value: d }); }
    return d;
  }

  async function saveLink(keys: SyncKeys, vault: Vault) {
    await db.syncState.bulkPut([{ key: 'keys', value: keys }, { key: 'vaultId', value: vault.id }]);
  }

  /** Moves the clock past everything seen, and keeps the server's offset (corrects a device clock that is off). */
  async function observe(remoteHlc: number, serverNow?: number) {
    const clock = (await getState<ClockState>('clock')) ?? { hlc: 0, offset: 0 };
    const next: ClockState = { hlc: Math.max(clock.hlc, remoteHlc), offset: serverNow === undefined ? clock.offset : serverNow - Date.now() };
    await db.syncState.put({ key: 'clock', value: next });
  }

  // ---------- pull ----------
  async function fetchAll(link: Linked) {
    let cursor = (await getState<number>('cursor')) ?? 0;
    const records: PulledRecord[] = [];
    let now = Date.now();
    for (;;) {
      const page = await server.pull(cursor, PULL_PAGE, link.vaultId);
      records.push(...page.records);
      now = page.now;
      if (page.records.length) cursor = page.records[page.records.length - 1].seq;
      if (!page.more) break;
    }
    // A record written by a newer schema must not be applied by an older app (it may lack the table or the
    // upgrade): stop here, keep the cursor, and ask for a reload. The service worker brings the new version.
    if (records.some(r => r.v > db.verno)) throw new SyncError('update-needed', 'The other device runs a newer version. Reload to update.');
    const latest = new Map<string, PulledRecord>();
    for (const r of records) latest.set(r.rid, r); // in seq order: the last one per row wins
    const plain: (Plain & { hlc: number; dev: string })[] = [];
    for (const r of latest.values()) {
      try { plain.push({ ...(await open<Plain>(link.keys, r.rid, r.data)), hlc: r.hlc, dev: r.dev }); }
      catch { throw new SyncError('locked', 'A cloud record could not be decrypted with this passphrase.'); }
    }
    return { plain, cursor, now, maxHlc: records.reduce((m, r) => Math.max(m, r.hlc), 0) };
  }

  async function applyPulled(link: Linked, pulled: Awaited<ReturnType<typeof fetchAll>>) {
    const touched = new Set<string>();
    await db.transaction('rw', tables(), async () => {
      tagTransaction(Dexie.currentTransaction, 'remote');
      for (const rec of pulled.plain) {
        if (!SYNCED.has(rec.t) || (rec.t === 'settings' && LOCAL_SETTINGS.includes(rec.k))) continue;
        const pid = `${rec.t}|${rec.k}`;
        const pending = await db.syncOutbox.get(pid);
        if (pending && newer({ hlc: pending.hlc, dev: link.device }, rec)) continue; // ours is newer: pushed next
        const table = db.table(rec.t);
        const before = await table.get(rec.k);
        if (rec.v === null) { if (before) await table.delete(rec.k); }
        else {
          if (rec.t === 'habits') await freeHabitKey(rec.v as { id: string; key: string });
          await table.put(rec.v);
        }
        if (pending) await db.syncOutbox.delete(pid);
        if (DAY_TABLES.has(rec.t)) for (const r of [before, rec.v] as ({ date?: string } | null | undefined)[]) if (r?.date) touched.add(r.date);
      }
      await db.syncState.put({ key: 'cursor', value: pulled.cursor });
    });
    await observe(pulled.maxHlc, pulled.now);
    return [...touched].sort();
  }

  /** `habits.key` is unique: a habit arriving from the cloud replaces a local one with the same key and another id. */
  async function freeHabitKey(h: { id: string; key: string }) {
    const clash = await db.habits.where('key').equals(h.key).first();
    if (clash && clash.id !== h.id) await db.habits.delete(clash.id);
  }

  // ---------- push ----------
  async function push(link: Linked) {
    const entries = await db.syncOutbox.toArray();
    for (let i = 0; i < entries.length; i += PUSH_CHUNK) {
      const chunk = entries.slice(i, i + PUSH_CHUNK);
      const records: CloudRecord[] = [];
      for (const e of chunk) {
        const v = await db.table(e.t).get(e.k);
        const rid = await rowId(link.keys, e.t, e.k);
        records.push({ rid, hlc: e.hlc, dev: link.device, v: db.verno, data: await seal(link.keys, rid, { t: e.t, k: e.k, v: v ?? null } satisfies Plain) });
      }
      const { now } = await server.push(records, db.verno, link.vaultId);
      await clearPushed(chunk);
      await observe(0, now);
    }
  }

  async function clearPushed(chunk: OutboxEntry[]) {
    await db.transaction('rw', db.syncOutbox, async () => {
      const current = await db.syncOutbox.bulkGet(chunk.map(e => e.id));
      const done = chunk.filter((e, i) => current[i] && current[i]!.n === e.n && current[i]!.hlc === e.hlc).map(e => e.id);
      await db.syncOutbox.bulkDelete(done);
    });
  }

  // ---------- one sync ----------
  async function syncOnce(): Promise<SyncInfo> {
    const link = await linked();
    if (!link) { set({ status: 'off', pending: await db.syncOutbox.count() }); return info; }
    set({ status: 'syncing' });
    try {
      const days = await applyPulled(link, await fetchAll(link));
      if (days.length) await quietly(async () => { for (const d of days) await evaluateDay(d); });
      await push(link);
      set({ status: 'idle', lastSyncedAt: Date.now(), pending: await db.syncOutbox.count(), message: undefined });
    } catch (e) {
      const err = asSyncError(e);
      set({ status: err.code, pending: await db.syncOutbox.count(), message: err.message });
    }
    return info;
  }

  /** Runs one sync; concurrent calls share it, and other tabs of the app wait their turn (Web Locks). */
  function syncNow(): Promise<SyncInfo> {
    if (running) return running;
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    const run = locks ? () => locks.request('life-sync', syncOnce) : syncOnce;
    running = run().finally(() => { running = null; });
    return running;
  }

  // ---------- linking ----------
  /** First device: creates the cloud copy with this passphrase and uploads everything on this device. */
  async function createCloud(passphrase: string, iterations?: number) {
    const { vault, keys } = await createVault(passphrase, iterations);
    await server.createVault(vault);
    await db.transaction('rw', [...ALL_TABLES.map(t => db.table(t)), db.syncOutbox, db.syncState], async () => {
      const clock = (await getState<ClockState>('clock')) ?? { hlc: 0, offset: 0 };
      const hlc = nextHlc(clock);
      const pending = new Map((await db.syncOutbox.toArray()).map(e => [e.id, e]));
      const all: OutboxEntry[] = [];
      for (const t of ALL_TABLES) {
        for (const k of (await db.table(t).toCollection().primaryKeys()).map(String)) {
          if (t === 'settings' && LOCAL_SETTINGS.includes(k)) continue;
          const p = pending.get(`${t}|${k}`);
          all.push({ id: `${t}|${k}`, t, k, hlc: p ? p.hlc : hlc, n: (p?.n ?? 0) + 1 });
        }
      }
      // Deletes made before linking have nothing to delete in a new cloud copy.
      await db.syncOutbox.clear();
      await db.syncOutbox.bulkPut(all);
      await db.syncState.bulkPut([{ key: 'clock', value: { ...clock, hlc } }, { key: 'cursor', value: 0 }]);
    });
    await saveLink(keys, vault);
    return syncNow();
  }

  /**
   * Another device: checks the passphrase, then REPLACES this device's data with the cloud copy in one
   * transaction (device-only settings stay). The caller saves a backup file first. Returns false for a wrong
   * passphrase (nothing changes).
   */
  async function joinCloud(passphrase: string): Promise<boolean> {
    const vault = await server.getVault();
    if (!vault) throw new SyncError('locked', 'There is no cloud copy yet.');
    const keys = await unlockVault(vault, passphrase);
    if (!keys) return false;
    const link: Linked = { keys, vaultId: vault.id, device: await deviceId() };
    await db.syncState.put({ key: 'cursor', value: 0 });
    const pulled = await fetchAll(link);
    await db.transaction('rw', tables(), async () => {
      tagTransaction(Dexie.currentTransaction, 'remote');
      for (const t of ALL_TABLES) {
        if (t === 'settings') await db.settings.filter(s => !LOCAL_SETTINGS.includes(s.key)).delete();
        else await db.table(t).clear();
      }
      await db.syncOutbox.clear();
      const byTable = new Map<string, unknown[]>();
      for (const r of pulled.plain) {
        if (r.v === null || !SYNCED.has(r.t) || (r.t === 'settings' && LOCAL_SETTINGS.includes(r.k))) continue;
        byTable.set(r.t, [...(byTable.get(r.t) ?? []), r.v]);
      }
      for (const [t, rows] of byTable) await db.table(t).bulkPut(rows);
      await db.syncState.put({ key: 'cursor', value: pulled.cursor });
    });
    await observe(pulled.maxHlc, pulled.now);
    await saveLink(keys, vault);
    return true;
  }

  /** Signs this device out of sync: keys and cursor are forgotten, data stays, changes keep being recorded. */
  async function unlink() {
    await db.syncState.bulkDelete(['keys', 'vaultId', 'cursor']);
    set({ status: 'off', lastSyncedAt: undefined });
  }

  /** Deletes the cloud copy for every device, then unlinks this one. This device's data stays. */
  async function deleteCloud() {
    await server.deleteAll();
    await unlink();
  }

  return {
    syncNow, createCloud, joinCloud, unlink, deleteCloud,
    isLinked: async () => (await linked()) !== null,
    cloudExists: async () => (await server.getVault()) !== null,
    get info() { return info; },
    subscribe(fn: (i: SyncInfo) => void) { listeners.add(fn); fn(info); return () => { listeners.delete(fn); }; }
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

const CODES: readonly SyncErrorCode[] = ['offline', 'auth', 'locked', 'update-needed', 'vault-exists', 'server'];
/** By code rather than instanceof, so an error from another bundle chunk (or test module) is still recognized. */
export function asSyncError(e: unknown): SyncError {
  const code = (e as { code?: unknown })?.code;
  if (typeof code === 'string' && (CODES as readonly string[]).includes(code)) return e as SyncError;
  return new SyncError('server', String((e as Error)?.message ?? e));
}
