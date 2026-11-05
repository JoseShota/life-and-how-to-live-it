import { describe, it, expect } from 'vitest';
import { cutUp, fragments } from '../src/lib/cutup';

describe('cut-up', () => {
  it('is deterministic for a seed', () => {
    const lines = ['Grade midterm exams', 'Ship automation case study', 'Exercise at dawn'];
    expect(cutUp(lines, 42)).toEqual(cutUp(lines, 42));
    expect(cutUp(lines, 42)).toHaveLength(4);
  });
  it('drops stop words and punctuation', () => {
    expect(fragments(['The road, of life!']).join(' ')).not.toMatch(/\bthe\b|,|!/);
  });
  it('falls back when there are no lines', () => {
    expect(cutUp([], 1).length).toBe(4);
  });
});
