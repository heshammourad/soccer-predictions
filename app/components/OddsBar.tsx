import React from 'react';
import type { MatchOdds } from '../lib/matchOdds';

const oneDecimal = (p: number) => `${(p * 100).toFixed(1)}%`;

// A match's home/draw/away chances as one bar split in proportion, each
// share's percentage under its segment.
export default function OddsBar({ odds, homeName, awayName }: { odds: MatchOdds; homeName: string; awayName: string }) {
  const shares = [odds.homeWin, odds.draw, odds.awayWin];
  return (
    <div
      role="img"
      aria-label={`${homeName} ${oneDecimal(odds.homeWin)}, draw ${oneDecimal(odds.draw)}, ${awayName} ${oneDecimal(odds.awayWin)}`}
    >
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="bg-indigo-400" style={{ width: `${odds.homeWin * 100}%` }} />
        <div className="bg-slate-500" style={{ width: `${odds.draw * 100}%` }} />
        <div className="bg-rose-400" style={{ width: `${odds.awayWin * 100}%` }} />
      </div>
      {/* Columns sized like the segments, but never narrower than their label,
          so a small share's label doesn't run into its neighbour's. */}
      <div
        className="mt-1 grid gap-2 font-mono text-[11px]"
        style={{ gridTemplateColumns: shares.map((p) => `${p}fr`).join(' ') }}
        aria-hidden="true"
      >
        <span className="text-indigo-300">{oneDecimal(odds.homeWin)}</span>
        <span className="text-slate-400">{oneDecimal(odds.draw)}</span>
        <span className="text-right text-rose-300">{oneDecimal(odds.awayWin)}</span>
      </div>
    </div>
  );
}
