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

/**
 * A sign-in link from the email returns here with the session (or an error) in the URL fragment. Called before
 * the first render: the fragment is taken out of the address bar and history at once, and kept in memory only.
 */
let authRedirect: string | null = null;
export function captureAuthRedirect() {
  const h = location.hash;
  if (!/(^#|&)(access_token|error_description)=/.test(h)) return;
  authRedirect = h;
  history.replaceState(null, '', `${location.pathname}${location.search}#sync`);
}

/** The last sign-in link that failed (expired, already used), for Control → Sync. */
let linkError: string | null = null;
const linkListeners = new Set<() => void>();
export function useSignInLinkError() {
  return useSyncExternalStore(fn => { linkListeners.add(fn); return () => { linkListeners.delete(fn); }; }, () => linkError);
}

async function finishSignInLink() {
  if (!authRedirect) return;
  const fragment = authRedirect;
  authRedirect = null;
  try { await (await loadSync()).supabase.acceptRedirect(fragment); linkError = null; }
  catch (e) { linkError = String((e as Error).message ?? e); }
  linkListeners.forEach(l => l());
}

/** After the first render: finish a sign-in link, then start syncing if this device is linked. Unlinked devices load nothing. */
export async function bootSync() {
  if (!syncConfigured) return;
  // The link can also arrive in a window that is already open on the same page: then only the fragment changes.
  window.addEventListener('hashchange', () => {
    captureAuthRedirect();
    void finishSignInLink().then(async () => { if (await db.syncState.get('vaultId')) (await loadSync()).start(); });
  });
  await finishSignInLink();
  if (await db.syncState.get('vaultId')) (await loadSync()).start();
}
