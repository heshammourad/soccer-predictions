import { describe, expect, it } from 'vitest';
import { isNewResult, teamResults, ResultMatch } from './teamResults';
import { getTournament } from './tournaments';

const WC_DATES = getTournament('WC')!.milestoneDates;
const SYNC = '2026-09-30T06:00:00.000Z';

let nextId = 1;
const match = (
  date: string,
  home: string,
  away: string,
  homeGoals: number | null,
  awayGoals: number | null,
  extra: Partial<ResultMatch> = {}
): ResultMatch => ({
  id: nextId++,
  date: `${date}T12:00:00Z`,
  homeTeamId: home,
  awayTeamId: away,
  homeGoals,
  awayGoals,
  isKnockout: false,
  location: home,
  ...extra,
});

describe('teamResults', () => {
  it("gives each played match from the team's side, oldest first", () => {
    const rows = teamResults(
      'FR',
      [
        match('2026-06-20', 'BR', 'FR', 2, 3),
        match('2026-06-14', 'FR', 'NO', 0, 0),
        match('2026-06-26', 'FR', 'SN', null, null),
        match('2026-06-24', 'SN', 'FR', 2, 0, { location: 'US' }),
        match('2026-06-18', 'BR', 'NO', 1, 0),
      ],
      WC_DATES,
      null
    );
    expect(rows.map((r) => [r.venue, r.opponentId, r.goalsFor, r.goalsAgainst, r.outcome])).toEqual([
      ['v', 'NO', 0, 0, 'D'],
      ['@', 'BR', 3, 2, 'W'],
      ['n', 'SN', 0, 2, 'L'],
    ]);
    expect(rows.every((r) => r.stage === 'GS')).toBe(true);
  });

  it('names knockout rounds after the milestone they end with', () => {
    const ko = { isKnockout: true, location: 'US' };
    const rows = teamResults(
      'FR',
      [
        match('2026-06-29', 'FR', 'JP', 2, 0, ko),
        match('2026-07-05', 'FR', 'MA', 1, 0, ko),
        match('2026-07-10', 'FR', 'EN', 2, 1, ko),
        match('2026-07-15', 'FR', 'AR', 0, 1, ko),
        match('2026-07-18', 'FR', 'ES', 3, 1, ko),
      ],
      WC_DATES,
      null
    );
    expect(rows.map((r) => r.stage)).toEqual(['R32', 'R16', 'QF', 'SF', '3P']);
  });

  it('calls the last round the final for a semifinal winner', () => {
    const ko = { isKnockout: true, location: 'US' };
    const rows = teamResults(
      'AR',
      [match('2026-07-15', 'FR', 'AR', 0, 1, ko), match('2026-07-19', 'AR', 'ES', 1, 1, ko)],
      WC_DATES,
      null
    );
    expect(rows.map((r) => r.stage)).toEqual(['SF', 'F']);
  });

  it('marks results the latest sync recorded as new', () => {
    const rows = teamResults(
      'FR',
      [
        match('2026-06-14', 'FR', 'NO', 1, 0, { resultSyncedAt: '2026-09-29T06:00:00.000Z' }),
        match('2026-06-20', 'BR', 'FR', 2, 3, { resultSyncedAt: SYNC }),
        match('2026-06-24', 'SN', 'FR', 2, 0),
      ],
      WC_DATES,
      SYNC
    );
    expect(rows.map((r) => r.isNew)).toEqual([false, true, false]);
  });
});

describe('isNewResult', () => {
  it('is false before any sync has been recorded', () => {
    expect(isNewResult(match('2026-06-14', 'FR', 'NO', 1, 0, { resultSyncedAt: SYNC }), null)).toBe(false);
  });
});
