import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { legacyIcon } from '../src/db/legacy';
import { GLYPHS } from '../src/components/glyphs';
import { SEED_AREAS, SEED_HABITS, SEED_REWARDS, SEED_GOALS } from '../src/db/seed';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { IDEAL_DAY } from '../src/lib/routine';
import { LifeDB } from '../src/db/db';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('no emoji, only glyphs', () => {
  it('every seeded / static icon is a real glyph', () => {
    const icons = [...SEED_AREAS, ...SEED_HABITS, ...SEED_REWARDS, ...SEED_GOALS, ...ACHIEVEMENTS, ...IDEAL_DAY].map(x => x.icon);
    for (const i of icons) expect(GLYPHS).toHaveProperty(i);
  });
  it('no emoji in seeded titles or achievements', () => {
    const text = JSON.stringify([SEED_AREAS, SEED_HABITS, SEED_REWARDS, SEED_GOALS, ACHIEVEMENTS, IDEAL_DAY]);
    expect(EMOJI.test(text)).toBe(false);
  });
  it('legacyIcon maps emoji and falls back per table', () => {
    expect(legacyIcon({ emoji: '🎓' }, 'areas')).toEqual({ icon: 'owl' });
    expect(legacyIcon({ emoji: '🏋️' }, 'habits').icon).toBe('discus');
    expect(legacyIcon({ emoji: '🦄' }, 'rewards').icon).toBe('gift');
    expect(legacyIcon({ icon: 'moon', emoji: 'x' }, 'habits')).toEqual({ icon: 'moon' });
  });
});

describe('v1 → v2 migration', () => {
  it('converts stored emoji rows to glyph icons', async () => {
    const name = 'migration-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ areas: 'id, order', habits: 'id, &key, order', rewards: 'id', goals: 'id, order' });
    await v1.table('areas').add({ id: 'a', name: 'CIDE', emoji: '🎓', order: 0 });
    await v1.table('rewards').add({ id: 'r', title: 'Coffee', emoji: '☕' });
    v1.close();
    const db = new LifeDB(name);
    await db.open();
    expect((await db.areas.get('a'))?.icon).toBe('owl');
    expect((await db.rewards.get('r'))?.icon).toBe('cup');
    expect((await db.areas.get('a')) as unknown as Record<string, unknown>).not.toHaveProperty('emoji');
    db.close();
  });
});

describe('source code contains no emoji', () => {
  it('scans src/', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const files = walk('src').filter(f => /\.(tsx?|css)$/.test(f) && !f.endsWith('glyphs.ts'));
    const bad = files.filter(f => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
