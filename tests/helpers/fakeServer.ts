// An in-memory sync server with the same rules as supabase/migrations (the `sync_*` functions):
// one user, last-write-wins by (hlc, dev), sequence numbers per accepted record, atomic pushes, a schema guard
// and a vault check. Tests can make it fail before or after committing a push, or go offline.
import type { Vault } from '../../src/sync/crypto';
import { SyncError, type CloudRecord, type PulledRecord, type SyncServer } from '../../src/sync/server';

export class FakeServer {
  vault: Vault | null = null;
  records = new Map<string, PulledRecord>();
  seq = 0;
  schema = 0;
  /** Simulated server clock offset from Date.now(). */
  clockOffset = 0;
  offline = false;
  /** 'before': the push fails and nothing is stored. 'after': it is stored but the reply is lost. */
  failNextPush: 'before' | 'after' | null = null;
  pushes = 0;

  private check(vaultId: string) {
    if (this.offline) throw new SyncError('offline');
    if (!this.vault || this.vault.id !== vaultId) throw new SyncError('locked');
  }

  /** A client view of this server (several devices share one server). */
  client(): SyncServer {
    return {
      getVault: async () => { if (this.offline) throw new SyncError('offline'); return this.vault && { ...this.vault }; },
      createVault: async v => {
        if (this.offline) throw new SyncError('offline');
        if (this.vault) throw new SyncError('vault-exists');
        this.vault = { ...v };
      },
      push: async (records: CloudRecord[], schema: number, vaultId: string) => {
        this.check(vaultId);
        if (this.failNextPush === 'before') { this.failNextPush = null; throw new SyncError('offline'); }
        if (schema < this.schema) throw new SyncError('update-needed');
        this.schema = Math.max(this.schema, schema);
        this.pushes++;
        for (const r of records) {
          const cur = this.records.get(r.rid);
          const wins = !cur || r.hlc > cur.hlc || (r.hlc === cur.hlc && r.dev > cur.dev);
          if (wins) this.records.set(r.rid, { ...r, seq: ++this.seq });
        }
        if (this.failNextPush === 'after') { this.failNextPush = null; throw new SyncError('offline'); }
        return { now: Date.now() + this.clockOffset };
      },
      pull: async (after: number, limit: number, vaultId: string) => {
        this.check(vaultId);
        const all = [...this.records.values()].filter(r => r.seq > after).sort((a, b) => a.seq - b.seq);
        return { records: all.slice(0, limit).map(r => ({ ...r })), more: all.length > limit, now: Date.now() + this.clockOffset };
      },
      deleteAll: async () => { this.vault = null; this.records.clear(); this.schema = 0; }
    };
  }
}
