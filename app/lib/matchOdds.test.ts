import { describe, expect, it } from 'vitest';
import { isBigSwing, preMatchOdds, upsetWinner } from './matchOdds';
import { getProbabilities, homeRatingChange } from './simulator/math';

const favouriteWinChance = (gap: number) =>
  Object.entries(getProbabilities(gap))
    .filter(([margin]) => Number(margin) > 0)
    .reduce((sum, [, p]) => sum + p, 0);

describe('preMatchOdds', () => {
  it("recovers the rating gap (home advantage included) from eloratings.net's change", () => {
    // Wales 2-1 Norway at Wales, 2026-10-01: 1669 (+100 at home) v 1937.
    const ratingChange = homeRatingChange(1769, 1937, 1, 'ENA');
    expect(ratingChange).toBe(29);
    const odds = preMatchOdds({ tournament: 'ENA', homeGoals: 2, awayGoals: 1, ratingChange })!;
    // The change is rounded, so the recovered gap is only close to 168.
    expect(odds.awayWin).toBeCloseTo(favouriteWinChance(168), 1);
    expect(odds.draw).toBeCloseTo(getProbabilities(168)[0], 1);
    expect(odds.homeWin + odds.draw + odds.awayWin).toBeCloseTo(1, 10);
  });

  it('gives a near-even match for a draw with no rating change', () => {
    // The simulator's fitted curves aren't quite symmetric at a zero gap.
    const odds = preMatchOdds({ tournament: 'WC', homeGoals: 1, awayGoals: 1, ratingChange: 0 })!;
    expect(odds.homeWin).toBeCloseTo(odds.awayWin, 1);
  });

  it('has no odds for an unplayed fixture', () => {
    expect(preMatchOdds({ tournament: 'WC', homeGoals: null, awayGoals: null, ratingChange: 0 })).toBeNull();
  });
});

describe('upsetWinner', () => {
  it('flags a home underdog that won', () => {
    // Guinea-Bissau 3-0 Nigeria, AFCON qualifiers.
    expect(upsetWinner({ tournament: 'FQ', homeGoals: 3, awayGoals: 0, ratingChange: 63 })).toBe('home');
  });

  it('flags an away underdog that won', () => {
    // Germany 0-1 Greece at Germany, Nations League A.
    expect(upsetWinner({ tournament: 'ENA', homeGoals: 0, awayGoals: 1, ratingChange: -32 })).toBe('away');
  });

  it("doesn't flag a favourite's win, a modest surprise, or a draw", () => {
    // Spain 4-1 Croatia.
    expect(upsetWinner({ tournament: 'ENA', homeGoals: 4, awayGoals: 1, ratingChange: 4 })).toBeNull();
    // Wales 2-1 Norway: a 19.6% chance, shown as 20%.
    expect(upsetWinner({ tournament: 'ENA', homeGoals: 2, awayGoals: 1, ratingChange: 29 })).toBeNull();
    // Sweden 3-1 Poland: a slight home favourite.
    expect(upsetWinner({ tournament: 'ENB', homeGoals: 3, awayGoals: 1, ratingChange: 18 })).toBeNull();
    // Georgia 0-0 Ukraine.
    expect(upsetWinner({ tournament: 'ENB', homeGoals: 0, awayGoals: 0, ratingChange: 4 })).toBeNull();
  });
});

describe('isBigSwing', () => {
  it("scales with the tournament's K-factor", () => {
    // K=40: 30 points or more.
    expect(isBigSwing(30, 'ENA')).toBe(true);
    expect(isBigSwing(-30, 'ENA')).toBe(true);
    expect(isBigSwing(29, 'ENA')).toBe(false);
    // K=60 at the World Cup: 45 points or more.
    expect(isBigSwing(44, 'WC')).toBe(false);
    expect(isBigSwing(45, 'WC')).toBe(true);
  });
});
