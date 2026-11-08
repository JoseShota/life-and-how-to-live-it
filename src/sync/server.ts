// P2 sync: what the engine needs from a server. The real one is Supabase (src/sync/supabase.ts, with the SQL in
// supabase/migrations/); tests use an in-memory fake with the same rules (tests/helpers/fakeServer.ts).
import type { Vault } from './crypto';

/**
 * One row as the server sees it: an opaque id, the writer's clock and device, the writer's schema version and
 * the ciphertext. No table names, row ids, dates or amounts.
 */
export interface CloudRecord { rid: string; hlc: number; dev: string; v: number; data: string }
export interface PulledRecord extends CloudRecord { seq: number }

export interface PullPage { records: PulledRecord[]; more: boolean; now: number }

export type SyncErrorCode =
  | 'offline'       // no network, or the server didn't answer
  | 'auth'          // signed out, or the session expired
  | 'locked'        // the cloud copy was re-keyed with another passphrase (or deleted): enter the passphrase again
  | 'update-needed' // the other device runs a newer schema: reload to update the app first
  | 'vault-exists'  // another device created the cloud copy first
  | 'server';       // anything else

export class SyncError extends Error {
  constructor(public code: SyncErrorCode, message: string = code) { super(message); }
}

export interface SyncServer {
  /** The vault (salt, iterations, check), or null when the cloud copy doesn't exist. */
  getVault(): Promise<Vault | null>;
  /** Creates the vault; throws SyncError('vault-exists') if there is one. */
  createVault(vault: Vault): Promise<void>;
  /**
   * Upserts records in ONE transaction (all or nothing). For each record the server keeps whichever version is
   * newer by (hlc, dev); an accepted record gets the next sequence number. Sequence numbers are handed out one
   * push at a time per user, so a reader can never skip a row that commits late. Throws 'update-needed' when the
   * schema is older than one the server has seen, and 'locked' when `vaultId` isn't the current vault.
   */
  push(records: CloudRecord[], schema: number, vaultId: string): Promise<{ now: number }>;
  /** Records with seq > after, in seq order. `now` is the server's clock (ms), used to correct the device clock. */
  pull(after: number, limit: number, vaultId: string): Promise<PullPage>;
  /** Deletes the cloud copy (records and vault). */
  deleteAll(): Promise<void>;
}
