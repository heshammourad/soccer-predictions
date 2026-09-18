import { describe, expect, it } from 'vitest';
import { pickMatchForFeedRow } from './feedMatching';

const row = (id: number, date: string) => ({ id, date: new Date(`${date}T12:00:00Z`) });

describe('pickMatchForFeedRow', () => {
  it('returns null with no candidates', () => {
    expect(pickMatchForFeedRow([], new Date('2026-09-24T12:00:00Z'))).toBeNull();
  });

  it('matches a rescheduled fixture', () => {
    const sept = row(1, '2026-09-25');
    expect(pickMatchForFeedRow([sept], new Date('2026-10-02T12:00:00Z'))).toBe(sept);
  });

  it('tells two fixtures with the same home/away order apart by date', () => {
    const sept = row(1, '2026-09-25');
    const mar = row(2, '2027-03-25');
    expect(pickMatchForFeedRow([sept, mar], new Date('2027-03-25T12:00:00Z'))).toBe(mar);
    expect(pickMatchForFeedRow([sept, mar], new Date('2026-09-25T12:00:00Z'))).toBe(sept);
  });

  it('does not treat the other meeting of a pair as a reschedule', () => {
    // Only the Sep row exists yet, and the feed lists the Mar one.
    expect(pickMatchForFeedRow([row(1, '2026-09-25')], new Date('2027-03-25T12:00:00Z'))).toBeNull();
  });
});
