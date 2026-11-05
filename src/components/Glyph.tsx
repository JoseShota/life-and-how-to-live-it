import type { ReactElement } from 'react';
import { GLYPHS } from './glyphs';

function shape(spec: string, i: number): ReactElement {
  const [k, ...rest] = spec.trim().split(/\s+/);
  const n = rest.map(Number);
  switch (k) {
    case 'C': return <circle key={i} cx={n[0]} cy={n[1]} r={n[2]} />;
    case 'F': return <circle key={i} cx={n[0]} cy={n[1]} r={n[2]} fill="currentColor" stroke="none" />;
    case 'E': return <ellipse key={i} cx={n[0]} cy={n[1]} rx={n[2]} ry={n[3]} />;
    case 'R': return <rect key={i} x={n[0]} y={n[1]} width={n[2]} height={n[3]} rx={n[4] ?? 0} />;
    case 'D': return <path key={i} d={rest.join(' ')} strokeDasharray="0.1 3.2" strokeWidth={2.4} />;
    default: return <path key={i} d={spec} />;
  }
}

/** Hand-drawn line icon. `name` falls back to a dot for unknown keys (e.g. old data). */
export function Glyph({ name, size = 20, className, stroke = 1.6, title }: { name: string; size?: number; className?: string; stroke?: number; title?: string }) {
  const spec = (GLYPHS as Record<string, string>)[name] ?? GLYPHS.dot;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {spec.split('|').map(shape)}
    </svg>
  );
}
