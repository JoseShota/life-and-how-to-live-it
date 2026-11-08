// P2 sync: the Supabase client, with plain fetch (no @supabase/supabase-js: about 3 kB instead of a large
// library, and nothing loads at startup). Auth is by email (GoTrue /otp): the default email's link returns to the
// app with the session in the URL fragment (acceptRedirect); a typed code (/verify) works when the template
// includes {{ .Token }}, which needs custom SMTP on Supabase. Data goes through five
// Postgres functions (supabase/migrations/0001_sync.sql). The session lives in syncState, so "Reset app"
// (which deletes the database) also signs the device out.
import { db } from '@/db/db';
import type { Vault } from './crypto';
import { SyncError, type PulledRecord, type SyncErrorCode, type SyncServer } from './server';

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Maps the SQL functions to the engine's SyncServer. Expected states come back as `{ error: <code> }` (HTTP 200,
 * so the browser logs nothing); errors raised as `sync:<code>` also become SyncErrors.
 */
export function rpcServer(rawCall: Rpc): SyncServer {
  const call = async <T>(fn: string, args: Record<string, unknown>) => {
    const r = (await rawCall(fn, args)) as { error?: string } | null;
    if (r && typeof r.error === 'string') throw errorFromMessage(`sync:${r.error}`);
    return r as T;
  };
  return {
    getVault: async () => (await call<{ vault: Vault | null }>('sync_vault', {})).vault,
    createVault: async v => { await call('sync_create_vault', { p_id: v.id, p_salt: v.salt, p_iterations: v.iterations, p_check: v.check }); },
    push: async (records, schema, vaultId) => ({ now: Number((await call<{ now: number }>('sync_push', { p_records: records, p_schema: schema, p_vault: vaultId })).now) }),
    pull: async (after, limit, vaultId) => {
      const r = await call<{ records: PulledRecord[]; more: boolean; now: number }>('sync_pull', { p_after: after, p_limit: limit, p_vault: vaultId });
      return { records: r.records.map(x => ({ ...x, seq: Number(x.seq), hlc: Number(x.hlc), v: Number(x.v) })), more: !!r.more, now: Number(r.now) };
    },
    deleteAll: async () => { await call('sync_delete_all', {}); }
  };
}

const CODES = new Set<SyncErrorCode>(['offline', 'auth', 'locked', 'update-needed', 'vault-exists', 'server']);
/** `sync:locked` (raised by the SQL) → SyncError('locked'); anything else → 'server'. */
export function errorFromMessage(message: string | undefined): SyncError {
  const m = /sync:([a-z-]+)/.exec(message ?? '');
  const code = m && CODES.has(m[1] as SyncErrorCode) ? (m[1] as SyncErrorCode) : 'server';
  return new SyncError(code, code === 'server' ? message ?? 'Server error' : code);
}

export interface Session { access_token: string; refresh_token: string; expires_at: number; email: string }

export interface SupabaseConfig { url: string; anonKey: string }

/** The build's Supabase project, or null when this build has no sync configured. */
export function supabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url: url.replace(/\/+$/, ''), anonKey } : null;
}

export function createSupabase(cfg: SupabaseConfig, fetchFn: typeof fetch = (...a) => fetch(...a)) {
  const loadSession = async () => (await db.syncState.get('session'))?.value as Session | undefined;
  const saveSession = (s: Session | null) => (s ? db.syncState.put({ key: 'session', value: s }) : db.syncState.delete('session'));

  async function request(path: string, body: unknown, token?: string) {
    let res: Response;
    try {
      res = await fetchFn(`${cfg.url}${path}`, {
        method: 'POST',
        headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
      });
    } catch {
      throw new SyncError('offline', 'No connection.');
    }
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (res.ok) return json;
    const msg = (json as { message?: string; msg?: string; error_description?: string } | null);
    const message = msg?.message ?? msg?.msg ?? msg?.error_description ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new SyncError('auth', message);
    if (res.status >= 500 || res.status === 429) throw new SyncError('offline', message); // try again later
    throw errorFromMessage(message);
  }

  const toSession = (r: { access_token: string; refresh_token: string; expires_in: number }, email: string): Session =>
    ({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, email });

  /** A valid access token, refreshed when it is about to expire. */
  async function accessToken(force = false) {
    const s = await loadSession();
    if (!s) throw new SyncError('auth', 'Signed out.');
    if (!force && s.expires_at > Date.now()) return s.access_token;
    try {
      const r = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }) as { access_token: string; refresh_token: string; expires_in: number };
      const next = toSession(r, s.email);
      await saveSession(next);
      return next.access_token;
    } catch (e) {
      // A refresh token the server rejects (signed out elsewhere, or expired) means signing in again.
      if ((e as SyncError).code === 'auth' || (e as SyncError).code === 'server') await saveSession(null);
      throw new SyncError((e as SyncError).code === 'offline' ? 'offline' : 'auth', 'Please sign in again.');
    }
  }

  const call: Rpc = async (fn, args) => {
    try {
      return await request(`/rest/v1/rpc/${fn}`, args, await accessToken());
    } catch (e) {
      if ((e as SyncError).code !== 'auth') throw e;
      return request(`/rest/v1/rpc/${fn}`, args, await accessToken(true)); // the token expired early: once more
    }
  };

  return {
    server: rpcServer(call),
    /**
     * Emails a sign-in link, plus a code when the project's template includes one (creates the account the first
     * time). The link comes back to `redirectTo` with the session in the URL fragment (see acceptRedirect).
     */
    sendCode: async (email: string, redirectTo = `${location.origin}/settings`) => {
      await request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim(), create_user: true });
    },
    /** Signs in from the fragment a sign-in link returns with (`#access_token=…&refresh_token=…`). */
    acceptRedirect: async (fragment: string) => {
      const p = new URLSearchParams(fragment.replace(/^#/, ''));
      const error = p.get('error_description') ?? p.get('error');
      if (error) throw new SyncError('auth', error.replace(/\+/g, ' '));
      const access = p.get('access_token'), refresh = p.get('refresh_token');
      if (!access || !refresh) throw new SyncError('auth', 'The sign-in link was incomplete.');
      const email = jwtEmail(access);
      await saveSession(toSession({ access_token: access, refresh_token: refresh, expires_in: Number(p.get('expires_in') ?? 3600) }, email));
    },
    /** Checks the code; on success the device is signed in. */
    verifyCode: async (email: string, token: string) => {
      const r = await request('/auth/v1/verify', { type: 'email', email: email.trim(), token: token.trim() }) as { access_token: string; refresh_token: string; expires_in: number };
      await saveSession(toSession(r, email.trim()));
    },
    signOut: async () => {
      const s = await loadSession();
      await saveSession(null);
      if (s) await request('/auth/v1/logout', {}, s.access_token).catch(() => undefined);
    },
    session: loadSession
  };
}

export type Supabase = ReturnType<typeof createSupabase>;

/** The `email` claim of a Supabase access token (shown in Control; the token is verified by the server, not here). */
export function jwtEmail(token: string) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String((JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { email?: string }).email ?? '');
  } catch {
    return '';
  }
}
