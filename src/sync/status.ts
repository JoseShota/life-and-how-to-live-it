// P2 sync, startup side: the status the HUD shows, and booting the (lazy) sync runtime on linked devices.
// Kept tiny: the engine, crypto and the Supabase client load only on a device that uses sync.
import { useSyncExternalStore } from 'react';
import { db } from '@/db/db';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'locked' | 'update-needed' | 'vault-exists' | 'server';
export interface SyncInfo { status: SyncStatus; lastSyncedAt?: number; pending: number; message?: string }

let info: SyncInfo = { status: 'off', pending: 0 };
const listeners = new Set<() => void>();
export function setSyncInfo(next: SyncInfo) { info = next; listeners.forEach(l => l()); }
export const getSyncInfo = () => info;
export function useSyncInfo() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getSyncInfo);
}

/** True when this build has a Supabase project (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY). */
export const syncConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

let runtime: Promise<typeof import('./runtime')> | null = null;
export const loadSync = () => (runtime ??= import('./runtime'));

/** After the first render: start syncing if this device is linked. Unlinked devices load nothing. */
export async function bootSync() {
  if (!syncConfigured) return;
  if (await db.syncState.get('vaultId')) (await loadSync()).start();
}
