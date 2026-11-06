import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Fonts are self-hosted so the installed PWA works offline. These checks keep that true.
const css = readFileSync('src/index.css', 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('self-hosted fonts', () => {
  it('every @font-face file exists in public/fonts', () => {
    const urls = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(m => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(existsSync(join('public/fonts', u)), u).toBe(true);
  });

  it('nothing loads fonts from a CDN', () => {
    for (const f of ['index.html', 'src/index.css']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it('the DotGothic16 subset covers every CJK character used in src/', () => {
    const face = css.split('\n').find(l => l.includes("'DotGothic16'"));
    expect(face).toBeDefined();
    const covered = new Set(
      [...face!.matchAll(/U\+([0-9a-f]+)/gi)].map(m => String.fromCodePoint(parseInt(m[1], 16)))
    );
    const used = new Set<string>();
    for (const f of walk('src').filter(p => /\.(ts|tsx)$/.test(p))) {
      for (const ch of readFileSync(f, 'utf8').match(/[぀-ヿ㐀-鿿]/g) ?? []) used.add(ch);
    }
    const missing = [...used].filter(ch => !covered.has(ch));
    // If this fails: re-download the subset with the new characters (see public/fonts/LICENSES.md).
    expect(missing).toEqual([]);
  });
});
