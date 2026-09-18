import { describe, expect, it } from 'vitest';
import { decideByGoals, twoLeggedStats } from './ties';

const leg = (homeGoals: number, awayGoals: number) => ({ homeGoals, awayGoals });

// Team A hosts leg 1, team B hosts leg 2.
describe('decideByGoals', () => {
  it('goes to the higher aggregate', () => {
    expect(decideByGoals(leg(2, 0), leg(1, 1), false)).toBe('A'); // A 3, B 1
    expect(decideByGoals(leg(0, 1), leg(0, 0), true)).toBe('B');
  });

  it('leaves a level aggregate undecided without the away-goals rule', () => {
    expect(decideByGoals(leg(1, 1), leg(1, 1), false)).toBeNull();
  });

  it('decides a level aggregate on away goals when the rule applies', () => {
    // Aggregate 3-3 either way: away goals are A's leg 2 goals and B's leg 1 goals.
    expect(decideByGoals(leg(1, 1), leg(2, 2), true)).toBe('A'); // aggregate 3-3, away A 2 vs B 1
    expect(decideByGoals(leg(2, 2), leg(1, 1), true)).toBe('B'); // aggregate 3-3, away A 1 vs B 2
  });

  it('is still level when the away goals are level too', () => {
    expect(decideByGoals(leg(1, 1), leg(1, 1), true)).toBeNull();
  });
});

describe('twoLeggedStats', () => {
  it('sums points, goals and away goals over both legs', () => {
    // A wins leg 1 at home 2-0, then loses leg 2 away 1-0 (B hosts).
    const stats = twoLeggedStats('A', 'B', leg(2, 0), leg(1, 0));
    expect(stats.A).toEqual({ points: 3, goalDifference: 1, goalsFor: 2, awayGoals: 0 });
    expect(stats.B).toEqual({ points: 3, goalDifference: -1, goalsFor: 1, awayGoals: 0 });
  });

  it('counts each away leg for the visiting team and draws as one point', () => {
    // A draws leg 1 at home, then wins leg 2 away 3-2.
    const stats = twoLeggedStats('A', 'B', leg(1, 1), leg(2, 3));
    expect(stats.A).toEqual({ points: 4, goalDifference: 1, goalsFor: 4, awayGoals: 3 });
    expect(stats.B).toEqual({ points: 1, goalDifference: -1, goalsFor: 3, awayGoals: 1 });
  });
});
