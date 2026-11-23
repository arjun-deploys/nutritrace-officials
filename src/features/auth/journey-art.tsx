import { useEffect, useState } from 'react';
import { CUSTODY_STAGES } from '@nt/domain';
import { STAGE_LABEL } from '@/components/shared/custody-ribbon';

/** Stage ramp as literal colours (SVG gradients cannot read CSS variables). Grain brown → leaf green. */
const HEX = ['#8a6a2f', '#a87a1e', '#8b8a2c', '#5e8c3a', '#2f7a55', '#3f9a72'];

const TOP = 72;
const BOTTOM = 148;
const X0 = 70;
const STEP = 124;

/** The food's path from supplier to plate, drawn as one line with six custody stops. A single grain travels it. */
export function JourneyArt({ className }: { className?: string }) {
  const [motion, setMotion] = useState(false);
  useEffect(
    () => setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    [],
  );
  // Wave of stops, left to right. The path leaves each stop horizontally; labels sit on the
  // outside of the wave (above the high stops, below the low ones) so they never touch the line.
  const pts = CUSTODY_STAGES.map((_, i) => [X0 + i * STEP, i % 2 === 0 ? TOP : BOTTOM] as const);
  const d = `M ${pts[0]![0]} ${pts[0]![1]} ${pts
    .slice(1)
    .map((p, i) => {
      const prev = pts[i]!;
      const dx = (p[0] - prev[0]) * 0.55;
      return `C ${prev[0] + dx} ${prev[1]}, ${p[0] - dx} ${p[1]}, ${p[0]} ${p[1]}`;
    })
    .join(' ')}`;
  const last = pts[pts.length - 1]!;

  return (
    <svg
      viewBox="0 0 760 220"
      className={className}
      role="img"
      aria-label="Six custody stages from source to meal served"
    >
      <defs>
        <linearGradient id="nt-path" x1="0" y1="0" x2="1" y2="0">
          {CUSTODY_STAGES.map((s, i) => (
            <stop key={s} offset={`${(i / (CUSTODY_STAGES.length - 1)) * 100}%`} stopColor={HEX[i]} />
          ))}
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="18" strokeLinecap="round" />
      <path id="nt-journey" d={d} fill="none" stroke="url(#nt-path)" strokeWidth="4" strokeLinecap="round" />
      {pts.map(([x, y], i) => {
        const s = CUSTODY_STAGES[i]!;
        const above = y === TOP;
        return (
          <g key={s}>
            <circle cx={x} cy={y} r="13" fill="#12302a" stroke={HEX[i]} strokeWidth="3" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              {i + 1}
            </text>
            <text
              x={x}
              y={above ? y - 28 : y + 44}
              textAnchor="middle"
              fontSize="15"
              fill="rgba(255,255,255,0.88)"
            >
              {STAGE_LABEL[s]}
            </text>
          </g>
        );
      })}
      <circle
        r="7"
        fill="#d99a1e"
        stroke="#12302a"
        strokeWidth="2"
        cx={motion ? undefined : last[0]}
        cy={motion ? undefined : last[1]}
      >
        {motion && (
          <animateMotion
            dur="7s"
            repeatCount="indefinite"
            keyPoints="0;1;1"
            keyTimes="0;0.8;1"
            calcMode="linear"
            path={d}
          />
        )}
      </circle>
    </svg>
  );
}