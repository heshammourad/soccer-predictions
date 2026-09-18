import { describe, expect, it } from 'vitest';
import { compareStats, sortGroupTeamsWithH2H, sortDoubleRoundRobinGroup, sortOverallThenH2H, rankAcrossGroups, CAF_TIEBREAKERS, H2HMatch } from './base';
import { TeamStats } from '../types';

function makeTeam(overrides: Partial<TeamStats> & { teamId: string }): TeamStats {
  return {
    group: 'A',
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    ...overrides,
  };
}

describe('compareStats', () => {
  it('ranks by points first', () => {
    const a = { points: 6, goalDifference: 0, goalsFor: 0 };
    const b = { points: 3, goalDifference: 5, goalsFor: 10 };
    expect(compareStats(a, b)).toBeLessThan(0); // a ranks ahead of b
  });

  it('falls back to goal difference on equal points', () => {
    const a = { points: 3, goalDifference: 2, goalsFor: 4 };
    const b = { points: 3, goalDifference: 1, goalsFor: 4 };
    expect(compareStats(a, b)).toBeLessThan(0);
  });

  it('falls back to goals for on equal points and goal difference', () => {
    const a = { points: 3, goalDifference: 1, goalsFor: 5 };
    const b = { points: 3, goalDifference: 1, goalsFor: 3 };
    expect(compareStats(a, b)).toBeLessThan(0);
  });
});

describe('sortGroupTeamsWithH2H', () => {
  it('ranks strictly by points when there is no tie', () => {
    const teams = [
      makeTeam({ teamId: 'A', points: 3 }),
      makeTeam({ teamId: 'B', points: 9 }),
      makeTeam({ teamId: 'C', points: 6 }),
    ];
    const sorted = sortGroupTeamsWithH2H(teams, () => null);
    expect(sorted.map((t) => t.teamId)).toEqual(['B', 'C', 'A']);
  });

  it('breaks a 2-way tie using head-to-head result', () => {
    const teams = [
      makeTeam({ teamId: 'A', points: 4, goalDifference: 0, goalsFor: 2 }),
      makeTeam({ teamId: 'B', points: 4, goalDifference: 0, goalsFor: 2 }),
      makeTeam({ teamId: 'C', points: 1 }),
    ];
    // A beat B 2-1 head to head
    const getMatchResult = (teamA: string, teamB: string): H2HMatch | null => {
      if ((teamA === 'A' && teamB === 'B') || (teamA === 'B' && teamB === 'A')) {
        return { team1: 'A', team2: 'B', score1: 2, score2: 1 };
      }
      return null;
    };
    const sorted = sortGroupTeamsWithH2H(teams, getMatchResult);
    expect(sorted.map((t) => t.teamId)).toEqual(['A', 'B', 'C']);
  });

  it('resolves a 3-way circular tie down to overall goal difference', () => {
    // A beat B, B beat C, C beat A (all 1-0) -> H2H mini-table is level, falls back to
    // overall stats via sortGroupTeamsStandard, which is randomized only on a full tie;
    // here overall goal difference differs so it's deterministic.
    const teams = [
      makeTeam({ teamId: 'A', points: 3, goalDifference: 2, goalsFor: 3 }),
      makeTeam({ teamId: 'B', points: 3, goalDifference: 0, goalsFor: 2 }),
      makeTeam({ teamId: 'C', points: 3, goalDifference: -2, goalsFor: 1 }),
    ];
    const results: Record<string, H2HMatch> = {
      'A-B': { team1: 'A', team2: 'B', score1: 1, score2: 0 },
      'B-C': { team1: 'B', team2: 'C', score1: 1, score2: 0 },
      'C-A': { team1: 'C', team2: 'A', score1: 1, score2: 0 },
    };
    const getMatchResult = (teamA: string, teamB: string): H2HMatch | null =>
      results[`${teamA}-${teamB}`] || results[`${teamB}-${teamA}`] || null;

    const sorted = sortGroupTeamsWithH2H(teams, getMatchResult);
    expect(sorted.map((t) => t.teamId)).toEqual(['A', 'B', 'C']);
  });
});

describe('sortDoubleRoundRobinGroup', () => {
  const match = (home: string, away: string, homeGoals: number, awayGoals: number) => ({
    id: 0,
    tournament: 'FQ',
    date: new Date('2026-09-25'),
    homeTeamId: home,
    awayTeamId: away,
    homeGoals,
    awayGoals,
    isKnockout: false,
    location: home,
    ratingChange: 0,
  });

  it('counts both meetings of a pair in the head-to-head tiebreak', () => {
    // A and B are level on points and each won one meeting, so only the
    // aggregate head-to-head goal difference separates them: B won 3-0 at home
    // and lost 0-1 away (+2), so B ranks first. Counting only the first
    // meeting (A's 1-0) would wrongly put A ahead.
    const a = makeTeam({ teamId: 'A', points: 6 });
    const b = makeTeam({ teamId: 'B', points: 6 });
    const matches = [match('A', 'B', 1, 0), match('B', 'A', 3, 0)];
    expect(sortDoubleRoundRobinGroup([a, b], matches).map((t) => t.teamId)).toEqual(['B', 'A']);
  });

  describe('with CAF away-goals criteria', () => {
    const caf = CAF_TIEBREAKERS;

    it('breaks a head-to-head tie on away goals scored', () => {
      // Each won at home (A 3-2, B 1-0): level on H2H points (3-3), GD (0)
      // and goals scored (3-3), but B scored 2 away goals to A's 0.
      const a = makeTeam({ teamId: 'A', points: 6 });
      const b = makeTeam({ teamId: 'B', points: 6 });
      const matches = [match('A', 'B', 3, 2), match('B', 'A', 1, 0)];
      for (let i = 0; i < 20; i++) {
        expect(sortDoubleRoundRobinGroup([a, b], matches, caf).map((t) => t.teamId)).toEqual(['B', 'A']);
        expect(sortDoubleRoundRobinGroup([b, a], matches, caf).map((t) => t.teamId)).toEqual(['B', 'A']);
      }
    });

    it('applies head-to-head away goals before overall goal difference', () => {
      // A and B are level on head-to-head points, GD and goals scored, and A
      // has the better overall goal difference. B scored the only away goal
      // in the head-to-head, which outranks A's overall GD under CAF rules;
      // without the away-goals criterion A's overall GD decides.
      const a = makeTeam({ teamId: 'A', points: 6, goalDifference: 5, goalsFor: 8 });
      const b = makeTeam({ teamId: 'B', points: 6, goalDifference: 0, goalsFor: 3 });
      const matches = [match('A', 'B', 2, 1), match('B', 'A', 1, 0)];
      expect(sortDoubleRoundRobinGroup([a, b], matches, caf).map((t) => t.teamId)).toEqual(['B', 'A']);
      expect(sortDoubleRoundRobinGroup([a, b], matches).map((t) => t.teamId)).toEqual(['A', 'B']);
    });

    it('falls back to overall away goals when everything before it is level', () => {
      // A and B draw 1-1 both times (identical head-to-head, away goals
      // included) and have identical overall stats; A scored 3 away goals over
      // all matches and B just 1.
      const a = makeTeam({ teamId: 'A', points: 6, goalDifference: 0, goalsFor: 4 });
      const b = makeTeam({ teamId: 'B', points: 6, goalDifference: 0, goalsFor: 4 });
      const matches = [
        match('A', 'B', 1, 1),
        match('B', 'A', 1, 1),
        match('C', 'A', 0, 2),
        match('D', 'B', 3, 0),
      ];
      for (let i = 0; i < 20; i++) {
        expect(sortDoubleRoundRobinGroup([b, a], matches, caf).map((t) => t.teamId)).toEqual(['A', 'B']);
      }
    });

    it('re-applies the head-to-head criteria to a subset that is still tied', () => {
      // Three teams level on points. In the three-team mini-table C is
      // clearly first and A, B are level on points, GD and goals scored, so
      // the criteria are re-applied to A v B alone: level again until away
      // goals, where A scored 2 (in the 2-2 at B) to B's 1.
      const teams = ['A', 'B', 'C'].map((id) => makeTeam({ teamId: id, points: 6 }));
      const matches = [
        match('A', 'B', 1, 1), match('B', 'A', 2, 2),   // A-B: level on points, GD, goals
        match('A', 'C', 0, 3), match('C', 'A', 3, 0),   // C beats A twice
        match('B', 'C', 0, 3), match('C', 'B', 3, 0),   // C beats B twice
      ];
      expect(sortDoubleRoundRobinGroup(teams, matches, caf).map((t) => t.teamId)).toEqual(['C', 'A', 'B']);
    });
  });
});

describe('sortOverallThenH2H (Concacaf Nations League rules)', () => {
  const stats = (teamId: string, points: number, goalDifference: number, goalsFor: number) =>
    makeTeam({ teamId, points, goalDifference, goalsFor, goalsAgainst: goalsFor - goalDifference });
  const game = (home: string, away: string, homeGoals: number, awayGoals: number) => ({
    id: 0, tournament: 'CLA', date: new Date('2026-09-25'), homeTeamId: home, awayTeamId: away,
    homeGoals, awayGoals, isKnockout: false, location: home, ratingChange: 0,
  });
  const order = (teams: TeamStats[], matches: ReturnType<typeof game>[]) =>
    sortOverallThenH2H(teams, matches).map((t) => t.teamId);

  it('ranks overall points, goal difference, then goals scored before head-to-head', () => {
    // A beat B home and away, but B is ahead overall on goal difference.
    const matches = [game('A', 'B', 1, 0), game('B', 'A', 0, 1)];
    expect(order([stats('A', 6, 0, 4), stats('B', 6, 3, 8)], matches)).toEqual(['B', 'A']);
    // Level on goal difference: goals scored decides, still ahead of head-to-head.
    expect(order([stats('A', 6, 2, 4), stats('B', 6, 2, 9)], matches)).toEqual(['B', 'A']);
  });

  it('uses head-to-head points once the overall record is level', () => {
    const level = [stats('A', 6, 1, 5), stats('B', 6, 1, 5)];
    for (let i = 0; i < 20; i++) {
      // B won the only meeting, whichever way round the teams are listed.
      expect(order(level, [game('B', 'A', 2, 1)])).toEqual(['B', 'A']);
      expect(order([...level].reverse(), [game('B', 'A', 2, 1)])).toEqual(['B', 'A']);
    }
  });

  it('breaks a two-team tie on head-to-head away goals, not goal difference', () => {
    const level = [stats('A', 6, 0, 4), stats('B', 6, 0, 4)];
    // A 3-1 B and B 1-0 A: each won once (head-to-head points 3-3). A has the
    // better head-to-head goal difference (+1 v -1), which is ignored for two
    // teams; B scored 1 away goal to A's 0, so B ranks first.
    for (let i = 0; i < 20; i++) {
      expect(order(level, [game('A', 'B', 3, 1), game('B', 'A', 1, 0)])).toEqual(['B', 'A']);
    }
  });

  it('with three or more teams level uses head-to-head goal difference then goals, not away goals', () => {
    const level = ['A', 'B', 'C'].map((id) => stats(id, 6, 0, 4));
    // Each team wins one of these games and loses another (head-to-head points
    // 3 each). Head-to-head goal difference then ranks A (+3), C (-1), B (-2).
    const matches = [game('A', 'B', 4, 0), game('B', 'C', 2, 0), game('C', 'A', 1, 0)];
    for (let i = 0; i < 20; i++) {
      expect(order([...level].reverse(), matches)).toEqual(['A', 'C', 'B']);
    }
  });

  it('draws lots when nothing separates the teams', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      seen.add(order([stats('A', 3, 0, 2), stats('B', 3, 0, 2)], []).join(''));
    }
    expect(seen).toEqual(new Set(['AB', 'BA']));
  });

  it('copes with teams that never met (a Swiss-style group)', () => {
    expect(order([stats('A', 6, 0, 4), stats('B', 6, 0, 4), stats('C', 0, -9, 1)], [game('A', 'C', 1, 0)])).toHaveLength(3);
  });
});

describe('rankAcrossGroups', () => {
  it('ranks the teams finishing in a position across groups by points, GD, then goals scored', () => {
    const standings = {
      G1: [makeTeam({ teamId: 'W1', points: 9, goalDifference: 4, goalsFor: 6 })],
      G2: [makeTeam({ teamId: 'W2', points: 9, goalDifference: 6, goalsFor: 7 })],
      G3: [makeTeam({ teamId: 'W3', points: 7, goalDifference: 9, goalsFor: 9 })],
    };
    expect(rankAcrossGroups(standings, ['G1', 'G2', 'G3'], 1).map((t) => t.teamId)).toEqual(['W2', 'W1', 'W3']);
  });
});
