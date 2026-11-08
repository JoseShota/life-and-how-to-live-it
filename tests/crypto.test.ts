import { describe, it, expect } from 'vitest';
import { createVault, unlockVault, rowId, seal, open, PBKDF2_ITERATIONS } from '../src/sync/crypto';

describe('sync encryption', () => {
  it('a vault opens with its passphrase and not with another', async () => {
    const { vault, keys } = await createVault('my long passphrase', 1000);
    expect(vault.iterations).toBe(1000);
    expect(JSON.stringify(vault)).not.toContain('my long passphrase');
    expect(await unlockVault(vault, 'my long passphrase')).toBeTruthy();
    expect(await unlockVault(vault, 'my long passphrasE')).toBeNull();
    // Same passphrase, same vault: the same opaque row ids on every device.
    const again = (await unlockVault(vault, 'my long passphrase'))!;
    expect(await rowId(again, 'xp', 'workday:2026-11-07')).toBe(await rowId(keys, 'xp', 'workday:2026-11-07'));
    expect(await rowId(keys, 'xp', 'workday:2026-11-07')).not.toBe(await rowId(keys, 'xp', 'workday:2026-11-08'));
  });

  it('a ciphertext opens only under its own row id and is not readable', async () => {
    const { keys } = await createVault('p', 1000);
    const rid = await rowId(keys, 'transactions', 't1');
    const data = await seal(keys, rid, { t: 'transactions', k: 't1', v: { amount: -230, description: 'Tacos' } });
    expect(atob(data)).not.toContain('Tacos');
    expect(await open(keys, rid, data)).toMatchObject({ v: { amount: -230 } });
    await expect(open(keys, await rowId(keys, 'transactions', 't2'), data)).rejects.toThrow(); // moved by the server
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0)); bytes[20] ^= 1;
    await expect(open(keys, rid, btoa(String.fromCharCode(...bytes)))).rejects.toThrow(); // tampered
    expect(await seal(keys, rid, 1)).not.toBe(await seal(keys, rid, 1)); // a fresh IV every time
  });

  it('the app uses 600,000 PBKDF2 iterations', () => { expect(PBKDF2_ITERATIONS).toBe(600_000); });
});
