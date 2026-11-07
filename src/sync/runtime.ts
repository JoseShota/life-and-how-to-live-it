// P2 sync runtime (lazy): one Supabase client and one engine per tab, and the triggers that run a sync.
import { liveQuery } from 'dexie';
import { db } from '@/db/db';
import { createSyncEngine } from './engine';
import { createSupabase, supabaseConfig } from './supabase';
import { getSyncInfo, setSyncInfo } from './status';

const cfg = supabaseConfig();
if (!cfg) throw new Error('Sync is not configured for this build');
export const supabase = createSupabase(cfg);
export const engine = createSyncEngine(supabase.server);
engine.subscribe(i => setSyncInfo({ ...i }));

let started = false;
/**
 * Syncs when the app opens or comes back into view, when the network returns, every 60 s while visible, and
 * 3 s after a local change (debounced, so typing a name sends one change).
 */
export function start() {
  if (started) return;
  started = true;
  const kick = () => { if (document.visibilityState === 'visible') void engine.syncNow(); };
  document.addEventListener('visibilitychange', kick);
  window.addEventListener('focus', kick);
  window.addEventListener('online', kick);
  setInterval(kick, 60_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  liveQuery(() => db.syncOutbox.count()).subscribe(n => {
    setSyncInfo({ ...getSyncInfo(), pending: n });
    if (n > 0) { clearTimeout(timer); timer = setTimeout(kick, 3000); }
  });
  kick();
}
