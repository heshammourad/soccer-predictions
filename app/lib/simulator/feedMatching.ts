// Matching eloratings.net feed rows to existing Match rows.
//
// Rows are keyed by (tournament, home, away), which is unique within a double
// round-robin league phase -- except that the feed publishes some pairs twice
// with the same home/away order (one row per meeting): Africa Cup qualifiers
// (Sep 2026 and Mar 2027) and Nations League B/C (e.g. Albania v Belarus on
// 26 Sep and 15 Nov, only 50 days apart). The feed is taken as given, so the
// two rows must stay two matches.
//
// Within one sync pass every feed row claims the closest still-unclaimed
// existing row for its pair, so two feed rows can never collapse onto the same
// Match, however close their dates are. A row with no unclaimed candidate is a
// new match (and repairs a database where an earlier sync had merged the two).
export function pickMatchForFeedRow<T extends { id: number; date: Date }>(
  candidates: T[],
  date: Date,
  claimed: Set<number>
): T | null {
  let best: T | null = null;
  let bestGap = Infinity;
  for (const candidate of candidates) {
    if (claimed.has(candidate.id)) continue;
    const gap = Math.abs(candidate.date.getTime() - date.getTime());
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  if (best) claimed.add(best.id);
  return best;
}
