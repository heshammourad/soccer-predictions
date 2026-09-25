import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { GroupStandings, Match, TieResult } from '../types';

const state: { teams: any[]; groups: any[]; matches: any[]; predictions: any[]; runId: number } = {
  teams: [], groups: [], matches: [], predictions: [], runId: 1,
};

vi.mock('../../db', () => ({
  prisma: {
    team: { findMany: async () => state.teams },
    match: { findMany: async ({ where }: any) => state.matches.filter((m) => m.tournament === where.tournament) },
    teamTournamentGroup: { findMany: async ({ where }: any) => state.groups.filter((g) => g.tournament === where.tournament) },
    simulationRun: { findFirst: async () => null, delete: async () => {}, create: async () => ({ id: state.runId++ }) },
    prediction: { create: async ({ data }: any) => { state.predictions.push(data); } },
  },
}));

const { SimulatorEngine } = await import('../engine');
const {
  ConcacafLeagueAConfig, ConcacafLeagueBConfig, ConcacafLeagueCConfig, CNL_A_SEEDS,
  CLA_MILESTONES, CLB_MILESTONES, CLC_MILESTONES,
} = await import('./concacafNationsLeague');

const SEED_DIR = path.resolve(__dirname, '../../../../prisma/seed-data');
const seedGroups = (code: string): { [g: string]: string[] } =>
  JSON.parse(fs.readFileSync(path.join(SEED_DIR, code, 'groups'), 'utf8'));
const seedFixtures = (code: string) =>
  fs.readFileSync(path.join(SEED_DIR, code, 'fixtures'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => l.split('\t'));

describe('CONCACAF Nations League seed data', () => {
  const shapes: [string, number, number, number][] = [
    // code, groups, teams per group, fixtures per group
    ['CLA', 2, 6, 12],
    ['CLB', 4, 4, 12],
    ['CLC', 3, 3, 6],
  ];
  shapes.forEach(([code, groupCount, size, perGroup]) => {
    it(`${code}: ${groupCount} groups of ${size}, ${perGroup} fixtures each, all inside a group`, () => {
      const groups = seedGroups(code);
      expect(Object.keys(groups)).toHaveLength(groupCount);
      const groupOf: { [t: string]: string } = {};
      Object.entries(groups).forEach(([g, ids]) => {
        expect(ids).toHaveLength(size);
        ids.forEach((id) => (groupOf[id] = g));
      });
      expect(Object.keys(groupOf)).toHaveLength(groupCount * size);
      const fixtures = seedFixtures(code);
      expect(fixtures).toHaveLength(groupCount * perGroup);
      fixtures.forEach((f) => expect(groupOf[f[3]]).toBe(groupOf[f[4]]));
      Object.keys(groups).forEach((g) => expect(fixtures.filter((f) => groupOf[f[3]] === g)).toHaveLength(perGroup));
    });
  });

  it('League A groups have each team play four matches', () => {
    // (Two at home and two away officially; the feed lists one pair twice with
    // the same home team, so only the total is checked.)
    const fixtures = seedFixtures('CLA');
    Object.values(seedGroups('CLA')).flat().forEach((id) => {
      expect(fixtures.filter((f) => f[3] === id || f[4] === id)).toHaveLength(4);
    });
  });

  it('keeps the four seeds out of the groups', () => {
    const inGroups = Object.values(seedGroups('CLA')).flat();
    CNL_A_SEEDS.forEach((id) => expect(inGroups).not.toContain(id));
    expect(CNL_A_SEEDS).toEqual(['MX', 'US', 'CA', 'PA']);
  });

  it('gives every milestone schedule a live Current Projections run and increasing cutoffs', () => {
    [CLA_MILESTONES, CLB_MILESTONES, CLC_MILESTONES].forEach((schedule) => {
      expect(schedule[schedule.length - 1]).toEqual({ name: 'Current Projections' });
      const dates = schedule.filter((m) => m.date).map((m) => new Date(m.date!).getTime());
      expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    });
  });
});

const team = (teamId: string, points: number, goalDifference: number, goalsFor: number) =>
  ({ teamId, group: 'A', points, goalDifference, goalsFor, goalsAgainst: goalsFor - goalDifference, played: 4, won: 0, drawn: 0, lost: 0 });
const game = (home: string, away: string, homeGoals: number | null, awayGoals: number | null, date: string): Match => ({
  id: 0, tournament: 'CLA', date: new Date(date), homeTeamId: home, awayTeamId: away, homeGoals, awayGoals,
  isKnockout: true, location: home, ratingChange: 0,
});

describe('ConcacafLeagueAConfig', () => {
  const config = new ConcacafLeagueAConfig();
  // Group A: winner W1, runner-up R1 (8 pts); group B: winner W2 (better record, 12 pts), runner-up R2 (7 pts).
  const standings = (): GroupStandings => ({
    A1: [team('W1', 10, 6, 9), team('R1', 8, 3, 7), team('A3', 5, 0, 5), team('A4', 4, -1, 4), team('A5', 3, -3, 3), team('A6', 0, -5, 1)],
    A2: [team('W2', 12, 9, 12), team('R2', 7, 2, 6), team('B3', 5, 0, 5), team('B4', 4, -1, 4), team('B5', 3, -3, 3), team('B6', 0, -7, 0)],
  });

  it('awards winning the group and relegates 5th and 6th', () => {
    const milestones = config.evaluateGroupPhaseMilestones(standings());
    expect(milestones.W1).toEqual(['winGroup']);
    expect(milestones.W2).toEqual(['winGroup']);
    expect(milestones.R1).toBeUndefined();
    ['A5', 'A6', 'B5', 'B6'].forEach((id) => expect(milestones[id]).toEqual(['relegated']));
    ['A3', 'A4', 'B3', 'B4'].forEach((id) => expect(milestones[id]).toBeUndefined());
  });

  it('draws the quarter-finals: 4th seed v best winner ... 1st seed v next runner-up', () => {
    const ties = config.buildKnockoutBracket(standings(), []);
    // Two legs per tie, in quarter-final order.
    const firstLegs = ties.filter((m) => m.tieLeg === 1).map((m) => [m.homeTeamId, m.awayTeamId].sort().join('-'));
    // Best winner W2 (12 pts) and best runner-up R1 (8 pts) meet the 4th and 2nd seeds.
    expect(firstLegs).toEqual(['PA-W2', 'CA-W1', 'R1-US', 'MX-R2'].map((p) => p.split('-').sort().join('-')));
    expect(ties).toHaveLength(8);
    ties.forEach((m) => expect(m.stageName).toBe('quarterfinals'));
  });

  it('has the seed host the second leg by default', () => {
    const ties = config.buildKnockoutBracket(standings(), []);
    const qf1 = ties.filter((m) => m.tieId === 'CLA-qf-0');
    expect(qf1.find((m) => m.tieLeg === 1)).toMatchObject({ homeTeamId: 'W2', awayTeamId: 'PA' });
    expect(qf1.find((m) => m.tieLeg === 2)).toMatchObject({ homeTeamId: 'PA', awayTeamId: 'W2' });
  });

  it('prefers a published pairing and leg order to the drawn one', () => {
    // The real draw put runner-up R1 against the 4th seed, PA, with PA hosting first.
    const known = [game('PA', 'R1', null, null, '2026-11-11'), game('R1', 'PA', null, null, '2026-11-17')];
    const ties = config.buildKnockoutBracket(standings(), known);
    const qf1 = ties.filter((m) => m.tieId === 'CLA-qf-0');
    expect(qf1.find((m) => m.tieLeg === 1)).toMatchObject({ homeTeamId: 'PA', awayTeamId: 'R1' });
    // Every qualifier still plays exactly one seed.
    const opponents = ties.filter((m) => m.tieLeg === 1).flatMap((m) => [m.homeTeamId, m.awayTeamId]);
    expect(new Set(opponents).size).toBe(8);
    expect(opponents).toEqual(expect.arrayContaining(['W1', 'W2', 'R1', 'R2', ...CNL_A_SEEDS]));
  });

  it('ranks the quarter-final winners on points, GD, goals, then away goals, pairing 1 v 4 and 2 v 3', () => {
    const result = (winnerId: string, points: number, goalDifference: number, goalsFor: number, awayGoals: number): TieResult => ({
      winnerId, teamAId: winnerId, teamBId: `x-${winnerId}`,
      stats: { [winnerId]: { points, goalDifference, goalsFor, awayGoals } },
    });
    const results = [
      result('P', 4, 1, 3, 1),  // 4th: fewest points
      result('Q', 6, 2, 4, 0),  // level with S on points, GD and goals; S has the away goals
      result('R', 6, 5, 6, 2),  // 1st: most goal difference
      result('S', 6, 2, 4, 2),  // 2nd
    ];
    for (let i = 0; i < 20; i++) {
      expect(config.orderStageWinners('quarterfinals', results)).toEqual(['R', 'P', 'S', 'Q']);
    }
    // Later rounds keep bracket order.
    expect(config.orderStageWinners('semifinals', results)).toEqual(['P', 'Q', 'R', 'S']);
  });

  it('plays the Finals at the United States venue', () => {
    expect(config.getKnockoutMatchLocation()).toBe('US');
  });
});

describe('ConcacafLeagueBConfig and ConcacafLeagueCConfig', () => {
  it('promotes the League B group winner and relegates 4th', () => {
    const config = new ConcacafLeagueBConfig();
    const standings: GroupStandings = {};
    config.groups.forEach((g) => {
      standings[g] = ['1', '2', '3', '4'].map((n, i) => team(`${g}${n}`, 12 - i * 3, 5 - i * 2, 9 - i));
    });
    const milestones = config.evaluateGroupPhaseMilestones(standings);
    config.groups.forEach((g) => {
      expect(milestones[`${g}1`]).toEqual(['promoted']);
      expect(milestones[`${g}2`]).toBeUndefined();
      expect(milestones[`${g}4`]).toEqual(['relegated']);
    });
  });

  it('promotes the League C winners and the best runner-up, ranked across groups', () => {
    const config = new ConcacafLeagueCConfig();
    const standings: GroupStandings = {
      C1: [team('W1', 10, 5, 8), team('R1', 6, 1, 5), team('L1', 1, -6, 2)],
      C2: [team('W2', 9, 4, 7), team('R2', 6, 3, 6), team('L2', 2, -7, 1)], // best runner-up: 6 points, +3
      C3: [team('W3', 12, 8, 10), team('R3', 4, 0, 4), team('L3', 3, -8, 2)],
    };
    const milestones = config.evaluateGroupPhaseMilestones(standings);
    ['W1', 'W2', 'W3'].forEach((id) => expect(milestones[id]).toEqual(['winGroup', 'promoted']));
    expect(milestones.R2).toEqual(['promoted']);
    ['R1', 'R3', 'L1', 'L2', 'L3'].forEach((id) => expect(milestones[id]).toBeUndefined());
  });
});

// Full simulations over the real fixtures, with every team rated in seed order
// so the results are plausible, checking each league's totals.
async function simulate(config: InstanceType<typeof ConcacafLeagueAConfig> | InstanceType<typeof ConcacafLeagueBConfig> | InstanceType<typeof ConcacafLeagueCConfig>, extraTeams: string[] = []) {
  const groups = seedGroups(config.code);
  const ids = [...Object.values(groups).flat(), ...extraTeams];
  state.teams = ids.map((id, i) => ({ id, name: id, currentElo: extraTeams.includes(id) ? 1900 - extraTeams.indexOf(id) * 50 : 1500 - i * 20 }));
  state.groups = Object.entries(groups).flatMap(([group, members]) => members.map((teamId) => ({ teamId, tournament: config.code, group })));
  state.matches = seedFixtures(config.code).map((f, i) => ({
    id: i + 1, tournament: config.code, date: new Date(`${f[0]}-${f[1]}-${f[2]}T12:00:00Z`), homeTeamId: f[3], awayTeamId: f[4],
    homeGoals: null, awayGoals: null, isKnockout: false, location: f[6], ratingChange: 0,
  }));
  state.predictions = [];
  await new SimulatorEngine(config, 200).runSimulation();
}
const total = (milestone: string) =>
  state.predictions.filter((p) => p.milestone === milestone).reduce((sum, p) => sum + p.probability, 0);
const probability = (teamId: string, milestone: string) =>
  state.predictions.find((p) => p.teamId === teamId && p.milestone === milestone)?.probability;

beforeEach(() => {
  state.predictions = [];
});

describe('simulating League A', () => {
  it('sends the top two of each group and the four seeds to the quarter-finals, and narrows down to one champion', async () => {
    await simulate(new ConcacafLeagueAConfig(), CNL_A_SEEDS);
    expect(total('winGroup')).toBeCloseTo(2, 5);
    expect(total('quarterfinals')).toBeCloseTo(8, 5);
    expect(total('semifinals')).toBeCloseTo(4, 5);
    expect(total('final')).toBeCloseTo(2, 5);
    expect(total('champions')).toBeCloseTo(1, 5);
    expect(total('relegated')).toBeCloseTo(4, 5);
    CNL_A_SEEDS.forEach((id) => expect(probability(id, 'quarterfinals')).toBe(1));
    // A seed can't be relegated or win a group it isn't in.
    CNL_A_SEEDS.forEach((id) => {
      expect(probability(id, 'relegated')).toBe(0);
      expect(probability(id, 'winGroup')).toBe(0);
    });
    // Which the certainty calculation proves before a ball is kicked.
    const certainty = (teamId: string, milestone: string) =>
      state.predictions.find((p) => p.teamId === teamId && p.milestone === milestone)?.certainty;
    CNL_A_SEEDS.forEach((id) => {
      expect(certainty(id, 'quarterfinals')).toBe('CERTAIN');
      expect(certainty(id, 'relegated')).toBe('IMPOSSIBLE');
      expect(certainty(id, 'semifinals')).toBeNull();
    });
    expect(state.predictions.filter((p) => !CNL_A_SEEDS.includes(p.teamId) && p.certainty)).toEqual([]);
  });
});

describe('simulating League B', () => {
  it('promotes one team per group and relegates one per group', async () => {
    await simulate(new ConcacafLeagueBConfig());
    expect(total('promoted')).toBeCloseTo(4, 5);
    expect(total('relegated')).toBeCloseTo(4, 5);
  });
});

describe('simulating League C', () => {
  it('promotes the three winners and one runner-up', async () => {
    await simulate(new ConcacafLeagueCConfig());
    expect(total('winGroup')).toBeCloseTo(3, 5);
    expect(total('promoted')).toBeCloseTo(4, 5);
  });
});
