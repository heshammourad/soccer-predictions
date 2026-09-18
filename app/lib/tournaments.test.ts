import { describe, expect, it } from 'vitest';
import { finalMilestoneIfOver, getTournament, TournamentDescriptor } from './tournaments';

const tournament = (dates: TournamentDescriptor['milestoneDates']) =>
  ({ milestoneDates: dates }) as TournamentDescriptor;

describe('finalMilestoneIfOver', () => {
  const dates = {
    'Start (Pre-tournament)': '2026-06-10T23:59:59Z',
    'Matchday 1 Completed': '2026-06-17T23:59:59Z',
    'Final Milestone': '2026-07-19T23:59:59Z',
    'Current Projections': undefined,
  };

  it('is null while any dated milestone is still ahead', () => {
    expect(finalMilestoneIfOver(tournament(dates), new Date('2026-07-19T12:00:00Z'))).toBeNull();
    expect(finalMilestoneIfOver(tournament(dates), new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('names the last dated milestone once all of them have passed, whatever it is called', () => {
    expect(finalMilestoneIfOver(tournament(dates), new Date('2026-07-20T00:00:00Z'))).toBe('Final Milestone');
  });

  it('is null with no dated milestones', () => {
    expect(finalMilestoneIfOver(tournament({ 'Current Projections': undefined }))).toBeNull();
  });

  it('follows the real schedules: the World Cup is over, an upcoming league is not', () => {
    const now = new Date('2026-09-18T00:00:00Z');
    expect(finalMilestoneIfOver(getTournament('WC')!, now)).toBe('Tournament Completed');
    expect(finalMilestoneIfOver(getTournament('CLC')!, now)).toBeNull();
    // CONCACAF B and C end at "Matchday 6 Completed", not "Tournament Completed".
    expect(finalMilestoneIfOver(getTournament('CLC')!, new Date('2026-10-07T00:00:00Z'))).toBe('Matchday 6 Completed');
    expect(finalMilestoneIfOver(getTournament('CLB')!, new Date('2026-11-18T00:00:00Z'))).toBe('Matchday 6 Completed');
  });
});
