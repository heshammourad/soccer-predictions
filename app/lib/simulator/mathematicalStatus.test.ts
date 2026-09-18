import { describe, expect, it } from 'vitest';
import { calculateGroupTop2Status, SimpleMatch, SimpleTeam } from './mathematicalStatus';

const teams: SimpleTeam[] = ['H', 'X', 'Y', 'Z'].map((id) => ({ id, name: id, group: 'L' }));

const played = (home: string, away: string, homeGoals: number, awayGoals: number): SimpleMatch => ({
  homeTeamId: home,
  awayTeamId: away,
  homeGoals,
  awayGoals,
  isKnockout: false,
});
const unplayed = (home: string, away: string): SimpleMatch => ({ ...played(home, away, 0, 0), homeGoals: null, awayGoals: null });

// Double round-robin, split into what has been played and what remains.
function split(playedCount: number) {
  const ids = teams.map((t) => t.id);
  const all: [string, string][] = ids.flatMap((a) => ids.filter((b) => b !== a).map((b): [string, string] => [a, b]));
  return {
    results: all.slice(0, playedCount).map(([h, a]) => played(h, a, 0, 0)),
    fixtures: all.slice(playedCount).map(([h, a]) => unplayed(h, a)),
  };
}

describe('calculateGroupTop2Status with an automatic qualifier', () => {
  it('always guarantees the automatic qualifier and ranks the rest for a single place', () => {
    // X has won all 6 of its games (18 pts); H, Y and Z each have 0 after
    // the games below, with the last four matches left.
    const results = [
      played('X', 'H', 2, 0), played('X', 'Y', 2, 0), played('X', 'Z', 2, 0),
      played('H', 'X', 0, 2), played('Y', 'X', 0, 2), played('Z', 'X', 0, 2),
      played('H', 'Y', 1, 1), played('Z', 'H', 1, 1),
    ];
    const fixtures = [unplayed('Y', 'H'), unplayed('H', 'Z'), unplayed('Y', 'Z'), unplayed('Z', 'Y')];

    const status = calculateGroupTop2Status(teams, results, fixtures, { automaticQualifiers: ['H'] });
    expect(status.guaranteedProgress.has('H')).toBe(true);
    // X's 18 points can't be caught by Y or Z: with H taking the other
    // place, X is the single non-host qualifier.
    expect(status.guaranteedProgress.has('X')).toBe(true);
    expect(status.mathematicallyEliminated.has('Y')).toBe(true);
    expect(status.mathematicallyEliminated.has('Z')).toBe(true);
  });

  it('with no automatic qualifier the same table leaves a place open', () => {
    const results = [
      played('X', 'H', 2, 0), played('X', 'Y', 2, 0), played('X', 'Z', 2, 0),
      played('H', 'X', 0, 2), played('Y', 'X', 0, 2), played('Z', 'X', 0, 2),
      played('H', 'Y', 1, 1), played('Z', 'H', 1, 1),
    ];
    const fixtures = [unplayed('Y', 'H'), unplayed('H', 'Z'), unplayed('Y', 'Z'), unplayed('Z', 'Y')];

    const status = calculateGroupTop2Status(teams, results, fixtures);
    expect(status.guaranteedProgress.has('X')).toBe(true);
    expect(status.mathematicallyEliminated.size).toBe(0);
  });

  it('reports nothing decided for a group with more than maxRemainingPerGroup matches left', () => {
    const { results, fixtures } = split(2);
    const status = calculateGroupTop2Status(teams, results, fixtures, { maxRemainingPerGroup: 6 });
    expect(status.guaranteedProgress.size).toBe(0);
    expect(status.mathematicallyEliminated.size).toBe(0);
    expect(status.guaranteedWinGroup.size).toBe(0);
    expect(status.eliminatedWinGroup.size).toBe(0);
  });

  it('counts both meetings of a pair in the head-to-head tiebreak', () => {
    // A and B win every other game, so finish level on 15 points whatever
    // happens between C and D. A won 1-0 at home and B 2-0 at home: only the
    // aggregate (B +1, A -1) puts B first. Counting just the first meeting
    // would wrongly leave A as the sure group winner.
    const t: SimpleTeam[] = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, group: 'G' }));
    const results = [
      played('A', 'B', 1, 0), played('B', 'A', 2, 0),
      ...['C', 'D'].flatMap((x) => [
        played('A', x, 1, 0), played(x, 'A', 0, 1), played('B', x, 1, 0), played(x, 'B', 0, 1),
      ]),
    ];
    const status = calculateGroupTop2Status(t, results, [unplayed('C', 'D'), unplayed('D', 'C')]);
    expect(status.guaranteedWinGroup.has('B')).toBe(true);
    expect(status.eliminatedWinGroup.has('A')).toBe(true);
  });

  it('ranks by the overall record before head-to-head with sortRules overallFirst', () => {
    // A and B finish on 15 points, and B won the head-to-head on aggregate
    // (see the test above), but A has the better overall goal difference. With
    // overall-first rules A is the sure winner; head-to-head first says B.
    const t: SimpleTeam[] = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, group: 'G' }));
    const results = [
      played('A', 'B', 1, 0), played('B', 'A', 2, 0),
      ...['C', 'D'].flatMap((x) => [
        played('A', x, 5, 0), played(x, 'A', 0, 5), played('B', x, 1, 0), played(x, 'B', 0, 1),
      ]),
    ];
    const fixtures = [unplayed('C', 'D'), unplayed('D', 'C')];
    const overall = calculateGroupTop2Status(t, results, fixtures, { sortRules: 'overallFirst' });
    expect(overall.guaranteedWinGroup.has('A')).toBe(true);
    expect(overall.eliminatedWinGroup.has('B')).toBe(true);
    const h2h = calculateGroupTop2Status(t, results, fixtures);
    expect(h2h.guaranteedWinGroup.has('B')).toBe(true);
    expect(h2h.eliminatedWinGroup.has('A')).toBe(true);
  });
});
