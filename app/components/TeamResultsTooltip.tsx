'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFlagUrl } from '../lib/simulator/config/confederations';
import type { TeamResult } from '../lib/teamResults';

const WIDTH = 300;
const ROW_HEIGHT = 24;
const MARGIN = 8;

const OUTCOME_STYLES: Record<TeamResult['outcome'], string> = {
  W: 'bg-emerald-500 text-slate-950',
  D: 'bg-slate-500 text-slate-950',
  L: 'bg-rose-500 text-white',
};

interface Props {
  teamName: string;
  results: TeamResult[];
  children: React.ReactNode;
}

// Wraps a team's name in the projections table: hovering it (or tapping it, or
// pressing Enter on it) lists the team's results in this tournament. Rendered
// into document.body with fixed positioning, since the table sits in an
// overflow container (which would clip it) under a backdrop filter (which
// would re-anchor position: fixed).
export default function TeamResultsTooltip({ teamName, results, children }: Props) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastPointer = useRef<string | null>(null);
  const tooltipId = useId();

  const open = () => setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
  const close = () => setAnchor(null);

  // A fixed tooltip would drift from its row as the page or table scrolls, so
  // close it instead; a tap outside closes it on touch screens.
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onPointerDown = (e: PointerEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [anchor]);

  if (results.length === 0) return <span className="flex items-center gap-3">{children}</span>;

  let position: React.CSSProperties = {};
  if (anchor) {
    const height = 58 + results.length * ROW_HEIGHT;
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - WIDTH - MARGIN));
    position =
      anchor.bottom + height + MARGIN <= window.innerHeight
        ? { left, top: anchor.bottom + 6 }
        : { left, bottom: window.innerHeight - anchor.top + 6 };
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={anchor ? tooltipId : undefined}
        aria-expanded={anchor !== null}
        onPointerEnter={(e) => e.pointerType === 'mouse' && open()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && close()}
        onPointerDown={(e) => (lastPointer.current = e.pointerType)}
        onClick={() => {
          // A mouse already opened it on hover; a tap or Enter toggles it.
          if (lastPointer.current !== 'mouse') {
            if (anchor) close();
            else open();
          }
          lastPointer.current = null;
        }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onBlur={close}
        className="flex items-center gap-3 text-left cursor-default rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {children}
      </button>
      {anchor &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{ ...position, width: WIDTH }}
            className="fixed z-50 p-3 rounded-xl border border-slate-700 bg-slate-900/95 shadow-xl shadow-black/40 backdrop-blur text-xs text-slate-300 pointer-events-none"
          >
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {teamName} results
            </div>
            <ul className="space-y-1">
              {results.map((r) => (
                <li key={r.matchId} className="flex items-center gap-2 h-5">
                  <span className="w-11 shrink-0 font-mono text-slate-500">
                    {r.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="w-7 shrink-0 font-mono font-semibold text-slate-400">{r.stage}</span>
                  <span className="w-3 shrink-0 text-center text-slate-500">
                    {r.venue}
                  </span>
                  <span className="flex w-[22px] shrink-0 justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getFlagUrl(r.opponentId)}
                      alt=""
                      className="h-3 w-auto max-w-full rounded-sm border border-slate-800"
                    />
                  </span>
                  <span className="flex-1 truncate text-slate-200">{r.opponentName}</span>
                  <span className="shrink-0 font-mono font-semibold text-slate-100">
                    {r.goalsFor}-{r.goalsAgainst}
                  </span>
                  <span
                    className={`w-5 h-5 shrink-0 flex items-center justify-center rounded font-bold ${OUTCOME_STYLES[r.outcome]}`}
                  >
                    {r.outcome}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.isNew ? 'bg-sky-400' : ''}`}
                    aria-label={r.isNew ? 'New result' : undefined}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500">
              v home · @ away · n neutral venue
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
