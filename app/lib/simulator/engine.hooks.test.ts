import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Matchup, TeamStats, TieResult, TournamentConfig } from './types';

// Exercises the opt-in engine hooks used by the Concacaf Nations League:
// teams tracked without group matches (additionalTeamIds) and ordering a
// round's winners before pairing the next round (orderStageWinners).
const state: { teams: any[]; groups: any[]; matches: any[]; predictions: any[]; runId: number } = {
  teams: [], groups: [], matches: [], predictions: [], runId: 1,
};

vi.mock('../db', () => ({
  prisma: {
    team: { findMany: async () => state.teams },
    match: { findMany: async () => state.matches },
    teamTournamentGroup: { findMany: async () => state.groups },
    simulationRun: { findFirst: async () => null, delete: async () => {}, create: async () => ({ id: state.runId++ }) },
    prediction: { create: async ({ data }: any) => { state.predictions.push(data); } },
  },
}));

const { SimulatorEngine } = await import('./engine');

// One group of four whose members all reach the quarter-finals is enough:
// the ties below are built directly from the strong (S) and weak (W) teams.
const S = ['S1', 'S2', 'S3', 'S4']; // rated far apart, so each round's winner is certain
const W = ['W1', 'W2', 'W3', 'W4'];
const ELO: { [id: string]: number } = { S1: 4000, S2: 3000, S3: 2000, S4: 1000, W1: 100, W2: 100, W3: 100, W4: 100 };

function tie(id: string, home: string, away: string): Matchup[] {
  return [
    { homeTeamId: home, awayTeamId: away, isKnockout: true, stageName: 'quarterfinals', tieId: id, tieLeg: 1 },
    { homeTeamId: away, awayTeamId: home, isKnockout: true, stageName: 'quarterfinals', tieId: id, tieLeg: 2 },
  ];
}

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    code: 'TST',
    name: 'Test',
    groups: ['A'],
    knockoutStages: ['quarterfinals', 'semifinals', 'final', 'champions'],
    milestones: ['quarterfinals', 'semifinals', 'final', 'champions'],
    groupStageDefaultLocation: null,
    getKnockoutMatchLocation: () => null,
    sortGroupStandings: (teams: TeamStats[]) => teams,
    buildKnockoutBracket: (): Matchup[] => [
      ...tie('q1', S[0], W[0]), ...tie('q2', S[1], W[1]), ...tie('q3', S[2], W[2]), ...tie('q4', S[3], W[3]),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  // The group only supplies the four weak teams; the strong ones are extra.
  state.teams = Object.entries(ELO).map(([id, currentElo]) => ({ id, name: id, currentElo }));
  state.groups = W.map((teamId) => ({ teamId, tournament: 'TST', group: 'A' }));
  state.matches = [];
  W.forEach((home, i) => W.forEach((away, j) => {
    if (i !== j) state.matches.push({ id: state.matches.length + 1, tournament: 'TST', date: new Date('2026-09-25'), homeTeamId: home, awayTeamId: away,
      homeGoals: 0, awayGoals: 0, isKnockout: false, location: home, ratingChange: 0 });
  }));
  state.predictions = [];
});

const probability = (team: string, milestone: string) =>
  state.predictions.find((p) => p.teamId === team && p.milestone === milestone)?.probability;

describe('additionalTeamIds', () => {
  it('tracks a team that plays no group match', async () => {
    await new SimulatorEngine(makeConfig({ additionalTeamIds: S }), 40).runSimulation();
    S.forEach((id) => expect(probability(id, 'quarterfinals')).toBe(1));
    expect(probability('S1', 'champions')).toBeGreaterThan(0.9);
  });

  it('does not track it without the option, and ignores ids missing from the Team table', async () => {
    await new SimulatorEngine(makeConfig(), 10).runSimulation();
    expect(probability('S1', 'quarterfinals')).toBeUndefined();
    state.predictions = [];
    await new SimulatorEngine(makeConfig({ additionalTeamIds: ['S1', 'ZZ'] }), 10).runSimulation();
    expect(probability('S1', 'quarterfinals')).toBe(1);
    expect(probability('ZZ', 'quarterfinals')).toBeUndefined();
  });
});

describe('orderStageWinners', () => {
  const finalists = async (config: TournamentConfig) => {
    state.predictions = [];
    await new SimulatorEngine(config, 60).runSimulation();
    return S.filter((id) => probability(id, 'final') > 0.9);
  };

  it('pairs the winners by bracket position when there is no hook', async () => {
    // Semi-finals S1 v S2 and S3 v S4: the finalists are S1 and S3.
    expect(await finalists(makeConfig({ additionalTeamIds: S }))).toEqual(['S1', 'S3']);
  });

  it('pairs the next round in the order the hook returns', async () => {
    const calls: { stage: string; results: TieResult[] }[] = [];
    const config = makeConfig({
      additionalTeamIds: S,
      // Seed the semi-finals 1 v 4 and 2 v 3 by rating: the finalists are S1 and S2.
      orderStageWinners: (stage, results) => {
        calls.push({ stage, results });
        const ids = results.map((r) => r.winnerId).sort();
        return stage === 'quarterfinals' ? [ids[0], ids[3], ids[1], ids[2]] : ids;
      },
    });
    expect(await finalists(config)).toEqual(['S1', 'S2']);

    const quarterfinals = calls.filter((c) => c.stage === 'quarterfinals');
    expect(quarterfinals.length).toBeGreaterThan(0);
    // The hook sees each tie's winner and both teams' records over the two legs.
    const first = quarterfinals[0].results[0];
    expect(first.teamAId).toBe('S1');
    expect(first.winnerId).toBe('S1');
    expect(Object.keys(first.stats).sort()).toEqual(['S1', 'W1']);
    expect(first.stats.S1.points).toBeGreaterThanOrEqual(3);
  });

  it('rejects a hook that drops or invents winners instead of looping forever', async () => {
    const config = makeConfig({ additionalTeamIds: S, orderStageWinners: () => ['S1', 'S2'] });
    await expect(new SimulatorEngine(config, 5).runSimulation()).rejects.toThrow(/must return the stage's winners/);
  });
});
