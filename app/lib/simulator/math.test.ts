import { describe, expect, it } from 'vitest';
import { calculateRatingChange, getWeight, homeRatingChange } from './math';

describe('getWeight', () => {
  it('returns the documented K-factor for known tournament codes', () => {
    expect(getWeight('WC')).toBe(60);
    expect(getWeight('EC')).toBe(50);
    expect(getWeight('WQ')).toBe(40);
    expect(getWeight('F')).toBe(20);
  });

  it('uses the same K for every Nations League division as League A', () => {
    ['ENA', 'ENB', 'ENC', 'EN'].forEach((code) => expect(getWeight(code)).toBe(40));
  });

  it('falls back to 40 for unknown tournament codes', () => {
    expect(getWeight('NOT_A_REAL_CODE')).toBe(40);
  });
});

describe('calculateRatingChange', () => {
  it('is zero when a favorite with no rating gap draws', () => {
    expect(calculateRatingChange(1500, 1500, 0, 'WC')).toBe(0);
  });

  it('rewards the favorite for a 1-0 win over an evenly-matched underdog', () => {
    const change = calculateRatingChange(1500, 1500, 1, 'WC');
    expect(change).toBe(30); // k=60 * (1 - 0.5)
  });

  it('penalizes the favorite for losing to an evenly-matched underdog', () => {
    const change = calculateRatingChange(1500, 1500, -1, 'WC');
    expect(change).toBe(-30);
  });

  it('scales the K-factor up with larger goal-difference wins', () => {
    const oneGoal = calculateRatingChange(1500, 1500, 1, 'WC');
    const twoGoal = calculateRatingChange(1500, 1500, 2, 'WC');
    const threeGoal = calculateRatingChange(1500, 1500, 3, 'WC');
    expect(twoGoal).toBeGreaterThan(oneGoal);
    expect(threeGoal).toBeGreaterThan(twoGoal);
  });

  it('uses the tournament-specific weight', () => {
    const wcChange = calculateRatingChange(1500, 1500, 1, 'WC'); // k=60
    const friendlyChange = calculateRatingChange(1500, 1500, 1, 'F'); // k=20
    expect(wcChange).toBe(30);
    expect(friendlyChange).toBe(10);
  });

  it('gives a big favorite a smaller reward for the expected win', () => {
    const bigFavoriteWin = calculateRatingChange(1900, 1400, 1, 'WC');
    const evenWin = calculateRatingChange(1500, 1500, 1, 'WC');
    expect(bigFavoriteWin).toBeLessThan(evenWin);
  });
});

// Real results with eloratings.net's published ratingChange (home team's
// gain) and both teams' pre-match ratings, so the K-factors and the home
// advantage in the expected result stay in line with the site's own updates.
describe('homeRatingChange against eloratings.net', () => {
  const cases: [string, string, string, number, number, number, number, string, number][] = [
    // [tournament, home, away, homeElo, awayElo, homeGoals, awayGoals, venue, ratingChange]
    ['ENA', 'WA', 'NO', 1669, 1937, 2, 1, 'WA', 29], // home underdog wins
    ['ENA', 'DK', 'PT', 1869, 2022, 2, 4, 'DK', -25],
    ['ENA', 'CZ', 'EN', 1666, 2107, 0, 2, 'CZ', -7], // away side favourite despite home advantage
    ['ENB', 'IE', 'IL', 1685, 1637, 3, 0, 'HU', 30], // neutral venue
    ['ENB', 'IL', 'KO', 1607, 1714, 0, 0, 'HU', 6], // neutral-venue draw
    ['ENC', 'SM', 'FI', 825, 1536, 0, 7, 'SM', -3],
    ['FQ', 'GH', 'GM', 1560, 1421, 2, 4, 'GH', -48],
    ['FQ', 'GW', 'NG', 1291, 1769, 3, 0, 'GW', 63],
  ];

  it.each(cases)('%s %s v %s', (tournament, home, away, homeElo, awayElo, homeGoals, awayGoals, venue, expected) => {
    const homeAdvantage = venue === home ? 100 : 0;
    const awayAdvantage = venue === away ? 100 : 0;
    expect(
      homeRatingChange(homeElo + homeAdvantage, awayElo + awayAdvantage, homeGoals - awayGoals, tournament)
    ).toBe(expected);
  });
});
