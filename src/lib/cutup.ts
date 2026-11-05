// Burroughs/Gysin cut-up: slice your day's words into fragments and reassemble them into a poem.
// Pure + seeded so the same seed gives the same poem (testable).

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'my', 'with', 'by', 'at', 'from', 'all', 'this', 'that', 'is', 'it', '1', '3', '5']);

/** Fragments of 1–3 words from the given lines. */
export function fragments(lines: string[]) {
  const out: string[] = [];
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
    for (let i = 0; i < words.length; i += 2) out.push(words.slice(i, i + 1 + (i % 3 === 0 ? 1 : 0)).join(' '));
  }
  return out.filter(Boolean);
}

const GLUE = ['', '', '—', '&', 'like', 'under', 'into', 'beyond', 'without', 'the road of', 'dreaming of'];

export function cutUp(lines: string[], seed: number, nLines = 4): string[] {
  const rand = mulberry32(seed);
  const pool = fragments(lines.length ? lines : ['the road is life', 'first thought best thought', 'marble light', 'pink sky']);
  if (!pool.length) return [];
  const pick = () => pool[Math.floor(rand() * pool.length)];
  return Array.from({ length: nLines }, () => {
    const glue = GLUE[Math.floor(rand() * GLUE.length)];
    return [pick(), glue, pick()].filter(Boolean).join(' ');
  });
}
