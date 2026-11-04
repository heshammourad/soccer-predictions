import { describe, expect, it } from 'vitest';
import { feedRowCandidates, pickMatchForFeedRow, planPairFixtures } from './feedMatching';

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

describe('feedRowCandidates', () => {
  const match = (id: number, home: string, away: string, location: string | null) => ({
    id,
    homeTeamId: home,
    awayTeamId: away,
    location,
  });

  // Lesotho v Niger is listed twice with Lesotho first: in Ghana (Sep 2026) and
  // in Lesotho (Mar 2027). The Ghana result was published as Niger v Lesotho.
  const lsNeGhana = match(1, 'LS', 'NE', 'GH');
  const lsNeHome = match(2, 'LS', 'NE', 'LS');

  it('lets a neutral-venue row claim the reversed neutral-venue fixture', () => {
    expect(feedRowCandidates([lsNeGhana, lsNeHome], 'NE', 'LS', 'GH')).toEqual([lsNeGhana]);
  });

  it('keeps same-order rows as candidates', () => {
    expect(feedRowCandidates([lsNeGhana, lsNeHome], 'LS', 'NE', 'LS')).toEqual([lsNeGhana, lsNeHome]);
  });

  it('never reverses a feed row played at one team’s ground', () => {
    expect(feedRowCandidates([lsNeGhana], 'NE', 'LS', 'NE')).toEqual([]);
    expect(feedRowCandidates([lsNeGhana], 'NE', 'LS', null)).toEqual([]);
  });

  it('keeps a reversed neutral-venue fixture apart from the home return fixture', () => {
    // Sierra Leone v Zimbabwe in Morocco (Sep), Zimbabwe v Sierra Leone in Zimbabwe (Mar).
    // The Morocco result, published as Zimbabwe v Sierra Leone, sees both rows and
    // the date picks the Morocco one; the March fixture row only sees its own.
    const slZwMorocco = { ...match(3, 'SL', 'ZW', 'MA'), date: at('2026-09-24') };
    const zwSlHome = { ...match(4, 'ZW', 'SL', 'ZW'), date: at('2027-03-25') };
    const existing = [slZwMorocco, zwSlHome];
    const result = feedRowCandidates(existing, 'ZW', 'SL', 'MA');
    expect(pickMatchForFeedRow(result, at('2026-09-24'), new Set())).toBe(slZwMorocco);
    expect(feedRowCandidates(existing, 'ZW', 'SL', 'ZW')).toEqual([zwSlHome]);
  });
});

describe('planPairFixtures', () => {
  const now = at('2026-11-04');
  const match = (id: number, home: string, away: string, location: string | null, date: string, homeGoals: number | null = null) => ({
    id,
    homeTeamId: home,
    awayTeamId: away,
    location,
    date: at(date),
    homeGoals,
  });
  const feedRow = (home: string, away: string, location: string | null, date: string) => ({ home, away, location, date: at(date) });

  // Gabon v Lesotho: the return fixture moved from Lesotho to South Africa and
  // was re-published with Gabon first.
  const gaLsHome = match(302, 'GA', 'LS', 'GA', '2026-11-13');
  const lsGaHome = match(325, 'LS', 'GA', 'LS', '2026-11-16');
  const feed = [feedRow('GA', 'LS', 'GA', '2026-11-13'), feedRow('GA', 'LS', 'ZA', '2026-11-17')];

  it('moves a fixture whose venue and home/away order both changed', () => {
    const { matched, stale } = planPairFixtures(feed, [gaLsHome, lsGaHome], now);
    expect(matched.map((m) => m?.id)).toEqual([302, 325]);
    expect(stale).toEqual([]);
  });

  it('drops the old fixture once an earlier sync has created the new one', () => {
    const gaLsSouthAfrica = match(545, 'GA', 'LS', 'ZA', '2026-11-17');
    const { matched, stale } = planPairFixtures(feed, [gaLsHome, lsGaHome, gaLsSouthAfrica], now);
    expect(matched.map((m) => m?.id)).toEqual([302, 545]);
    expect(stale.map((m) => m.id)).toEqual([325]);
  });

  it('moves a fixture that switched from a neutral venue to one team’s ground', () => {
    // Belize v St Vincent: played in Belize, return fixture moved from French
    // Guiana (Belize first) to St Vincent (St Vincent first).
    const played = match(426, 'BZ', 'VC', 'BZ', '2026-09-29', 0);
    const guiana = match(529, 'BZ', 'VC', 'GF', '2026-11-13');
    const { matched, stale } = planPairFixtures([feedRow('VC', 'BZ', 'VC', '2026-11-14')], [played, guiana], now);
    expect(matched.map((m) => m?.id)).toEqual([529]);
    expect(stale).toEqual([]);
  });

  it('does not let a fixture claim an earlier played meeting in the same order', () => {
    // St Vincent v French Guiana was played in September; the return fixture
    // moved from French Guiana to St Vincent and now lists St Vincent first.
    const played = match(410, 'VC', 'GF', 'BZ', '2026-09-26', 2);
    const guiana = match(534, 'GF', 'VC', 'GF', '2026-11-17');
    const { matched, stale } = planPairFixtures([feedRow('VC', 'GF', 'VC', '2026-11-17')], [played, guiana], now);
    expect(matched.map((m) => m?.id)).toEqual([534]);
    expect(stale).toEqual([]);
  });

  it('lets a fixture the feed still lists after it was played claim that match', () => {
    // Belize v French Guiana on 3 and 6 Oct, both in Belize. The feed still lists
    // the 3 Oct match after its result is in.
    const played = match(443, 'BZ', 'GF', 'BZ', '2026-10-03', 0);
    const next = match(524, 'BZ', 'GF', 'BZ', '2026-10-06');
    const feedRows = [feedRow('BZ', 'GF', 'BZ', '2026-10-03'), feedRow('BZ', 'GF', 'BZ', '2026-10-06')];
    const { matched, stale } = planPairFixtures(feedRows, [played, next], at('2026-10-04'));
    expect(matched.map((m) => m?.id)).toEqual([443, 524]);
    expect(stale).toEqual([]);
  });

  it('never moves a played match onto a fixture', () => {
    const played = match(426, 'BZ', 'VC', 'BZ', '2026-09-29', 0);
    const { matched } = planPairFixtures([feedRow('VC', 'BZ', 'VC', '2026-11-14')], [played], now);
    expect(matched).toEqual([null]);
  });

  it('keeps an unplayed past fixture that may be waiting for its result', () => {
    const awaitingResult = match(302, 'GA', 'LS', 'GA', '2026-11-03');
    const { stale } = planPairFixtures([feedRow('GA', 'LS', 'ZA', '2026-11-17')], [awaitingResult, match(545, 'GA', 'LS', 'ZA', '2026-11-17')], now);
    expect(stale).toEqual([]);
  });

  it('still keeps a pair published twice in the same order as two matches', () => {
    const sept = match(1, 'AL', 'BY', 'AL', '2026-09-26', 1);
    const nov = match(2, 'AL', 'BY', 'HU', '2026-11-15');
    const { matched, stale } = planPairFixtures([feedRow('AL', 'BY', 'HU', '2026-11-15')], [sept, nov], now);
    expect(matched.map((m) => m?.id)).toEqual([2]);
    expect(stale).toEqual([]);
  });
});
