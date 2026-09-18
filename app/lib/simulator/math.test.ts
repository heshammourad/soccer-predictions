import { describe, expect, it } from 'vitest';
import { calculateRatingChange, getWeight } from './math';

describe('getWeight', () => {
  it('returns the documented K-factor for known tournament codes', () => {
    expect(getWeight('WC')).toBe(60);
    expect(getWeight('EC')).toBe(50);
    expect(getWeight('WQ')).toBe(40);
    expect(getWeight('F')).toBe(20);
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
