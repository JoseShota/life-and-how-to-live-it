-- P2 sync: an end-to-end encrypted store for Life and How to Live It.
--
-- The server never sees table names, row ids, dates, amounts or text: each row arrives as an opaque id (an HMAC
-- made on the device), the writer's clock (hlc) and device id, the writer's schema version, and AES-GCM
-- ciphertext. The passphrase and keys never leave the devices; the vault only holds the PBKDF2 salt, the
-- iteration count and a check value that proves a passphrase is right.
--
-- Clients never write the tables directly: everything goes through the functions below, which run with the
-- caller's identity (auth.uid()) and enforce:
--   * last-write-wins per row by (hlc, dev);
--   * sequence numbers handed out while holding the user's vault row lock, so they commit in order and a reader
--     paging by "seq > cursor" can never skip a row that commits late;
--   * all-or-nothing pushes (one function call = one transaction);
--   * a schema guard (an older app may not push after a newer one has) and a vault guard (a device holding keys
--     for a deleted or re-keyed cloud copy is refused).
-- The same rules are in tests/helpers/fakeServer.ts, and tests/supabase.test.ts runs this file in PGlite.
-- Expected states (signed out, locked, update needed, vault exists) come back as {"error": "<code>"} with
-- HTTP 200, so the browser doesn't log them as failed requests; real failures raise.

create table if not exists public.sync_vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  vault_id text not null,
  salt text not null,
  iterations integer not null check (iterations >= 100000),
  check_value text not null,
  schema_version integer not null default 0,
  seq bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  rid text not null check (length(rid) between 16 and 64),
  seq bigint not null,
  hlc bigint not null,
  dev text not null check (length(dev) <= 64),
  v integer not null,
  data text not null check (length(data) <= 1000000),
  primary key (user_id, rid)
);
create index if not exists sync_records_user_seq on public.sync_records (user_id, seq);

-- Row level security: a user can only ever see their own rows. No direct writes at all.
alter table public.sync_vaults enable row level security;
alter table public.sync_records enable row level security;
drop policy if exists "own vault" on public.sync_vaults;
create policy "own vault" on public.sync_vaults for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own records" on public.sync_records;
create policy "own records" on public.sync_records for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sync_vaults, public.sync_records from anon, authenticated;
grant select on public.sync_vaults, public.sync_records to authenticated;

-- Safe to run again, also after a change to a function's return type.
drop function if exists public.sync_vault();
drop function if exists public.sync_create_vault(text, text, integer, text);
drop function if exists public.sync_push(jsonb, integer, text);
drop function if exists public.sync_pull(bigint, integer, text);
drop function if exists public.sync_delete_all();

-- {"vault": {...} | null}.
create or replace function public.sync_vault()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v public.sync_vaults;
begin
  if uid is null then return jsonb_build_object('error', 'auth'); end if;
  select * into v from public.sync_vaults where user_id = uid;
  if not found then return jsonb_build_object('vault', null); end if;
  return jsonb_build_object('vault', jsonb_build_object('id', v.vault_id, 'salt', v.salt, 'iterations', v.iterations, 'check', v.check_value));
end $$;

-- Creates the vault (first device): {"ok": true}, or {"error": "vault-exists"} when there is one.
create or replace function public.sync_create_vault(p_id text, p_salt text, p_iterations integer, p_check text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('error', 'auth'); end if;
  insert into public.sync_vaults (user_id, vault_id, salt, iterations, check_value) values (uid, p_id, p_salt, p_iterations, p_check);
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('error', 'vault-exists');
end $$;

-- Upserts a batch of records in one transaction: {"now": <server clock in ms>} or {"error": ...}.
-- p_records: [{ rid, hlc, dev, v, data }, …] (at most 2000). Nothing is written before the checks pass.
create or replace function public.sync_push(p_records jsonb, p_schema integer, p_vault text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  vault public.sync_vaults;
  r jsonb;
  n bigint;
begin
  if uid is null then return jsonb_build_object('error', 'auth'); end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 2000 then raise exception 'sync:server'; end if;
  -- The row lock serializes this user's pushes, so sequence numbers commit in the order they are handed out.
  select * into vault from public.sync_vaults where user_id = uid for update;
  if not found or vault.vault_id <> p_vault then return jsonb_build_object('error', 'locked'); end if;
  if p_schema < vault.schema_version then return jsonb_build_object('error', 'update-needed'); end if;
  n := vault.seq;
  for r in select value from jsonb_array_elements(p_records) loop
    insert into public.sync_records as s (user_id, rid, seq, hlc, dev, v, data)
    values (uid, r->>'rid', n + 1, (r->>'hlc')::bigint, r->>'dev', (r->>'v')::integer, r->>'data')
    on conflict (user_id, rid) do update
      set seq = excluded.seq, hlc = excluded.hlc, dev = excluded.dev, v = excluded.v, data = excluded.data
      -- Newer wins; ties break by device id compared byte by byte (the same order as in JavaScript).
      where excluded.hlc > s.hlc or (excluded.hlc = s.hlc and (excluded.dev collate "C") > (s.dev collate "C"));
    if found then n := n + 1; end if;
  end loop;
  update public.sync_vaults set seq = n, schema_version = greatest(schema_version, p_schema) where user_id = uid;
  return jsonb_build_object('now', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- Records with seq > p_after, in seq order: {"records", "more", "now"} or {"error": ...}.
create or replace function public.sync_pull(p_after bigint, p_limit integer, p_vault text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); vid text; lim integer := least(greatest(p_limit, 1), 2000); recs jsonb; more boolean;
begin
  if uid is null then return jsonb_build_object('error', 'auth'); end if;
  select vault_id into vid from public.sync_vaults where user_id = uid;
  if vid is null or vid <> p_vault then return jsonb_build_object('error', 'locked'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('rid', t.rid, 'seq', t.seq, 'hlc', t.hlc, 'dev', t.dev, 'v', t.v, 'data', t.data) order by t.seq), '[]'::jsonb)
    into recs
    from (select * from public.sync_records where user_id = uid and seq > p_after order by seq limit lim) t;
  more := (select count(*) from (select 1 from public.sync_records where user_id = uid and seq > p_after limit lim + 1) c) > lim;
  return jsonb_build_object('records', recs, 'more', more, 'now', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- Deletes the cloud copy (records and vault) of the signed-in user.
create or replace function public.sync_delete_all()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('error', 'auth'); end if;
  delete from public.sync_records where user_id = uid;
  delete from public.sync_vaults where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.sync_vault(), public.sync_create_vault(text, text, integer, text),
  public.sync_push(jsonb, integer, text), public.sync_pull(bigint, integer, text), public.sync_delete_all() from public, anon;
grant execute on function public.sync_vault(), public.sync_create_vault(text, text, integer, text),
  public.sync_push(jsonb, integer, text), public.sync_pull(bigint, integer, text), public.sync_delete_all() to authenticated;
