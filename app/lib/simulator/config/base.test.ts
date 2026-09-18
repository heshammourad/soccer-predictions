import { describe, expect, it } from 'vitest';
import { compareStats, sortGroupTeamsWithH2H, H2HMatch } from './base';
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
