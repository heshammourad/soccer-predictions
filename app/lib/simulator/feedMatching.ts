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

// eloratings.net can publish a neutral-venue result with the teams the other
// way round from its fixture (fixture Lesotho v Niger in Ghana, result Niger
// 2-1 Lesotho in Ghana). At a neutral venue neither side is at home, so the
// order means nothing: a feed row played at a neutral venue may also claim a
// neutral-venue row for the reversed pair. Home-and-away rows never swap, as
// either the feed row or the existing row names one team's own ground.
const isNeutral = (location: string | null, home: string, away: string) =>
  location !== null && location !== home && location !== away;

export function feedRowCandidates<T extends { homeTeamId: string; awayTeamId: string; location: string | null }>(
  matches: T[],
  home: string,
  away: string,
  location: string | null
): T[] {
  const neutral = isNeutral(location, home, away);
  return matches.filter(
    (m) =>
      (m.homeTeamId === home && m.awayTeamId === away) ||
      (neutral && m.homeTeamId === away && m.awayTeamId === home && isNeutral(m.location, away, home))
  );
}

// eloratings.net also re-publishes upcoming fixtures with a new venue, and the
// home/away order can flip with it: Lesotho v Gabon in Lesotho became Gabon v
// Lesotho in South Africa, Belize v St Vincent in French Guiana became St
// Vincent v Belize in St Vincent. Neither side of such a change need be at a
// neutral venue, so feedRowCandidates can't pair them.
//
// planPairFixtures matches every fixtures-feed row for one pair of teams in one
// tournament at once. First each row claims the closest same-order (or
// neutral-reversed) row, as before; only then does a row left without one take
// the closest unclaimed unplayed row of the pair in either order, so a moved
// fixture can't take the row another feed row matches exactly. Unplayed rows of
// the pair that no feed row claimed and that are still to be played (after
// `now`) are stale: the feed has replaced them. An unplayed row dated in the
// past is kept, since it may be a played match whose result hasn't been
// published yet.
//
// A fixture row only claims a played match within PLAYED_MATCH_WINDOW_MS of
// its date: that's the feed still listing a match it has the result of. A
// played match further away is an earlier meeting (French Guiana v St Vincent
// in September), not the fixture it moved from (St Vincent v French Guiana,
// formerly French Guiana's home match).
export type FixtureFeedRow = { home: string; away: string; date: Date; location: string | null };

const PLAYED_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type PairMatch = {
  id: number;
  date: Date;
  homeTeamId: string;
  awayTeamId: string;
  location: string | null;
  homeGoals: number | null;
};

export function planPairFixtures<T extends PairMatch>(
  rows: FixtureFeedRow[],
  existing: T[],
  now: Date
): { matched: (T | null)[]; stale: T[] } {
  const claimed = new Set<number>();
  const matched = rows.map((row) =>
    pickMatchForFeedRow(
      feedRowCandidates(existing, row.home, row.away, row.location).filter(
        (m) => m.homeGoals === null || Math.abs(m.date.getTime() - row.date.getTime()) <= PLAYED_MATCH_WINDOW_MS
      ),
      row.date,
      claimed
    )
  );
  const unplayed = existing.filter((m) => m.homeGoals === null);
  rows.forEach((row, i) => {
    if (!matched[i]) matched[i] = pickMatchForFeedRow(unplayed, row.date, claimed);
  });
  const stale = unplayed.filter((m) => !claimed.has(m.id) && m.date.getTime() > now.getTime());
  return { matched, stale };
}
