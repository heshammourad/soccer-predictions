import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { sortDoubleRoundRobinGroup } from './base';
import { NATIONS_LEAGUE_ACCESS_LIST, UEFA_NATIONS_LEAGUE_TIEBREAKERS, accessListPosition } from './nationsLeagueTiebreakers';
import { TeamStats } from '../types';

const SEED_DIR = path.resolve(__dirname, '../../../../prisma/seed-data');

describe('Nations League access list', () => {
  it('has 48 distinct teams, matching the seeded groups of Leagues A-C', () => {
    expect(new Set(NATIONS_LEAGUE_ACCESS_LIST).size).toBe(48);
    ['ENA', 'ENB', 'ENC'].forEach((code, leagueIdx) => {
      const groups: { [g: string]: string[] } = JSON.parse(fs.readFileSync(path.join(SEED_DIR, code, 'groups'), 'utf8'));
      Object.values(groups).forEach((teamIds) => {
        // Positions 1-16 are League A, 17-32 League B, 33-48 League C, in
        // four pots of four: each group has one team from every pot.
        const positions = teamIds.map(accessListPosition);
        positions.forEach((p) => expect(Math.floor((p - 1) / 16)).toBe(leagueIdx));
        expect(positions.map((p) => Math.floor(((p - 1) % 16) / 4)).sort()).toEqual([0, 1, 2, 3]);
      });
    });
  });

  it('ranks unknown teams last', () => {
    expect(accessListPosition('XX')).toBe(Infinity);
  });
});

describe('UEFA Nations League group tiebreakers', () => {
  const team = (teamId: string): TeamStats => ({
    teamId, group: 'A1', points: 6, goalDifference: 0, goalsFor: 4, goalsAgainst: 4, played: 6, won: 0, drawn: 0, lost: 0,
  });
  const match = (home: string, away: string, homeGoals: number, awayGoals: number) => ({
    id: 0, tournament: 'ENA', date: new Date('2026-09-25'), homeTeamId: home, awayTeamId: away,
    homeGoals, awayGoals, isKnockout: false, location: home, ratingChange: 0,
  });
  // A and B drew both meetings: level on every head-to-head criterion, and
  // (via `team`) on overall points, GD and goals scored. Only the games
  // against C and D differ.
  const headToHead = [match('A', 'B', 1, 1), match('B', 'A', 1, 1)];
  const order = (matches: ReturnType<typeof match>[], ids = ['B', 'A']) => {
    for (let i = 0; i < 20; i++) {
      [ids, [...ids].reverse()].forEach((input) => {
        const teams = ['C', 'D', ...input].map(team).filter((t) => input.includes(t.teamId));
        const sorted = sortDoubleRoundRobinGroup(teams, [...headToHead, ...matches], UEFA_NATIONS_LEAGUE_TIEBREAKERS);
        expect(sorted.map((t) => t.teamId)).toEqual(['A', 'B']);
      });
    }
  };

  it('breaks the tie on overall away goals scored', () => {
    // Neither wins a game; A scored 3 away goals (3-3 at C) to B's 1 (1-1 at D).
    order([match('C', 'A', 3, 3), match('D', 'B', 1, 1)]);
  });

  it('then on wins', () => {
    // No away goals for either, but A has a home win to B's draw.
    order([match('A', 'C', 1, 0), match('B', 'D', 0, 0)]);
  });

  it('then on away wins', () => {
    // One away goal and one win each; A's win came away, B's at home.
    order([match('C', 'A', 0, 1), match('B', 'D', 1, 0), match('D', 'B', 1, 1)]);
  });

  it('ranks away goals above wins', () => {
    // B has two wins to A's none, but A scored 2 away goals to B's 0.
    order([match('C', 'A', 2, 2), match('B', 'D', 1, 0), match('B', 'D', 1, 0)]);
  });

  it('then on access-list position', () => {
    // Nothing separates the two on the pitch: Spain (2nd) ranks above Poland (19th).
    for (let i = 0; i < 20; i++) {
      const teams = ['PL', 'ES'].map(team);
      const matches = [match('ES', 'PL', 1, 1), match('PL', 'ES', 1, 1)];
      expect(sortDoubleRoundRobinGroup(teams, matches, UEFA_NATIONS_LEAGUE_TIEBREAKERS).map((t) => t.teamId)).toEqual(['ES', 'PL']);
      expect(sortDoubleRoundRobinGroup([...teams].reverse(), matches, UEFA_NATIONS_LEAGUE_TIEBREAKERS).map((t) => t.teamId)).toEqual(['ES', 'PL']);
    }
  });

  it('still ranks by head-to-head before any of these', () => {
    // B has more away goals and wins overall, but A won the head-to-head.
    const teams = ['B', 'A'].map(team);
    const matches = [match('A', 'B', 1, 0), match('B', 'A', 0, 0), match('C', 'B', 0, 5)];
    expect(sortDoubleRoundRobinGroup(teams, matches, UEFA_NATIONS_LEAGUE_TIEBREAKERS).map((t) => t.teamId)).toEqual(['A', 'B']);
  });
});
