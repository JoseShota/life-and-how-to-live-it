import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { createSupabase, errorFromMessage } from '../src/sync/supabase';

type Call = { url: string; auth?: string; body: unknown };
/** A scripted fetch: each response is [status, json] (or 'network' to throw like fetch does offline). */
function fake(responses: ([number, unknown] | 'network')[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    calls.push({ url, auth: h.Authorization, body: JSON.parse(String(init.body)) });
    expect(h.apikey).toBe('anon');
    const r = responses.shift();
    if (!r || r === 'network') throw new TypeError('Failed to fetch');
    return new Response(r[1] === undefined ? '' : JSON.stringify(r[1]), { status: r[0] });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const cfg = { url: 'https://p.supabase.co', anonKey: 'anon' };
const tokens = (n: string) => ({ access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 3600 });

beforeEach(async () => { await db.syncState.clear(); });

describe('Supabase client', () => {
  it('signs in with an emailed code and calls functions with the user token', async () => {
    const f = fake([[200, {}], [200, tokens('1')], [200, { vault: null }]]);
    const sb = createSupabase(cfg, f.fn);
    await sb.sendCode(' me@example.com ');
    await sb.verifyCode('me@example.com', '123456');
    expect(await sb.server.getVault()).toBeNull();
    expect(f.calls.map(c => c.url)).toEqual(['https://p.supabase.co/auth/v1/otp', 'https://p.supabase.co/auth/v1/verify', 'https://p.supabase.co/rest/v1/rpc/sync_vault']);
    expect(f.calls[0].body).toEqual({ email: 'me@example.com', create_user: true });
    expect(f.calls[1].body).toEqual({ type: 'email', email: 'me@example.com', token: '123456' });
    expect(f.calls[2].auth).toBe('Bearer a1');
    expect(await sb.session()).toMatchObject({ email: 'me@example.com', refresh_token: 'r1' });
  });

  it('refreshes an expired token once and retries', async () => {
    const f = fake([[200, tokens('1')], [401, { message: 'JWT expired' }], [200, tokens('2')], [200, { vault: null }]]);
    const sb = createSupabase(cfg, f.fn);
    await sb.verifyCode('me@example.com', '123456');
    await sb.server.getVault();
    expect(f.calls.map(c => c.url.split('/').pop())).toEqual(['verify', 'sync_vault', 'token?grant_type=refresh_token', 'sync_vault']);
    expect(f.calls[3].auth).toBe('Bearer a2');
  });

  it('maps errors: no network → offline, a rejected refresh → signed out, rate limits keep the session', async () => {
    const offline = createSupabase(cfg, fake([[200, tokens('1')], 'network']).fn);
    await offline.verifyCode('me@example.com', '1');
    await expect(offline.server.getVault()).rejects.toMatchObject({ code: 'offline' });

    const limited = createSupabase(cfg, fake([[429, { message: 'slow down' }]]).fn);
    await expect(limited.server.getVault()).rejects.toMatchObject({ code: 'offline' });
    expect(await limited.session()).toBeTruthy();

    const expired = createSupabase(cfg, fake([[401, {}], [400, { error_description: 'Invalid Refresh Token' }]]).fn);
    await expect(expired.server.getVault()).rejects.toMatchObject({ code: 'auth' });
    expect(await expired.session()).toBeUndefined();
  });

  it('errors raised by the SQL keep their code', async () => {
    const sb = createSupabase(cfg, fake([[200, tokens('1')], [200, { error: 'update-needed' }], [400, { code: 'P0001', message: 'sync:server' }]]).fn);
    await sb.verifyCode('me@example.com', '1');
    await expect(sb.server.push([], 13, 'v')).rejects.toMatchObject({ code: 'update-needed' });
    await expect(sb.server.push([], 13, 'v')).rejects.toMatchObject({ code: 'server' });
    expect(errorFromMessage('sync:nonsense').code).toBe('server');
    expect(errorFromMessage('duplicate key').code).toBe('server');
  });
});
