// A stand-in for Supabase on localhost: GoTrue's /otp, /verify, /token and /logout, and PostgREST's /rpc,
// backed by PGlite running supabase/migrations/*.sql in order. Sign-in: any email; the typed code is 123456;
// GET /__link?email=… returns the URL the email's link would open; GET /__dump lists the stored (encrypted) rows.
//   node mock-supabase.mjs <repo root> <port>
import http from 'node:http'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const ROOT = process.argv[2]; const port = Number(process.argv[3] ?? 4174);
const { PGlite } = await import(createRequire(ROOT + '/package.json').resolve('@electric-sql/pglite'));
const pg = new PGlite();
await pg.exec(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;`);
for (const f of fs.readdirSync(ROOT + '/supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await pg.exec(fs.readFileSync(`${ROOT}/supabase/migrations/${f}`, 'utf8'));
const users = new Map(); const links = new Map();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (id, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, email, role: 'authenticated' })}.sig`;
const subOf = tok => { try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).sub; } catch { return null; } };
const CASTS = { p_records: 'jsonb', p_schema: 'integer', p_vault: 'text', p_after: 'bigint', p_limit: 'integer', p_id: 'text', p_salt: 'text', p_iterations: 'integer', p_check: 'text' };
const uidFor = async email => { if (!users.has(email)) { const id = crypto.randomUUID(); users.set(email, id); await pg.query('insert into auth.users values ($1)', [id]); } return users.get(email); };
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, accept', 'access-control-allow-methods': 'POST, GET' }); return res.end(); }
  let raw = ''; for await (const c of req) raw += c; const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__dump') { const r = await pg.query('select rid, seq, hlc, dev, v, data from public.sync_records order by seq'); return send(res, 200, { users: [...users.keys()], rows: r.rows.map(x => ({ ...x, seq: Number(x.seq), hlc: Number(x.hlc) })) }); }
  if (url.pathname === '/__link') { const e = url.searchParams.get('email'); const l = links.get(e); const id = await uidFor(e); return send(res, 200, { url: `${l}#access_token=${jwt(id, e)}&expires_in=3600&refresh_token=ref:${id}&token_type=bearer&type=magiclink` }); }
  if (req.headers.apikey !== 'test-anon-key') return send(res, 401, { message: 'no apikey' });
  if (url.pathname === '/auth/v1/otp') { await uidFor(body.email); links.set(body.email, url.searchParams.get('redirect_to')); return send(res, 200, {}); }
  if (url.pathname === '/auth/v1/verify') {
    if (body.token !== '123456') return send(res, 403, { msg: 'Token has expired or is invalid' });
    const id = await uidFor(body.email); return send(res, 200, { access_token: jwt(id, body.email), refresh_token: 'ref:' + id, expires_in: 3600 });
  }
  if (url.pathname === '/auth/v1/token') { const id = String(body.refresh_token).slice(4); return send(res, 200, { access_token: jwt(id, ''), refresh_token: 'ref:' + id, expires_in: 3600 }); }
  if (url.pathname === '/auth/v1/logout') return send(res, 204);
  const m = /^\/rest\/v1\/rpc\/(sync_[a-z_]+)$/.exec(url.pathname);
  if (m) {
    const tok = String(req.headers.authorization ?? '').replace('Bearer ', '');
    const sub = subOf(tok);
    if (!sub) return send(res, 401, { message: 'JWT expired' });
    const names = Object.keys(body);
    try {
      const r = await pg.transaction(async tx => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
        return (await tx.query(`select public.${m[1]}(${names.map((n, i) => `${n} => $${i + 1}::${CASTS[n]}`).join(', ')}) as r`, names.map(n => typeof body[n] === 'object' ? JSON.stringify(body[n]) : body[n]))).rows[0]?.r ?? null;
      });
      return send(res, 200, typeof r === 'bigint' ? Number(r) : r);
    } catch (e) { return send(res, 400, { code: 'P0001', message: e.message }); }
  }
  send(res, 404, { message: 'not found' });
}).listen(port, () => console.log('mock supabase on', port));
