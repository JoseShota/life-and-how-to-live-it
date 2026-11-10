import { describe, it, expect } from 'vitest';
import { matchArea, parseQuick, parseQuickLines, parseWhen } from '../src/lib/quickAdd';

const areas = [
  { id: 'a0', name: 'Teaching · Introducción a la Economía (CIDE)', short: 'CIDE' },
  { id: 'a1', name: 'Weaving Memories (web, media, admin)', short: 'Weaving' },
  { id: 'a2', name: 'Freelance web development', short: 'Freelance' },
  { id: 'a3', name: 'AI automation skills', short: 'AI' }
];
// 2026-11-10 is a Tuesday.
const today = '2026-11-10';

describe('quick capture', () => {
  it('a plain line is just a title', () => {
    expect(parseQuick('  Grade the midterms ', areas, today)).toEqual({ title: 'Grade the midterms' });
    expect(parseQuick('   ', areas, today)).toBeNull();
    expect(parseQuick('#cide !', areas, today)).toBeNull();
  });

  it('reads the marks anywhere in the line', () => {
    expect(parseQuick('Grade midterms #cide ! >fri *hard', areas, today))
      .toEqual({ title: 'Grade midterms', areaId: 'a0', priority: 1, dueDate: '2026-11-13', difficulty: 4 });
    expect(parseQuick('#free send the proposal >tomorrow', areas, today))
      .toEqual({ title: 'send the proposal', areaId: 'a2', dueDate: '2026-11-11' });
    expect(parseQuick('read paper !later *1', areas, today)).toEqual({ title: 'read paper', priority: 3, difficulty: 1 });
  });

  it('a mark that matches nothing stays in the title', () => {
    expect(parseQuick('fix issue #42 >soon *epic', areas, today)).toEqual({ title: 'fix issue #42 >soon *epic' });
    expect(parseQuick('2 > 1 and a * b', areas, today)).toEqual({ title: '2 > 1 and a * b' });
  });

  it('matches areas by short name, then by a word of the name, ignoring accents', () => {
    expect(matchArea('ai', areas)?.id).toBe('a3');
    expect(matchArea('weav', areas)?.id).toBe('a1');
    expect(matchArea('economia', areas)?.id).toBe('a0');
    expect(matchArea('zzz', areas)).toBeUndefined();
  });

  it('reads dates from today', () => {
    expect(parseWhen('today', today)).toBe('2026-11-10');
    expect(parseWhen('tue', today)).toBe('2026-11-17'); // never today
    expect(parseWhen('monday', today)).toBe('2026-11-16');
    expect(parseWhen('20', today)).toBe('2026-11-20');
    expect(parseWhen('5', today)).toBe('2026-12-05');
    expect(parseWhen('31', '2026-12-31')).toBe('2026-12-31');
    expect(parseWhen('5', '2026-12-31')).toBe('2027-01-05');
    expect(parseWhen('12-05', today)).toBe('2026-12-05');
    expect(parseWhen('01-15', today)).toBe('2027-01-15');
    expect(parseWhen('2026-02-30', today)).toBeUndefined();
    expect(parseWhen('31', '2026-11-30')).toBe('2026-12-31');
    expect(parseWhen('money', today)).toBeUndefined();
  });

  it('a pasted list becomes one quest per line', () => {
    const got = parseQuickLines('- Grade quizzes #cide\n\n[ ] Invoice Weaving #weav !\n2. Call the accountant', areas, today);
    expect(got).toEqual([
      { title: 'Grade quizzes', areaId: 'a0' },
      { title: 'Invoice Weaving', areaId: 'a1', priority: 1 },
      { title: 'Call the accountant' }
    ]);
  });
});
