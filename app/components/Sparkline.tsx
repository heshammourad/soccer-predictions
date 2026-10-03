import React from 'react';

export interface SparklinePoint {
  // The milestone run's name and its formatted probability, for the hover text.
  label: string;
  text: string;
  // Null when the run has no prediction for this team.
  value: number | null;
}

interface Props {
  points: SparklinePoint[];
  // Top of the y-axis, shared by every row so the lines compare across teams.
  max: number;
  // The run the table is showing, marked with a larger dot.
  activeIndex: number;
}

const WIDTH = 96;
const HEIGHT = 28;
const PAD = 3;

// A team's probability of one milestone across the simulation runs, oldest
// milestone first. Points are evenly spaced, one per run.
export default function Sparkline({ points, max, activeIndex }: Props) {
  const step = points.length > 1 ? (WIDTH - 2 * PAD) / (points.length - 1) : 0;
  const x = (i: number) => PAD + i * step;
  const y = (v: number) => HEIGHT - PAD - (max > 0 ? v / max : 0) * (HEIGHT - 2 * PAD);
  const plotted = points.map((p, i) => ({ ...p, i })).filter((p): p is SparklinePoint & { i: number; value: number } => p.value !== null);
  const summary = points.map((p) => `${p.label}: ${p.text}`).join('\n');
  const active = plotted.find((p) => p.i === activeIndex);

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} className="mx-auto block">
      <title>{summary}</title>
      <line x1={PAD} x2={WIDTH - PAD} y1={HEIGHT - PAD} y2={HEIGHT - PAD} className="stroke-slate-800" strokeWidth={1} />
      <polyline
        points={plotted.map((p) => `${x(p.i)},${y(p.value)}`).join(' ')}
        fill="none"
        className="stroke-indigo-400"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {active && <circle cx={x(active.i)} cy={y(active.value)} r={2.75} className="fill-indigo-300" />}
    </svg>
  );
}
