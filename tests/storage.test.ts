import { describe, it, expect, vi, afterEach } from 'vitest';
import { backupDue, daysSince, keepData, dataKept } from '../src/lib/storage';

const DAY = 864e5;
describe('backup reminder', () => {
  const now = Date.UTC(2026, 10, 10, 12);
  it('is due without a backup, or after 7 days', () => {
    expect(backupDue(undefined, now)).toBe(true);
    expect(backupDue(now - 6 * DAY, now)).toBe(false);
    expect(backupDue(now - 7 * DAY, now)).toBe(false);
    expect(backupDue(now - 7 * DAY - 1, now)).toBe(true);
  });
  it('counts whole days', () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince(now - 2.5 * DAY, now)).toBe(2);
  });
});

describe('keeping the data', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('asks only when not kept yet', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } });
    expect(await keepData()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } });
    expect(await keepData()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
  it('reports a refusal, and null where the browser has no answer', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => false } });
    expect(await keepData()).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(await keepData()).toBeNull();
    expect(await dataKept()).toBeNull();
    vi.stubGlobal('navigator', { storage: { persisted: async () => { throw new Error('x'); }, persist: async () => true } });
    expect(await keepData()).toBeNull();
  });
});
