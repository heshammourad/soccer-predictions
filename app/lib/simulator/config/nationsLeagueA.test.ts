import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the two-legged quarterfinal tie resolution and dynamic Finals
// host selection end to end through SimulatorEngine, since both are new,
// tournament-specific mechanics unlike anything WC's config exercises.
const state: {
  teams: any[];
  teamTournamentGroups: any[];
  matches: any[];
  simulationRuns: any[];
  predictions: any[];
  nextRunId: number;
  nextPredictionId: number;
} = {
  teams: [],
  teamTournamentGroups: [],
  matches: [],
  simulationRuns: [],
  predictions: [],
  nextRunId: 1,
  nextPredictionId: 1,
};

vi.mock('../../db', () => ({
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

const { SimulatorEngine } = await import('../engine');
const { NationsLeagueAConfig } = await import('./nationsLeagueA');

const GROUPS = ['A1', 'A2', 'A3', 'A4'];
const SIMULATIONS = 30;

function buildNationsLeagueFixtureSet() {
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
        currentElo: 1600 + idx * 30,
        confederation: 'UEFA',
        eloChange1Yr: 0,
        rankChange1Yr: 0,
      });
      teamTournamentGroups.push({ teamId: id, tournament: 'ENA', group });
    });

    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        matches.push({
          id: matchId++,
          tournament: 'ENA',
          date: new Date('2026-09-25'),
          homeTeamId: teamIds[i],
          awayTeamId: teamIds[j],
          homeGoals: null,
          awayGoals: null,
          isKnockout: false,
          location: teamIds[i],
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

describe('SimulatorEngine with NationsLeagueAConfig (two-legged ties + dynamic host)', () => {
  beforeEach(() => {
    const { teams, teamTournamentGroups, matches } = buildNationsLeagueFixtureSet();
    state.teams = teams;
    state.teamTournamentGroups = teamTournamentGroups;
    state.matches = matches;
    state.simulationRuns = [];
    state.predictions = [];
    state.nextRunId = 1;
    state.nextPredictionId = 1;
  });

  it('sends exactly the 4 group winners + 4 runners-up into the two-legged quarterfinals', async () => {
    const engine = new SimulatorEngine(new NationsLeagueAConfig(), SIMULATIONS);
    await engine.runSimulation();

    expect(sumMilestone('winGroup')).toBeCloseTo(GROUPS.length, 5);
    expect(sumMilestone('quarterfinals')).toBeCloseTo(8, 5);
  });

  it('resolves each two-legged tie to exactly one semifinalist per tie, and one champion overall', async () => {
    const engine = new SimulatorEngine(new NationsLeagueAConfig(), SIMULATIONS);
    await engine.runSimulation();

    expect(sumMilestone('semifinals')).toBeCloseTo(4, 5);
    expect(sumMilestone('final')).toBeCloseTo(2, 5);
    expect(sumMilestone('champions')).toBeCloseTo(1, 5);
  });

  it('never lets a team face its own group-mate in the quarterfinals', async () => {
    // Run the bracket builder directly across many iterations (bypassing
    // full match simulation) to check the pairing constraint in isolation.
    const config = new NationsLeagueAConfig();
    const groupStandings: any = {};
    GROUPS.forEach((g) => {
      groupStandings[g] = [0, 1, 2, 3].map((i) => ({
        teamId: `${g}${i}`,
        group: g,
        points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, played: 0, won: 0, drawn: 0, lost: 0,
      }));
    });

    for (let i = 0; i < 50; i++) {
      const matchups = config.buildKnockoutBracket(groupStandings, []);
      const ties = new Map<string, string[]>();
      matchups.forEach((m) => {
        const arr = ties.get(m.tieId!) ?? [];
        arr.push(m.homeTeamId, m.awayTeamId);
        ties.set(m.tieId!, arr);
      });

      ties.forEach((teamIds) => {
        const unique = new Set(teamIds);
        // Every tie is [runnerUp, winner, winner, runnerUp] across its 2 legs
        expect(unique.size).toBe(2);
        const [a, b] = Array.from(unique);
        const groupOf = (id: string) => id.slice(0, 2);
        expect(groupOf(a)).not.toBe(groupOf(b));
      });
    }
  });

  it('writes every probability within [0, 1], for every declared milestone', async () => {
    const engine = new SimulatorEngine(new NationsLeagueAConfig(), SIMULATIONS);
    await engine.runSimulation();

    const milestones = new NationsLeagueAConfig().milestones;
    expect(state.predictions.length).toBe(state.teams.length * milestones.length);

    state.predictions.forEach((p) => {
      expect(milestones).toContain(p.milestone);
      expect(p.probability).toBeGreaterThanOrEqual(0);
      expect(p.probability).toBeLessThanOrEqual(1);
    });
  });
});
