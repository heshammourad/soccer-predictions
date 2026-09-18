import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory fake Prisma double. Mocked before importing the engine so the
// engine never touches the real (generated, DB-backed) Prisma client.
const state: {
  teams: any[];
  matches: any[];
  teamTournamentGroups: any[];
  simulationRuns: any[];
  predictions: any[];
  nextRunId: number;
  nextPredictionId: number;
} = {
  teams: [],
  matches: [],
  teamTournamentGroups: [],
  simulationRuns: [],
  predictions: [],
  nextRunId: 1,
  nextPredictionId: 1,
};

vi.mock('../db', () => ({
  prisma: {
    team: {
      findMany: async () => state.teams,
    },
    match: {
      findMany: async ({ where }: any) => {
        let rows = state.matches;
        if (where?.tournament) {
          rows = rows.filter((m) => m.tournament === where.tournament);
        }
        return rows;
      },
    },
    teamTournamentGroup: {
      findMany: async ({ where }: any) => {
        let rows = state.teamTournamentGroups;
        if (where?.tournament) {
          rows = rows.filter((g) => g.tournament === where.tournament);
        }
        return rows;
      },
    },
    simulationRun: {
      findFirst: async ({ where }: any) =>
        state.simulationRuns.find(
          (r) => r.tournament === where.tournament && r.description === where.description
        ) || null,
      delete: async ({ where }: any) => {
        state.simulationRuns = state.simulationRuns.filter((r) => r.id !== where.id);
      },
      create: async ({ data }: any) => {
        const run = { id: state.nextRunId++, ...data };
        state.simulationRuns.push(run);
        return run;
      },
    },
    prediction: {
      create: async ({ data }: any) => {
        const prediction = { id: state.nextPredictionId++, ...data };
        state.predictions.push(prediction);
        return prediction;
      },
    },
  },
}));

const { SimulatorEngine } = await import('./engine');
const { WorldCup48Config } = await import('./config/worldCup');

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const SIMULATIONS = 25;

function buildWorldCupFixtureSet() {
  const teams: any[] = [];
  const teamTournamentGroups: any[] = [];
  const matches: any[] = [];
  let matchId = 1;

  GROUPS.forEach((group) => {
    const teamIds = [0, 1, 2, 3].map((i) => `${group}${i}`);
    teamIds.forEach((id, idx) => {
      teams.push({
        id,
        name: id,
        currentElo: 1500 + idx * 20,
        confederation: 'TEST',
        eloChange1Yr: 0,
        rankChange1Yr: 0,
      });
      teamTournamentGroups.push({ teamId: id, tournament: 'WC', group });
    });

    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        matches.push({
          id: matchId++,
          tournament: 'WC',
          date: new Date('2026-06-15'),
          homeTeamId: teamIds[i],
          awayTeamId: teamIds[j],
          homeGoals: null,
          awayGoals: null,
          isKnockout: false,
          winnerOverride: null,
          location: 'US',
          ratingChange: 0,
        });
      }
    }
  });

  return { teams, teamTournamentGroups, matches };
}

function sumMilestone(milestone: string) {
  return state.predictions
    .filter((p) => p.milestone === milestone)
    .reduce((sum, p) => sum + p.probability, 0);
}

describe('SimulatorEngine with WorldCup48Config (characterization)', () => {
  beforeEach(() => {
    const { teams, teamTournamentGroups, matches } = buildWorldCupFixtureSet();
    state.teams = teams;
    state.teamTournamentGroups = teamTournamentGroups;
    state.matches = matches;
    state.simulationRuns = [];
    state.predictions = [];
    state.nextRunId = 1;
    state.nextPredictionId = 1;
  });

  it('produces exactly one group winner per group, per simulation, in aggregate', async () => {
    const engine = new SimulatorEngine(new WorldCup48Config(), SIMULATIONS);
    await engine.runSimulation();

    // 12 groups x 1 winner each iteration, normalized by simulationsCount.
    expect(sumMilestone('winGroup')).toBeCloseTo(GROUPS.length, 5);
  });

  it('sends exactly 32 teams into the Round of 32 per simulation, in aggregate', async () => {
    const engine = new SimulatorEngine(new WorldCup48Config(), SIMULATIONS);
    await engine.runSimulation();

    expect(sumMilestone('roundOf32')).toBeCloseTo(32, 5);
  });

  it('crowns exactly one champion per simulation, in aggregate', async () => {
    const engine = new SimulatorEngine(new WorldCup48Config(), SIMULATIONS);
    await engine.runSimulation();

    expect(sumMilestone('champions')).toBeCloseTo(1, 5);
  });

  it('writes every probability within [0, 1], for every declared milestone', async () => {
    const engine = new SimulatorEngine(new WorldCup48Config(), SIMULATIONS);
    await engine.runSimulation();

    const milestones = new WorldCup48Config().milestones;
    expect(state.predictions.length).toBe(state.teams.length * milestones.length);

    state.predictions.forEach((p) => {
      expect(milestones).toContain(p.milestone);
      expect(p.probability).toBeGreaterThanOrEqual(0);
      expect(p.probability).toBeLessThanOrEqual(1);
    });
  });

  it('replaces an existing SimulationRun with the same (tournament, description) instead of duplicating it', async () => {
    const engine = new SimulatorEngine(new WorldCup48Config(), SIMULATIONS, undefined, 'Current Projections');
    await engine.runSimulation();
    const firstRunCount = state.simulationRuns.length;

    await engine.runSimulation();
    expect(state.simulationRuns.length).toBe(firstRunCount);
  });
});
