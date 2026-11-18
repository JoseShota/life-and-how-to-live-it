import { describe, it, expect } from 'vitest';
import { busy } from '../src/lib/appUpdate';

// U-1: a new version reloads the page at once, unless that could lose something being typed.
describe('reloading for an update (pure)', () => {
  it('reloads when nothing is being edited', () => {
    expect(busy(null, false)).toBe(false);
    expect(busy({ tagName: 'BODY' }, false)).toBe(false);
    expect(busy({ tagName: 'BUTTON' }, false)).toBe(false);
  });
  it('waits while a field is focused or a sheet is open', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) expect(busy({ tagName }, false)).toBe(true);
    expect(busy({ tagName: 'DIV', isContentEditable: true }, false)).toBe(true);
    expect(busy({ tagName: 'BODY' }, true)).toBe(true);
  });
});
