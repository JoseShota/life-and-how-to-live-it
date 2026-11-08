// P2 sync: end-to-end encryption with the browser's own WebCrypto (no dependency).
//
// A passphrase the user chooses becomes two keys (PBKDF2-SHA256, 600,000 iterations, a random salt per account):
// - an AES-GCM-256 key that encrypts every row, a fresh random IV each time;
// - an HMAC-SHA256 key that turns "table + row id" into an opaque id, so the server can't read table names or ids
//   either (ids like `wl:3`, `tax-m-2026-10` or `workday:2026-11-07` would otherwise reveal your wealth level,
//   tax regime and working days).
// Both keys are non-extractable: the device keeps them in IndexedDB but even the app can't read their bytes.
// The server stores only the salt, the iteration count and a check value that proves a passphrase is right.

export const PBKDF2_ITERATIONS = 600_000;
const CHECK_TEXT = 'life-and-how-to-live-it:vault-check:v1';

export interface SyncKeys { enc: CryptoKey; mac: CryptoKey }

/** What the server stores about the passphrase (nothing secret). `id` changes when the cloud copy is re-keyed. */
export interface Vault { id: string; salt: string; iterations: number; check: string }

/** The decrypted content of one cloud record: the table, the row key, and the row (null = deleted). */
export interface Plain { t: string; k: string; v: unknown | null }

const enc = new TextEncoder(), dec = new TextDecoder();
export const toB64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
export const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (b: ArrayBuffer) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function deriveKeys(passphrase: string, salt: string, iterations: number): Promise<SyncKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations }, base, 512));
  const encKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const macKey = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  bits.fill(0);
  return { enc: encKey, mac: macKey };
}

/** The opaque id the server sees for a row: HMAC(table|key). The same on every device with the same passphrase. */
export async function rowId(keys: SyncKeys, t: string, k: string) {
  return b64url(await crypto.subtle.sign('HMAC', keys.mac, enc.encode(`${t}|${k}`)));
}

/** Encrypts with the opaque id as associated data, so the server can't move a ciphertext to another row. */
export async function seal(keys: SyncKeys, rid: string, plain: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(rid) }, keys.enc, enc.encode(JSON.stringify(plain)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), 12);
  return toB64(out);
}

export async function open<T = unknown>(keys: SyncKeys, rid: string, data: string): Promise<T> {
  const raw = fromB64(data);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: enc.encode(rid) }, keys.enc, raw.slice(12));
  return JSON.parse(dec.decode(pt)) as T;
}

/** A new vault for a passphrase (first device). */
export async function createVault(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<{ vault: Vault; keys: SyncKeys }> {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const keys = await deriveKeys(passphrase, salt, iterations);
  const id = toB64(crypto.getRandomValues(new Uint8Array(12)));
  return { vault: { id, salt, iterations, check: await seal(keys, `check:${id}`, CHECK_TEXT) }, keys };
}

/** Keys for an existing vault, or null when the passphrase is wrong. */
export async function unlockVault(vault: Vault, passphrase: string): Promise<SyncKeys | null> {
  const keys = await deriveKeys(passphrase, vault.salt, vault.iterations);
  try {
    return (await open(keys, `check:${vault.id}`, vault.check)) === CHECK_TEXT ? keys : null;
  } catch {
    return null;
  }
}
