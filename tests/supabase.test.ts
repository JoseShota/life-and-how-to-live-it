// Runs supabase/migrations/0001_sync.sql in PGlite (Postgres compiled to WebAssembly, a dev-only dependency) with
// a stand-in for Supabase's auth schema, then drives it through the same rpcServer() the app uses.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { rpcServer, errorFromMessage, type Rpc } from '../src/sync/supabase';
import { device, settle, PASS } from './helpers/devices';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MIGRATION = readFileSync(new URL('../supabase/migrations/0001_sync.sql', import.meta.url), 'utf8');
const CASTS: Record<string, string> = {
  p_records: 'jsonb', p_schema: 'integer', p_vault: 'text', p_after: 'bigint', p_limit: 'integer',
  p_id: 'text', p_salt: 'text', p_iterations: 'integer', p_check: 'text'
};

let pg: PGlite;

/** Calls a function as `user` (null = signed out), like PostgREST does with the caller's JWT. */
const rpc = (user: string | null): Rpc => async (fn, args) => {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}::${CASTS[n]}`).join(', ')}) as r`;
  const params = names.map(n => (typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]));
  try {
    return await pg.transaction(async tx => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? '']);
      return ((await tx.query<{ r: unknown }>(sql, params)).rows[0]?.r) ?? null;
    });
  } catch (e) {
    throw errorFromMessage((e as Error).message);
  }
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${ALICE}'), ('${BOB}');
  `);
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // re-running the migration is safe
}, 60_000);

const vault = (id: string) => ({ id, salt: 'c2FsdA==', iterations: 600000, check: 'x' });
const rec = (rid: string, hlc: number, dev: string, data = 'ct', v = 13) => ({ rid: rid.padEnd(43, '_'), hlc, dev, v, data });

describe('supabase/migrations/0001_sync.sql', () => {
  it('needs a signed-in user', async () => {
    await expect(rpcServer(rpc(null)).getVault()).rejects.toMatchObject({ code: 'auth' });
  });

  it('one vault per user, last-write-wins by (hlc, dev), sequence numbers only for accepted rows', async () => {
    const s = rpcServer(rpc(BOB));
    expect(await s.getVault()).toBeNull();
    await s.createVault(vault('vb'));
    await expect(s.createVault(vault('other'))).rejects.toMatchObject({ code: 'vault-exists' });
    expect(await s.getVault()).toMatchObject({ id: 'vb', iterations: 600000 });

    const { now } = await s.push([rec('a', 100, 'd1', 'one'), rec('b', 100, 'd1')], 13, 'vb');
    expect(Math.abs(now - Date.now())).toBeLessThan(60_000);
    await s.push([rec('a', 50, 'd2', 'older')], 13, 'vb'); // older: ignored
    await s.push([rec('a', 100, 'd0', 'tie-lower')], 13, 'vb'); // same hlc, lower device: ignored
    await s.push([rec('a', 100, 'd9', 'tie-higher')], 13, 'vb'); // same hlc, higher device: wins
    const page = await s.pull(0, 10, 'vb');
    expect(page.records.map(r => [r.rid.slice(0, 1), r.seq, r.data])).toEqual([['b', 2, 'ct'], ['a', 3, 'tie-higher']]);
    expect(page.more).toBe(false);
    // Paging.
    const p1 = await s.pull(0, 1, 'vb');
    expect(p1.records).toHaveLength(1);
    expect(p1.more).toBe(true);
    expect((await s.pull(p1.records[0].seq, 1, 'vb')).more).toBe(false);
  });

  it('refuses a stale vault id and a push from an older schema', async () => {
    const s = rpcServer(rpc(BOB));
    await expect(s.push([rec('c', 1, 'd1')], 13, 'wrong')).rejects.toMatchObject({ code: 'locked' });
    await expect(s.pull(0, 10, 'wrong')).rejects.toMatchObject({ code: 'locked' });
    await s.push([rec('c', 200, 'd1')], 14, 'vb');
    await expect(s.push([rec('d', 300, 'd1')], 13, 'vb')).rejects.toMatchObject({ code: 'update-needed' });
  });

  it('a failing push stores nothing (all or nothing)', async () => {
    const s = rpcServer(rpc(BOB));
    const before = (await s.pull(0, 100, 'vb')).records.length;
    await expect(s.push([rec('e', 400, 'd1'), { ...rec('f', 400, 'd1'), dev: 'x'.repeat(65) }], 14, 'vb')).rejects.toBeTruthy();
    expect((await s.pull(0, 100, 'vb')).records.length).toBe(before);
  });

  it('users only ever see their own rows, and nobody can write the tables directly', async () => {
    const alice = rpcServer(rpc(ALICE));
    expect(await alice.getVault()).toBeNull();
    await expect(alice.pull(0, 10, 'vb')).rejects.toMatchObject({ code: 'locked' });
    await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ALICE}', false);`);
    try {
      expect((await pg.query('select * from public.sync_records')).rows).toHaveLength(0);
      await expect(pg.query(`insert into public.sync_records (user_id, rid, seq, hlc, dev, v, data) values ('${ALICE}', '${'z'.repeat(43)}', 1, 1, 'd', 13, 'x')`)).rejects.toThrow();
      await expect(pg.query(`update public.sync_vaults set seq = 0`)).rejects.toThrow();
    } finally {
      await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
    expect((await pg.query(`select count(*)::int as n from public.sync_records where user_id = '${BOB}'`)).rows[0]).toEqual({ n: 3 });
  });

  it('delete_all removes the cloud copy', async () => {
    const s = rpcServer(rpc(BOB));
    await s.deleteAll();
    expect(await s.getVault()).toBeNull();
    expect((await pg.query(`select count(*)::int as n from public.sync_records where user_id = '${BOB}'`)).rows[0]).toEqual({ n: 0 });
  });

  it('two devices converge through the real SQL', async () => {
    const a = await device(rpcServer(rpc(ALICE)));
    const b = await device(rpcServer(rpc(ALICE)));
    await a.sync.createCloud(PASS, 100_000);
    expect(await b.sync.joinCloud(PASS)).toBe(true);
    const area = (await a.db.areas.toArray())[0].id;
    await a.game.logSession(area, new Date(2026, 10, 4, 8).getTime(), new Date(2026, 10, 4, 12).getTime());
    await b.game.logSession(area, new Date(2026, 10, 4, 13).getTime(), new Date(2026, 10, 4, 17).getTime());
    await b.db.goals.update((await b.db.goals.toArray())[0].id, { current: 321 });
    await settle(a, b);
    expect(await b.snapshot()).toEqual(await a.snapshot());
    expect(await a.db.xp.get('workday:2026-11-04')).toBeTruthy();
  }, 60_000);
});
