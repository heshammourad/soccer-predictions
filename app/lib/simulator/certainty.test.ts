import { describe, expect, it } from 'vitest';
import { computeCertainty, CertaintyInput, KnockoutMatch } from './certainty';
import { MatchStats, RankingMatch, rankGroup } from './ranking';
import { CAF_TIEBREAKERS, FIFA_TIEBREAKERS } from './config/base';

const played = (home: string, away: string, homeGoals: number, awayGoals: number): RankingMatch => ({
  homeTeamId: home, awayTeamId: away, homeGoals, awayGoals,
});
const unplayed = (home: string, away: string): RankingMatch => ({ homeTeamId: home, awayTeamId: away, homeGoals: null, awayGoals: null });

function certainty(overrides: Partial<CertaintyInput> & Pick<CertaintyInput, 'rules' | 'groups'>) {
  const teamIds = overrides.teamIds ?? Object.values(overrides.groups).flat();
  return computeCertainty({
    milestones: Object.keys(overrides.rules),
    groupRules: FIFA_TIEBREAKERS,
    teamIds,
    groupMatches: [],
    knockoutMatches: [],
    knockoutStages: [],
    ...overrides,
  });
}

describe('ranking with outcome-only matches', () => {
  const rank = (matches: RankingMatch[]) =>
    rankGroup(FIFA_TIEBREAKERS, ['A', 'B'], new MatchStats(matches)).map((block) => [...block].sort());

  it('leaves two teams unresolved when a win could overturn the first meeting on head-to-head goal difference', () => {
    // A won 1-0; B winning the return leaves them level on points and
    // head-to-head points, and B's unknown margin could put either ahead.
    expect(rank([played('A', 'B', 1, 0), { ...unplayed('B', 'A'), outcome: 'H' }])).toEqual([['A', 'B']]);
  });

  it('decides it when the return is a draw, which adds nothing to goal difference', () => {
    expect(rank([played('A', 'B', 1, 0), { ...unplayed('B', 'A'), outcome: 'D' }])).toEqual([['A'], ['B']]);
  });

  it('decides a points tie on head-to-head points whatever the scores', () => {
    // A beat B twice; each beat C twice except that C beat A once, so A and B
    // finish on 9 points and A takes the head-to-head.
    const matches: RankingMatch[] = [
      { ...unplayed('A', 'B'), outcome: 'H' }, { ...unplayed('B', 'A'), outcome: 'A' },
      { ...unplayed('A', 'C'), outcome: 'H' }, { ...unplayed('C', 'A'), outcome: 'H' },
      { ...unplayed('B', 'C'), outcome: 'H' }, { ...unplayed('C', 'B'), outcome: 'A' },
    ];
    expect(rankGroup(FIFA_TIEBREAKERS, ['A', 'B', 'C'], new MatchStats(matches))).toEqual([['A'], ['B'], ['C']]);
  });
});

describe('computeCertainty: group positions', () => {
  const winGroup = { winGroup: { position: [1, 1] as [number, number] } };

  it('rules out a team 7 points behind with 2 matches left', () => {
    // Single round-robin of four: A has 9 points from three games; D has 0
    // from one, so at most 6.
    const groupMatches = [
      played('A', 'B', 1, 0), played('A', 'C', 1, 0), played('A', 'D', 1, 0),
      unplayed('B', 'C'), unplayed('B', 'D'), unplayed('C', 'D'),
    ];
    const table = certainty({ rules: winGroup, groups: { G: ['A', 'B', 'C', 'D'] }, groupMatches });
    expect(table.A.winGroup).toBe('CERTAIN');
    expect(table.D.winGroup).toBe('IMPOSSIBLE');
  });

  it('never proves a lead that only goal difference protects', () => {
    // A (8 pts, GD +20) has finished. B (5 pts) draws level by beating C
    // again, and A and B drew both meetings, so overall goal difference
    // decides, and B's margin against C has no upper limit.
    const groupMatches = [
      played('A', 'B', 1, 1), played('B', 'A', 1, 1),
      played('A', 'C', 10, 0), played('C', 'A', 0, 10),
      played('B', 'C', 1, 0),
      unplayed('C', 'B'),
    ];
    const table = certainty({ rules: winGroup, groups: { G: ['A', 'B', 'C'] }, groupMatches });
    expect(table.A.winGroup).toBeNull();
    expect(table.B.winGroup).toBeNull();
    expect(table.C.winGroup).toBe('IMPOSSIBLE');
  });

  it('decides nothing in a group that has not started', () => {
    const groupMatches = [unplayed('A', 'B'), unplayed('B', 'A')];
    const table = certainty({ rules: winGroup, groups: { G: ['A', 'B'] }, groupMatches });
    expect(table.A.winGroup).toBeNull();
    expect(table.B.winGroup).toBeNull();
  });

  it('reads a finished group exactly', () => {
    const groupMatches = [played('A', 'B', 2, 0), played('B', 'A', 0, 0)];
    const table = certainty({ rules: winGroup, groups: { G: ['A', 'B'] }, groupMatches });
    expect(table.A.winGroup).toBe('CERTAIN');
    expect(table.B.winGroup).toBe('IMPOSSIBLE');
  });

  it('leaves a tie drawn by lots undecided', () => {
    const groupMatches = [played('A', 'B', 1, 1), played('B', 'A', 1, 1)];
    const table = certainty({ rules: winGroup, groups: { G: ['A', 'B'] }, groupMatches });
    expect(table.A.winGroup).toBeNull();
  });

  it('gives automatic qualifiers their places first', () => {
    // H is a host, so X, Y and Z play for one place. X has 12 points with two
    // games left; Z (0 points, five left) can still reach 15 by beating X.
    const groupMatches = [
      played('X', 'H', 1, 0), played('X', 'Y', 1, 0), played('X', 'Z', 1, 0), played('H', 'X', 0, 1),
      played('H', 'Y', 1, 1), played('Y', 'H', 0, 0),
      unplayed('Y', 'X'), unplayed('Z', 'X'), unplayed('H', 'Z'), unplayed('Z', 'H'), unplayed('Y', 'Z'), unplayed('Z', 'Y'),
    ];
    const rules = { qualified: { top: 2, automatic: ['H'] } };
    const run = (matches: RankingMatch[]) =>
      certainty({ rules, groups: { G: ['H', 'X', 'Y', 'Z'] }, groupMatches: matches, groupRules: CAF_TIEBREAKERS });
    const replace = (matches: RankingMatch[], result: RankingMatch) =>
      matches.map((m) => (m.homeTeamId === result.homeTeamId && m.awayTeamId === result.awayTeamId ? result : m));

    const now = run(groupMatches);
    expect(now.H.qualified).toBe('CERTAIN');
    expect(now.X.qualified).toBeNull();
    // Y (2 points, three games left) can reach 11 at most.
    expect(now.Y.qualified).toBe('IMPOSSIBLE');

    // X beats Y (15 points). Z can still draw level on 15 by beating X, and a
    // head-to-head split with unknown margins decides.
    const afterY = replace(groupMatches, played('Y', 'X', 0, 1));
    expect(run(afterY)).toMatchObject({ X: { qualified: null }, Y: { qualified: 'IMPOSSIBLE' }, Z: { qualified: null } });

    // A draw with Z puts X out of reach (16 v 13 at most).
    expect(run(replace(afterY, played('Z', 'X', 0, 0)))).toMatchObject({
      H: { qualified: 'CERTAIN' }, X: { qualified: 'CERTAIN' }, Y: { qualified: 'IMPOSSIBLE' }, Z: { qualified: 'IMPOSSIBLE' },
    });
  });

  it('proves nothing but team conditions for a team outside the groups', () => {
    const rules = { quarterfinals: { any: [{ team: ['S'] }, { position: [1, 2] as [number, number] }] }, winGroup: { position: [1, 1] as [number, number] } };
    const table = certainty({ rules, groups: { G: ['A', 'B'] }, teamIds: ['A', 'B', 'S'] });
    expect(table.S).toEqual({ quarterfinals: 'CERTAIN', winGroup: 'IMPOSSIBLE' });
  });

  it('handles a whole double round-robin left to play after one match', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const all = ids.flatMap((h) => ids.filter((a) => a !== h).map((a) => unplayed(h, a)));
    all[0] = played('A', 'B', 3, 0);
    const started = Date.now();
    const table = certainty({ rules: winGroup, groups: { G: ids }, groupMatches: all });
    expect(Object.values(table).every((t) => t.winGroup === null)).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('computeCertainty: across groups', () => {
  // Three single-match "groups" of two; the best two runners-up go through.
  const rules = {
    through: { any: [{ position: [1, 1] as [number, number] }, { acrossGroups: { position: 2, groups: ['G1', 'G2', 'G3'], best: 2 } }] },
  };
  const groups = { G1: ['A1', 'B1'], G2: ['A2', 'B2'], G3: ['A3', 'B3'] };

  it('compares a finished runner-up against what the others could still get', () => {
    const table = certainty({
      rules,
      groups,
      groupMatches: [
        played('A1', 'B1', 1, 1), played('B1', 'A1', 0, 1), // B1: 1 pt, GD -1
        played('A2', 'B2', 0, 0), played('B2', 'A2', 0, 0), // level on everything: lots
        played('A3', 'B3', 5, 0), unplayed('B3', 'A3'), // B3: 0 pts, at most 3
      ],
    });
    expect(table.A1.through).toBe('CERTAIN');
    // G2's runner-up has 2 points, above B1's 1. G3's could finish on 0 or 1
    // points (below) or 3 (above), so B1 may be the second-best runner-up or
    // the third.
    expect(table.B1.through).toBeNull();
    // G2 is drawn by lots, but its runner-up (2 points) is through whichever
    // team it is: only G3's could be ahead of it.
    expect(table.A2.through).toBe('CERTAIN');
    expect(table.B2.through).toBe('CERTAIN');
  });

  it('eliminates a team that at least `best` other groups certainly beat', () => {
    const table = certainty({
      rules,
      groups,
      groupMatches: [
        played('A1', 'B1', 3, 0), played('B1', 'A1', 0, 3), // B1: 0 pts
        played('A2', 'B2', 1, 1), played('B2', 'A2', 1, 1), // runner-up on 2 pts
        played('A3', 'B3', 1, 0), played('B3', 'A3', 1, 1), // B3: 1 pt
      ],
    });
    expect(table.B1.through).toBe('IMPOSSIBLE');
    expect(table.B3.through).toBe('CERTAIN');
  });

  it('treats a group that has not started as able to beat anyone, but certain to beat no one', () => {
    const table = certainty({
      rules,
      groups,
      groupMatches: [
        played('A1', 'B1', 3, 0), played('B1', 'A1', 0, 3),
        played('A2', 'B2', 1, 1), played('B2', 'A2', 1, 1),
        unplayed('A3', 'B3'), unplayed('B3', 'A3'),
      ],
    });
    expect(table.B1.through).toBeNull();
  });
});

describe('computeCertainty: knockout stages', () => {
  const ko = (date: string, home: string, away: string, homeGoals: number | null, awayGoals: number | null, winnerOverride?: string): KnockoutMatch => ({
    date: new Date(date), homeTeamId: home, awayTeamId: away, homeGoals, awayGoals, winnerOverride,
  });
  const base = {
    // Four teams go straight to two-legged quarter-finals.
    rules: { quarterfinals: { team: ['A', 'B', 'C', 'D'] } },
    milestones: ['quarterfinals', 'semifinals', 'final', 'champions'],
    groups: {},
    teamIds: ['A', 'B', 'C', 'D'],
    knockoutStages: ['quarterfinals', 'semifinals', 'final', 'champions'],
    twoLeggedStages: ['quarterfinals'],
  };

  it('decides nothing from the first leg of a two-legged tie, however lopsided', () => {
    const table = certainty({ ...base, knockoutMatches: [ko('2027-03-20', 'A', 'B', 10, 0), ko('2027-03-24', 'B', 'A', null, null)] });
    expect(table.A.semifinals).toBeNull();
    expect(table.B.semifinals).toBeNull();
    expect(table.A.quarterfinals).toBe('CERTAIN');
  });

  it('settles a finished tie: the winner reaches the next stage, the loser nothing after', () => {
    const table = certainty({
      ...base,
      knockoutMatches: [ko('2027-03-20', 'A', 'B', 0, 1), ko('2027-03-24', 'B', 'A', 0, 2)],
    });
    expect(table.A.semifinals).toBe('CERTAIN');
    expect(table.A.final).toBeNull();
    expect(table.B).toMatchObject({ semifinals: 'IMPOSSIBLE', final: 'IMPOSSIBLE', champions: 'IMPOSSIBLE' });
  });

  it('applies away goals when the format uses them', () => {
    const knockoutMatches = [ko('2027-03-20', 'A', 'B', 2, 1), ko('2027-03-24', 'B', 'A', 1, 0)];
    expect(certainty({ ...base, knockoutMatches }).B.semifinals).toBeNull(); // penalties, winner unknown
    expect(certainty({ ...base, knockoutMatches, awayGoalsRule: true }).B.semifinals).toBe('CERTAIN');
  });

  it('finds a shoot-out winner from the recorded override or from who played on', () => {
    const qf = [ko('2027-03-20', 'A', 'B', 1, 0), ko('2027-03-24', 'B', 'A', 1, 0)];
    expect(certainty({ ...base, knockoutMatches: [...qf.slice(0, 1), { ...qf[1], winnerOverride: 'B' }] }).B.semifinals).toBe('CERTAIN');
    const table = certainty({ ...base, knockoutMatches: [...qf, ko('2027-06-09', 'B', 'D', null, null)] });
    expect(table.B.semifinals).toBe('CERTAIN');
    expect(table.A.semifinals).toBe('IMPOSSIBLE');
  });

  it('follows a team through the rounds and ignores a third-place match', () => {
    const knockoutMatches = [
      ko('2027-03-20', 'A', 'B', 1, 0), ko('2027-03-24', 'B', 'A', 0, 0),
      ko('2027-03-20', 'C', 'D', 0, 0), ko('2027-03-24', 'D', 'C', 0, 3),
      ko('2027-06-09', 'A', 'C', 2, 1),
      ko('2027-06-12', 'B', 'C', 0, 1), // third-place match (not a real pairing here, but a later tie for C)
      ko('2027-06-13', 'A', 'X', 1, 0),
    ];
    const table = certainty({ ...base, knockoutMatches });
    expect(table.A).toMatchObject({ semifinals: 'CERTAIN', final: 'CERTAIN', champions: 'CERTAIN' });
    expect(table.C).toMatchObject({ semifinals: 'CERTAIN', final: 'IMPOSSIBLE', champions: 'IMPOSSIBLE' });
  });

  it('rules out every knockout stage for a team that cannot enter the knockout phase', () => {
    const table = certainty({
      ...base,
      rules: { quarterfinals: { position: [1, 1] } },
      groups: { G: ['A', 'B'] },
      teamIds: ['A', 'B'],
      groupMatches: [played('A', 'B', 1, 0), played('B', 'A', 0, 1)],
    });
    expect(table.B).toEqual({ quarterfinals: 'IMPOSSIBLE', semifinals: 'IMPOSSIBLE', final: 'IMPOSSIBLE', champions: 'IMPOSSIBLE' });
    expect(table.A.semifinals).toBeNull();
  });
});

describe('computeCertainty: playoffs between leagues', () => {
  const ko = (date: string, home: string, away: string, homeGoals: number, awayGoals: number): KnockoutMatch => ({
    date: new Date(date), homeTeamId: home, awayTeamId: away, homeGoals, awayGoals,
  });
  // L1 (league 1) finished second in its group and plays H (league above).
  const input = {
    rules: { promoted: { any: [{ position: [1, 1] as [number, number] }, { all: [{ position: [2, 2] as [number, number] }, { playoff: 'won' as const }] }] } },
    groups: { G: ['W', 'L1'] },
    teamIds: ['W', 'L1'],
    groupMatches: [played('W', 'L1', 1, 0), played('L1', 'W', 0, 1)],
    sameLeague: (a: string, b: string) => (a === 'H') === (b === 'H'),
  };

  it('is open until both legs are played', () => {
    const table = certainty({ ...input, knockoutMatches: [ko('2027-03-20', 'L1', 'H', 3, 0)] });
    expect(table.L1.promoted).toBeNull();
    expect(table.W.promoted).toBe('CERTAIN');
  });

  it('follows the playoff result', () => {
    const won = certainty({ ...input, knockoutMatches: [ko('2027-03-20', 'L1', 'H', 3, 0), ko('2027-03-24', 'H', 'L1', 1, 0)] });
    expect(won.L1.promoted).toBe('CERTAIN');
    const lost = certainty({ ...input, knockoutMatches: [ko('2027-03-20', 'L1', 'H', 0, 0), ko('2027-03-24', 'H', 'L1', 1, 0)] });
    expect(lost.L1.promoted).toBe('IMPOSSIBLE');
  });
});
