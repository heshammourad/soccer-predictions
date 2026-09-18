// Matching eloratings.net feed rows to existing Match rows.
//
// Rows are keyed by (tournament, home, away), which is unique within a double
// round-robin league phase -- except that a few Africa Cup qualifier pairs are
// published twice with the same home/away order (e.g. one in Sep 2026, one in
// Mar 2027). The feed is taken as given, so such rows are told apart by date: the closest row wins, provided it
// is near enough to be a reschedule of the same fixture rather than the other
// meeting of the pair.
export const MAX_RESCHEDULE_MS = 60 * 24 * 60 * 60 * 1000;

export function pickMatchForFeedRow<T extends { date: Date }>(candidates: T[], date: Date): T | null {
  let best: T | null = null;
  let bestGap = Infinity;
  for (const candidate of candidates) {
    const gap = Math.abs(candidate.date.getTime() - date.getTime());
    if (gap <= MAX_RESCHEDULE_MS && gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}
