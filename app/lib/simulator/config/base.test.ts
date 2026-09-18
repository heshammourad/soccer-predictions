import { describe, expect, it } from 'vitest';
import { compareStats, sortGroupTeamsWithH2H, sortDoubleRoundRobinGroup, H2HMatch } from './base';
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
    const caf = { awayGoals: true };

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
