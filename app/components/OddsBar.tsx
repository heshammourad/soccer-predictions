import React from 'react';
import type { MatchOdds } from '../lib/matchOdds';

const oneDecimal = (p: number) => `${(p * 100).toFixed(1)}%`;

// Space kept between neighbouring labels.
const LABEL_GAP = '0.75rem';

// A match's home/draw/away chances as one bar split in proportion, with the
// home share's percentage flush left, the away share's flush right and the
// draw's centred under its segment.
export default function OddsBar({ odds, homeName, awayName }: { odds: MatchOdds; homeName: string; awayName: string }) {
  const [home, draw, away] = [odds.homeWin, odds.draw, odds.awayWin].map(oneDecimal);
  const drawCentre = (odds.homeWin + odds.draw / 2) * 100;
  // The labels are monospaced, so a label is as many ch wide as it has
  // characters: the draw label slides off its segment's centre only as far as
  // it must to clear the other two.
  const drawLeft = `clamp(${home.length}ch + ${LABEL_GAP}, ${drawCentre}% - ${draw.length / 2}ch, 100% - ${away.length + draw.length}ch - ${LABEL_GAP})`;

  return (
    <div
      role="img"
      aria-label={`${homeName} ${home}, draw ${draw}, ${awayName} ${away}`}
    >
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="bg-indigo-400" style={{ width: `${odds.homeWin * 100}%` }} />
        <div className="bg-slate-500" style={{ width: `${odds.draw * 100}%` }} />
        <div className="bg-rose-400" style={{ width: `${odds.awayWin * 100}%` }} />
      </div>
      <div className="relative mt-1 h-4 whitespace-nowrap font-mono text-[11px]" aria-hidden="true">
        <span className="absolute left-0 text-indigo-300">{home}</span>
        <span className="absolute text-slate-400" style={{ left: drawLeft }}>
          {draw}
        </span>
        <span className="absolute right-0 text-rose-300">{away}</span>
      </div>
    </div>
  );
}
