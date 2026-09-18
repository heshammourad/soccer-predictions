import { describe, expect, it } from 'vitest';
import { pickMatchForFeedRow } from './feedMatching';

const row = (id: number, date: string) => ({ id, date: new Date(`${date}T12:00:00Z`) });
const at = (date: string) => new Date(`${date}T12:00:00Z`);

describe('pickMatchForFeedRow', () => {
  it('returns null with no candidates', () => {
    expect(pickMatchForFeedRow([], at('2026-09-24'), new Set())).toBeNull();
  });

  it('matches a rescheduled fixture, however far it moved', () => {
    const sept = row(1, '2026-09-25');
    expect(pickMatchForFeedRow([sept], at('2026-10-02'), new Set())).toBe(sept);
    expect(pickMatchForFeedRow([sept], at('2026-12-20'), new Set())).toBe(sept);
  });

  it('tells two fixtures with the same home/away order apart by date', () => {
    const sept = row(1, '2026-09-25');
    const mar = row(2, '2027-03-25');
    expect(pickMatchForFeedRow([sept, mar], at('2027-03-25'), new Set())).toBe(mar);
    expect(pickMatchForFeedRow([sept, mar], at('2026-09-25'), new Set())).toBe(sept);
  });

  // Albania v Belarus is listed on 26 Sep (at Albania) and 15 Nov (in Hungary),
  // 50 days apart.
  describe('a pair published twice, 50 days apart', () => {
    const feed = [at('2026-09-26'), at('2026-11-15')];

    it('maps each feed row to its own existing row', () => {
      const existing = [row(1, '2026-09-26'), row(2, '2026-11-15')];
      const claimed = new Set<number>();
      expect(feed.map((d) => pickMatchForFeedRow(existing, d, claimed)?.id)).toEqual([1, 2]);
    });

    it('does not merge them into one, so the second becomes a new match', () => {
      // A database that already collapsed the pair into a single row.
      const existing = [row(2, '2026-11-15')];
      const claimed = new Set<number>();
      const picks = feed.map((d) => pickMatchForFeedRow(existing, d, claimed));
      expect(picks[0]?.id).toBe(2);
      expect(picks[1]).toBeNull();
    });

    it('creates both from an empty database', () => {
      const claimed = new Set<number>();
      expect(feed.map((d) => pickMatchForFeedRow([], d, claimed))).toEqual([null, null]);
    });

    it('handles a pair only a week apart', () => {
      const existing = [row(1, '2026-09-27'), row(2, '2026-10-04')];
      const claimed = new Set<number>();
      const picks = [at('2026-09-27'), at('2026-10-04')].map((d) => pickMatchForFeedRow(existing, d, claimed)?.id);
      expect(picks).toEqual([1, 2]);
    });
  });
});
