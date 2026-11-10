import { useEffect, useState } from 'react';

// The colonnade, drawn the way Doric columns are built: a shaft that narrows upward with a slight swell (entasis),
// twenty flutes of which ten face you, bunching toward the edges as they turn away, drums stacked with visible
// joints, a necking, the cushion (echinus) and the square slab (abacus), under an architrave and a triglyph frieze.
// Light comes from the upper left, so every flute is dark on its left wall and lit on its right.
const BAY = 300, COL_X = 44, R_LOW = 27, R_TOP = 21.5, SHAFT_TOP = 118, WALL_TOP = 118;
/** The ten visible flute edges (arrises), by angle around the shaft. */
const ARRISES = Array.from({ length: 9 }, (_, k) => {
  const t = ((-72 + k * 18) * Math.PI) / 180;
  return { top: COL_X + R_TOP * Math.sin(t), low: COL_X + R_LOW * Math.sin(t), facing: Math.cos(t) };
});

function Column({ end }: { end: number }) {
  const SHAFT_END = end;
  const drums = Array.from({ length: Math.max(0, Math.floor((end - 150) / 76)) }, (_, i) => 190 + i * 76);
  return (
    <g>
      {/* its shadow on the wall behind, falling right */}
      <path d={`M${COL_X + 10} ${SHAFT_TOP - 30}h30v${SHAFT_END - SHAFT_TOP + 30}h-30z`} fill="#2b3437" opacity=".13" filter="url(#soft)" />
      <path d={`M${COL_X - R_LOW} ${SHAFT_END}C${COL_X - R_LOW} ${end * 0.74} ${COL_X - R_TOP - 1.5} ${end * 0.45} ${COL_X - R_TOP} ${SHAFT_TOP}h${R_TOP * 2}C${COL_X + R_TOP + 1.5} ${end * 0.45} ${COL_X + R_LOW} ${end * 0.74} ${COL_X + R_LOW} ${SHAFT_END}z`} fill="url(#shaft)" />
      {ARRISES.map((a, i) => (
        <g key={i} strokeLinecap="butt">
          <path d={`M${a.top + 1.1} ${SHAFT_TOP}L${a.low + 1.4} ${SHAFT_END}`} stroke="#4a4436" strokeOpacity={0.3 * a.facing + 0.06} strokeWidth={2.4 * a.facing + 0.5} />
          <path d={`M${a.top - 0.8} ${SHAFT_TOP}L${a.low - 1} ${SHAFT_END}`} stroke="#fffdf6" strokeOpacity={0.75 * a.facing} strokeWidth={1.3 * a.facing + 0.2} />
        </g>
      ))}
      {drums.map(y => <path key={y} d={`M${COL_X - R_LOW} ${y}q${R_LOW} 3.5 ${R_LOW * 2} 0`} fill="none" stroke="#3d382c" strokeOpacity=".2" strokeWidth=".9" />)}
      {/* necking rings, echinus, abacus */}
      <path d={`M${COL_X - R_TOP} ${SHAFT_TOP + 5}q${R_TOP} 3 ${R_TOP * 2} 0M${COL_X - R_TOP} ${SHAFT_TOP + 1.5}q${R_TOP} 3 ${R_TOP * 2} 0`} fill="none" stroke="#3d382c" strokeOpacity=".4" strokeWidth="1" />
      <path d={`M${COL_X - R_TOP} ${SHAFT_TOP}c0-7-10.5-9-11-15h${R_TOP * 2 + 22}c-.5 6-11 8-11 15z`} fill="url(#shaft)" />
      <path d={`M${COL_X - R_TOP} ${SHAFT_TOP}q${R_TOP} 3.5 ${R_TOP * 2} 0`} fill="none" stroke="#3d382c" strokeOpacity=".3" />
      <rect x={COL_X - R_TOP - 13} y={SHAFT_TOP - 28} width={R_TOP * 2 + 26} height="13" fill="url(#slab)" />
      <rect x={COL_X - R_TOP - 13} y={SHAFT_TOP - 16.5} width={R_TOP * 2 + 26} height="2.5" fill="#3d382c" opacity=".22" />
    </g>
  );
}

/** One triglyph of the frieze: three uprights between two grooves and two half-grooves. */
const Triglyph = ({ x }: { x: number }) => (
  <g>
    <rect x={x - 13} y="40" width="26" height="26" fill="#e6e0d2" />
    <path d={`M${x - 8.5} 43v23M${x} 43v23M${x + 8.5} 43v23`} stroke="#3d382c" strokeOpacity=".32" strokeWidth="2.6" />
    <path d={`M${x - 7} 43v23M${x + 1.5} 43v23M${x + 10} 43v23`} stroke="#fffdf6" strokeOpacity=".7" strokeWidth="1" />
  </g>
);

/**
 * Where the tiled floor's far edge sits on screen, in px from the top. The floor is `.thermae-floor` in index.css:
 * 18vh deep, tipped back 55 degrees under a 300 px perspective, its near edge 9vh above the bottom. Keep in step.
 */
function floorTop(vh: number) {
  const depth = 0.18 * vh;
  return vh - 0.09 * vh - (depth * 0.574 * 300) / (300 + depth * 0.819);
}

function useViewport() {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/**
 * A colonnade in front of arches that open onto a pale sky: the far wall of the bathhouse. The columns stand on
 * the floor on every screen: a taller screen gets larger columns (up to 1.4 times) and then taller shafts.
 */
export default function Colonnade() {
  const { w, h } = useViewport();
  const tall = Math.max(320, floorTop(h) - WALL_TOP + 2);
  const scale = Math.min(1.4, Math.max(1, tall / 500));
  const H = tall / scale; // the wall's height in the drawing's own units
  return (
    <svg className="thermae-arches" width="100%" height={tall} aria-hidden>
      <defs>
        <linearGradient id="dreamsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9d8e4" /><stop offset=".55" stopColor="#e3eee9" /><stop offset="1" stopColor="#f6f1e4" />
        </linearGradient>
        {/* a cylinder of warm marble lit from the left */}
        <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9b19e" /><stop offset=".1" stopColor="#ddd6c6" /><stop offset=".34" stopColor="#fbf8f0" /><stop offset=".6" stopColor="#ece6d8" /><stop offset=".88" stopColor="#c0b8a5" /><stop offset="1" stopColor="#9d9583" />
        </linearGradient>
        <linearGradient id="slab" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf8f0" /><stop offset=".7" stopColor="#e6dfd0" /><stop offset="1" stopColor="#c9c1af" />
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f3ea" /><stop offset=".8" stopColor="#e9e3d5" /><stop offset="1" stopColor="#d3ccbb" />
        </linearGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        {/* faint veins and weathering, kept inside whatever it is applied to */}
        <filter id="vein" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".035 .009" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .2  0 0 0 -1.1 .62" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode /></feMerge>
        </filter>
        <pattern id="arcade" width={BAY} height={H} patternUnits="userSpaceOnUse">
          {/* the opening: the wall's thickness shows on the left, in shade */}
          <path d={`M104 ${H}V214a80 80 0 0 1 160 0V${H}z`} fill="#c3ccc6" />
          <path d={`M113 ${H}V214a75.5 80 0 0 1 151 0V${H}z`} fill="url(#dreamsky)" />
          <g filter="url(#soft)" fill="#fff" opacity=".9">
            <ellipse cx="168" cy="200" rx="38" ry="10" /><ellipse cx="223" cy="262" rx="30" ry="8" /><ellipse cx="158" cy="330" rx="26" ry="7" />
          </g>
          <path d={`M104 ${H}V214a80 80 0 0 1 160 0V${H}`} fill="none" stroke="#2b3437" strokeOpacity=".22" strokeWidth="1.5" />
          {/* cornice, frieze, architrave */}
          <rect y="24" width={BAY} height="10" fill="url(#beam)" />
          <rect y="34" width={BAY} height="5" fill="#3d382c" opacity=".2" />
          <rect y="39" width={BAY} height="28" fill="#f1ecdf" />
          <Triglyph x={COL_X} /><Triglyph x={COL_X + BAY / 2} />
          <rect y="66" width={BAY} height="3.5" fill="#f9f6ee" />
          <rect y="69.5" width={BAY} height="20.5" fill="url(#beam)" />
          <g filter="url(#vein)"><Column end={H - 7} /></g>
          {/* the step the columns stand on, where the wall meets the floor */}
          <rect y={H - 7} width={BAY} height="7" fill="url(#beam)" />
          <rect y={H - 7} width={BAY} height="1" fill="#3d382c" opacity=".25" />
        </pattern>
      </defs>
      <rect width={w / scale + 1} height={H} fill="url(#arcade)" transform={`scale(${scale})`} />
    </svg>
  );
}
