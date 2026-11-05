import { EMOJI_TO_GLYPH, GLYPHS } from '@/components/glyphs';

/** Tables whose rows carried an `emoji` before schema v2. */
export const ICON_TABLES = ['areas', 'habits', 'rewards', 'goals'] as const;

const FALLBACK: Record<string, string> = { areas: 'column', habits: 'star', rewards: 'gift', goals: 'laurel' };

/** Mutates a row: converts legacy `emoji` into a glyph `icon`. Idempotent. */
export function legacyIcon(row: Record<string, unknown>, table: string) {
  if (typeof row.icon === 'string' && row.icon in GLYPHS) { delete row.emoji; return row; }
  const e = typeof row.emoji === 'string' ? row.emoji : '';
  row.icon = EMOJI_TO_GLYPH[e] ?? EMOJI_TO_GLYPH[e.replace(/\uFE0F/g, '')] ?? FALLBACK[table] ?? 'dot';
  delete row.emoji;
  return row;
}
