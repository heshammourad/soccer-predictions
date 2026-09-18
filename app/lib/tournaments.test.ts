import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { finalMilestoneIfOver, getTournament, TournamentDescriptor } from './tournaments';
import { AfricaCupQualifiersConfig } from './simulator/config/africaCupQualifiers';
import { ConcacafLeagueAConfig, ConcacafLeagueBConfig, ConcacafLeagueCConfig, CNL_A_SEEDS } from './simulator/config/concacafNationsLeague';

const groups: { [group: string]: string[] } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../prisma/seed-data/FQ/groups'), 'utf8')
);
const seedFixtures = fs
  .readFileSync(path.resolve(__dirname, '../../prisma/seed-data/FQ/fixtures'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => l.split('\t'));
const teams = Object.entries(groups).flatMap(([group, ids]) => ids.map((id) => ({ id, name: id, group })));

describe('FQ dashboard status', () => {
  const { calculateMathStatus } = getTournament('FQ')!;

  // The hosts are shown as a flat 100% (a raw simulated 1.0 is displayed as
  // ">99%"), so they must be reported as guaranteed even before any match has
  // been played -- e.g. in the pre-tournament snapshot.
  it('marks the hosts guaranteed before a ball is kicked, and nobody else', () => {
    const status = calculateMathStatus(teams, [], []);
    expect([...status.guaranteedWinGroup].sort()).toEqual(['KE', 'TZ', 'UG']);
    expect([...status.guaranteedProgress].sort()).toEqual(['KE', 'TZ', 'UG']);
    expect(status.mathematicallyEliminated.size).toBe(0);
    expect(status.eliminatedWinGroup.size).toBe(0);
  });

  it('does not mark a strong team such as Morocco guaranteed while its group is still open', () => {
    // Group I (LS, NE, MA, GA): Morocco won 3-0 on matchday 1 and one other
    // game has been played, so ten of the group's twelve matches remain.
    const groupI = seedFixtures
      .filter((f) => groups.I.includes(f[3]))
      .map((f) => ({ homeTeamId: f[3], awayTeamId: f[4], homeGoals: null, awayGoals: null, isKnockout: false }));
    // Pick the two played games by identity: LS v NE is one of the pairs
    // published twice, so matching on the teams alone would remove both.
    const playedMA = groupI.find((f) => f.homeTeamId === 'MA' && f.awayTeamId === 'GA')!;
    const playedLS = groupI.find((f) => f.homeTeamId === 'LS' && f.awayTeamId === 'NE')!;
    const results = [
      { ...playedMA, homeGoals: 3, awayGoals: 0 },
      { ...playedLS, homeGoals: 0, awayGoals: 1 },
    ];
    const fixtures = groupI.filter((f) => f !== playedMA && f !== playedLS);
    expect(fixtures).toHaveLength(10);

    const status = calculateMathStatus(teams, results, fixtures);
    expect(status.guaranteedWinGroup.has('MA')).toBe(false);
    expect(status.mathematicallyEliminated.has('MA')).toBe(false);
    // The hosts stay guaranteed in every state.
    ['KE', 'TZ', 'UG'].forEach((host) => expect(status.guaranteedWinGroup.has(host)).toBe(true));
  });
});

describe('dashboard descriptors match the server configs', () => {
  const configs = [new AfricaCupQualifiersConfig(), new ConcacafLeagueAConfig(), new ConcacafLeagueBConfig(), new ConcacafLeagueCConfig()];
  configs.forEach((config) => {
    it(`${config.code}: same milestones and knockout stages, and a label for each milestone`, () => {
      const descriptor = getTournament(config.code)!;
      expect(descriptor.milestones).toEqual(config.milestones);
      expect(descriptor.knockoutStages).toEqual(config.knockoutStages);
      config.milestones.forEach((m) => expect(descriptor.milestoneLabels[m]).toBeTruthy());
      (descriptor.negativeMilestones ?? []).forEach((m) => expect(config.milestones).toContain(m));
    });
  });
});

describe('CLA dashboard status', () => {
  it('marks the four seeds guaranteed for the quarter-finals before any match, and nobody else', () => {
    const groups = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../prisma/seed-data/CLA/groups'), 'utf8'));
    const clTeams = [
      ...Object.entries(groups as { [g: string]: string[] }).flatMap(([group, ids]) => ids.map((id) => ({ id, name: id, group }))),
      ...CNL_A_SEEDS.map((id) => ({ id, name: id, group: null as string | null })),
    ];
    const status = getTournament('CLA')!.calculateMathStatus(clTeams, [], []);
    expect([...status.guaranteedProgress].sort()).toEqual([...CNL_A_SEEDS].sort());
    expect(status.mathematicallyEliminated.size).toBe(0);
  });
});

describe('finalMilestoneIfOver', () => {
  const tournament = (dates: TournamentDescriptor['milestoneDates']) =>
    ({ milestoneDates: dates }) as TournamentDescriptor;
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
