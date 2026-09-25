import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Exercises the AFCON qualifiers config: 12 double round-robin groups, the
// three hosts already qualified, and no knockout phase. Group membership and
// fixtures come from the real seed data, which doubles as a check on it.
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
    team: { findMany: async () => state.teams },
    match: {
      findMany: async ({ where }: any) =>
        state.matches.filter((m) => !where?.tournament || m.tournament === where.tournament),
    },
    teamTournamentGroup: {
      findMany: async ({ where }: any) =>
        state.teamTournamentGroups.filter((g) => !where?.tournament || g.tournament === where.tournament),
    },
    simulationRun: {
      findFirst: async ({ where }: any) =>
        state.simulationRuns.find((r) => r.tournament === where.tournament && r.description === where.description) ||
        null,
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

// Wrap the match model so a test can see the rating gap each simulated match
// is played with (i.e. whether a home-advantage boost was applied).
vi.mock('../math', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../math')>();
  return { ...actual, simulateResult: vi.fn(actual.simulateResult) };
});

const { SimulatorEngine } = await import('../engine');
const math = await import('../math');
const { AfricaCupQualifiersConfig, AFCON_HOSTS } = await import('./africaCupQualifiers');
const { computeCertainty } = await import('../certainty');

const SEED_DIR = path.resolve(__dirname, '../../../../prisma/seed-data/FQ');
const seedGroups: { [group: string]: string[] } = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'groups'), 'utf8'));
const seedFixtures = fs
  .readFileSync(path.join(SEED_DIR, 'fixtures'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => l.split('\t'));
const SIMULATIONS = 40;

function standingsFor(group: string, order: string[]) {
  return order.map((teamId, i) => ({
    teamId,
    group,
    points: 12 - i * 3,
    goalDifference: 6 - i * 2,
    goalsFor: 10 - i,
    goalsAgainst: 0,
    played: 6,
    won: 0,
    drawn: 0,
    lost: 0,
  }));
}

describe('FQ seed data', () => {
  it('has 12 groups of 4 with every fixture inside a group, and each host in its own group', () => {
    const groupOf: { [teamId: string]: string } = {};
    Object.entries(seedGroups).forEach(([g, ids]) => {
      expect(ids).toHaveLength(4);
      ids.forEach((id) => (groupOf[id] = g));
    });
    expect(Object.keys(seedGroups)).toEqual(new AfricaCupQualifiersConfig().groups);
    expect(Object.keys(groupOf)).toHaveLength(48);
    expect(seedFixtures).toHaveLength(144);
    seedFixtures.forEach((f) => expect(groupOf[f[3]]).toBe(groupOf[f[4]]));
    expect(new Set(AFCON_HOSTS.map((h) => groupOf[h])).size).toBe(AFCON_HOSTS.length);
  });
});

describe('AfricaCupQualifiersConfig.evaluateGroupPhaseMilestones', () => {
  const config = new AfricaCupQualifiersConfig();

  it('qualifies the top two of a group with no host', () => {
    const result = config.evaluateGroupPhaseMilestones({ A: standingsFor('A', ['CM', 'KM', 'CG', 'NA']) });
    expect(Object.keys(result).sort()).toEqual(['CM', 'KM']);
  });

  it('qualifies the host plus only the best non-host in a host group', () => {
    // The host finishing first: the runner-up takes the other place.
    let result = config.evaluateGroupPhaseMilestones({ L: standingsFor('L', ['KE', 'ER', 'ZA', 'GN']) });
    expect(Object.keys(result).sort()).toEqual(['ER', 'KE']);

    // The host finishing second or last doesn't cost anyone a place: the best
    // non-host qualifies either way and the second-best does not.
    result = config.evaluateGroupPhaseMilestones({ L: standingsFor('L', ['ER', 'KE', 'ZA', 'GN']) });
    expect(Object.keys(result).sort()).toEqual(['ER', 'KE']);
    result = config.evaluateGroupPhaseMilestones({ L: standingsFor('L', ['ER', 'ZA', 'GN', 'KE']) });
    expect(Object.keys(result).sort()).toEqual(['ER', 'KE']);
  });
});

describe('SimulatorEngine with AfricaCupQualifiersConfig', () => {
  beforeEach(() => {
    state.teams = Object.values(seedGroups)
      .flat()
      .map((id, i) => ({
        id,
        name: id,
        currentElo: 1300 + (i % 12) * 40,
        confederation: 'CAF',
        eloChange1Yr: 0,
        rankChange1Yr: 0,
      }));
    state.teamTournamentGroups = Object.entries(seedGroups).flatMap(([group, ids]) =>
      ids.map((teamId) => ({ teamId, tournament: 'FQ', group }))
    );
    state.matches = seedFixtures.map((f, i) => ({
      id: i + 1,
      tournament: 'FQ',
      date: new Date('2026-09-25'),
      homeTeamId: f[3],
      awayTeamId: f[4],
      homeGoals: null,
      awayGoals: null,
      isKnockout: false,
      location: f[6],
      ratingChange: 0,
    }));
    state.simulationRuns = [];
    state.predictions = [];
    state.nextRunId = 1;
    state.nextPredictionId = 1;
  });

  it('writes one qualified probability per team: hosts at 1, two places in every group, no knockout stages', async () => {
    await new SimulatorEngine(new AfricaCupQualifiersConfig(), SIMULATIONS).runSimulation();

    expect(state.simulationRuns.map((r) => r.tournament)).toEqual(['FQ']);
    expect(state.predictions).toHaveLength(48);
    state.predictions.forEach((p) => {
      expect(p.milestone).toBe('qualified');
      expect(p.probability).toBeGreaterThanOrEqual(0);
      expect(p.probability).toBeLessThanOrEqual(1);
    });

    AFCON_HOSTS.forEach((host) => {
      expect(state.predictions.find((p) => p.teamId === host)?.probability).toBe(1);
    });
    Object.values(seedGroups).forEach((ids) => {
      const total = state.predictions.filter((p) => ids.includes(p.teamId)).reduce((s, p) => s + p.probability, 0);
      expect(total).toBeCloseTo(2, 5);
    });
  });
});

describe('AFCON qualifiers certainty', () => {
  const config = new AfricaCupQualifiersConfig();
  const groupMatches = seedFixtures.map((f) => ({ homeTeamId: f[3], awayTeamId: f[4], homeGoals: null as number | null, awayGoals: null as number | null }));
  const certainty = (matches: typeof groupMatches) =>
    computeCertainty({
      rules: config.certainty,
      milestones: config.milestones,
      groupRules: config.groupRules,
      groups: seedGroups,
      teamIds: Object.values(seedGroups).flat(),
      groupMatches: matches,
      knockoutMatches: [],
      knockoutStages: [],
    });

  // The hosts are shown as a flat 100% (a raw simulated 1.0 is displayed as
  // ">99%"), so they must be proven certain even before any match has been
  // played, e.g. in the pre-tournament snapshot.
  it('proves the hosts qualified before a ball is kicked, and nothing else', () => {
    const table = certainty(groupMatches);
    const decided = Object.entries(table).filter(([, m]) => m.qualified !== null);
    expect(decided.map(([id, m]) => [id, m.qualified]).sort()).toEqual(AFCON_HOSTS.map((h) => [h, 'CERTAIN']).sort());
  });

  it('does not prove a strong team such as Morocco qualified while its group is still open', () => {
    // Group A (LS, NE, MA, GA): Morocco won 3-0 on matchday 1 and one other
    // game has been played, so ten of the group's twelve matches remain.
    // Pick the two played games by identity: LS v NE is one of the pairs
    // published twice, so matching on the teams alone would change both.
    const playedMA = groupMatches.find((m) => m.homeTeamId === 'MA' && m.awayTeamId === 'GA')!;
    const playedLS = groupMatches.find((m) => m.homeTeamId === 'LS' && m.awayTeamId === 'NE')!;
    const matches = groupMatches.map((m) =>
      m === playedMA ? { ...m, homeGoals: 3, awayGoals: 0 } : m === playedLS ? { ...m, homeGoals: 0, awayGoals: 1 } : m
    );
    const table = certainty(matches);
    expect(table.MA.qualified).toBeNull();
    AFCON_HOSTS.forEach((host) => expect(table[host].qualified).toBe('CERTAIN'));
  });
});

describe('home advantage by venue', () => {
  // One unplayed fixture between equal-rated teams, so the only rating gap
  // the match model sees is the home-advantage boost (if any).
  class SingleGroupConfig extends AfricaCupQualifiersConfig {
    groups = ['A'];
  }

  async function ratingGapFor(location: string | null) {
    state.teams = ['CM', 'KM'].map((id) => ({
      id, name: id, currentElo: 1500, confederation: 'CAF', eloChange1Yr: 0, rankChange1Yr: 0,
    }));
    state.teamTournamentGroups = ['CM', 'KM'].map((teamId) => ({ teamId, tournament: 'FQ', group: 'A' }));
    state.matches = [{
      id: 1, tournament: 'FQ', date: new Date('2026-09-25'), homeTeamId: 'CM', awayTeamId: 'KM',
      homeGoals: null, awayGoals: null, isKnockout: false, location, ratingChange: 0,
    }];
    state.simulationRuns = [];
    state.predictions = [];
    vi.mocked(math.simulateResult).mockClear();
    await new SimulatorEngine(new SingleGroupConfig(), 1).runSimulation();
    return vi.mocked(math.simulateResult).mock.calls[0][0];
  }

  it("boosts a team only when the fixture is played at that team's own ground", async () => {
    expect(await ratingGapFor('CM')).toBe(100);
    expect(await ratingGapFor('KM')).toBe(100);
  });

  it('gives neither team a boost at a neutral venue or with no venue', async () => {
    expect(await ratingGapFor('MA')).toBe(0);
    expect(await ratingGapFor(null)).toBe(0);
  });
});
