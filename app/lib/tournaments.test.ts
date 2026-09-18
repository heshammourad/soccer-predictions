import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getTournament } from './tournaments';

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
