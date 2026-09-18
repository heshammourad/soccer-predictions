import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the combined Nations League A-C config: one Monte Carlo pass
// over three leagues, cross-league promotion/relegation playoffs, per-league
// output runs, and the no-host rules.
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
          const wanted = where.tournament.in ?? [where.tournament];
          rows = rows.filter((m) => wanted.includes(m.tournament));
        }
        return rows;
      },
    },
    teamTournamentGroup: {
      findMany: async ({ where }: any) => {
        let rows = state.teamTournamentGroups;
        if (where?.tournament) {
          const wanted = where.tournament.in ?? [where.tournament];
          rows = rows.filter((g) => wanted.includes(g.tournament));
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
const { NationsLeagueConfig } = await import('./nationsLeague');

const LEAGUE_GROUPS: { [code: string]: string[] } = {
  ENA: ['A1', 'A2', 'A3', 'A4'],
  ENB: ['B1', 'B2', 'B3', 'B4'],
  ENC: ['C1', 'C2', 'C3', 'C4'],
};
const SIMULATIONS = 40;

function buildFixtureSet() {
  const teams: any[] = [];
  const teamTournamentGroups: any[] = [];
  const matches: any[] = [];
  let matchId = 1;

  Object.entries(LEAGUE_GROUPS).forEach(([code, groups], leagueIdx) => {
    groups.forEach((group) => {
      const teamIds = [0, 1, 2, 3].map((i) => `${group}${i}`);
      teamIds.forEach((id, idx) => {
        // Higher leagues are stronger, so playoff ties aren't all coin flips.
        teams.push({
          id,
          name: id,
          currentElo: 2000 - leagueIdx * 150 + idx * 20,
          confederation: 'UEFA',
          eloChange1Yr: 0,
          rankChange1Yr: 0,
        });
        teamTournamentGroups.push({ teamId: id, tournament: code, group });
      });
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = 0; j < teamIds.length; j++) {
          if (i === j) continue;
          matches.push({
            id: matchId++,
            tournament: code,
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
  });

  return { teams, teamTournamentGroups, matches };
}

// Standings where group index gi ranks strictly gi-th best at every
// position, so the cross-group ranking is fully deterministic.
function buildStandings() {
  const standings: any = {};
  const pointsByPosition = [15, 10, 6, 3];
  Object.values(LEAGUE_GROUPS).flat().forEach((g) => {
    const gi = Number(g[1]) - 1;
    standings[g] = pointsByPosition.map((base, pos) => ({
      teamId: `${g}${pos}`,
      group: g,
      points: base - gi,
      goalDifference: base - gi,
      goalsFor: base - gi,
      goalsAgainst: 0,
      played: 6, won: 0, drawn: 0, lost: 0,
    }));
  });
  return standings;
}

function sumMilestone(tournament: string, milestone: string) {
  return state.predictions
    .filter((p) => p.tournament === tournament && p.milestone === milestone)
    .reduce((sum, p) => sum + p.probability, 0);
}

describe('SimulatorEngine with NationsLeagueConfig (leagues A-C together)', () => {
  beforeEach(() => {
    const { teams, teamTournamentGroups, matches } = buildFixtureSet();
    state.teams = teams;
    state.teamTournamentGroups = teamTournamentGroups;
    state.matches = matches;
    state.simulationRuns = [];
    state.predictions = [];
    state.nextRunId = 1;
    state.nextPredictionId = 1;
  });

  it('writes one run per league, each team only with its own league\'s milestones', async () => {
    await new SimulatorEngine(new NationsLeagueConfig(), SIMULATIONS).runSimulation();

    expect(state.simulationRuns.map((r) => r.tournament).sort()).toEqual(['ENA', 'ENB', 'ENC']);

    const config = new NationsLeagueConfig();
    config.leagues.forEach((league) => {
      const rows = state.predictions.filter((p) => p.tournament === league.code);
      const leagueTeams = state.teamTournamentGroups.filter((g) => g.tournament === league.code);
      expect(rows.length).toBe(leagueTeams.length * league.milestones.length);
      rows.forEach((p) => {
        expect(league.milestones).toContain(p.milestone);
        expect(p.probability).toBeGreaterThanOrEqual(0);
        expect(p.probability).toBeLessThanOrEqual(1);
        expect(state.teamTournamentGroups.find((g) => g.teamId === p.teamId)?.tournament).toBe(league.code);
      });
    });
  });

  it('awards the direct promotion/relegation slots and keeps the League A title ladder intact', async () => {
    await new SimulatorEngine(new NationsLeagueConfig(), SIMULATIONS).runSimulation();

    expect(sumMilestone('ENA', 'winGroup')).toBeCloseTo(4, 5);
    expect(sumMilestone('ENA', 'quarterfinals')).toBeCloseTo(8, 5);
    expect(sumMilestone('ENA', 'champions')).toBeCloseTo(1, 5);
    expect(sumMilestone('ENA', 'autoRelegated')).toBeCloseTo(2, 5);
    expect(sumMilestone('ENB', 'autoPromoted')).toBeCloseTo(4, 5);
    expect(sumMilestone('ENC', 'autoPromoted')).toBeCloseTo(4, 5);
  });

  it('resolves each playoff tie to one winner, so the leagues swap the same number of teams', async () => {
    await new SimulatorEngine(new NationsLeagueConfig(), SIMULATIONS).runSimulation();

    // A/B: 4 ties. Each B win promotes a B team and relegates an A team.
    const aPlayoffRelegations = sumMilestone('ENA', 'relegated') - 2;
    const bPlayoffPromotions = sumMilestone('ENB', 'promoted') - 4;
    expect(aPlayoffRelegations).toBeCloseTo(bPlayoffPromotions, 5);
    // B/C: 4 ties. Each C win promotes a C team and relegates a B team.
    const cPlayoffPromotions = sumMilestone('ENC', 'promoted') - 4;
    expect(sumMilestone('ENB', 'relegated')).toBeCloseTo(cPlayoffPromotions, 5);
    expect(aPlayoffRelegations).toBeLessThanOrEqual(4);
    expect(cPlayoffPromotions).toBeLessThanOrEqual(4);
  });
});

describe('NationsLeagueConfig playoff draw', () => {
  const config = new NationsLeagueConfig();
  const ties = (matchups: any[]) => {
    const byTie = new Map<string, any[]>();
    matchups.forEach((m) => byTie.set(m.tieId, [...(byTie.get(m.tieId) ?? []), m]));
    return Array.from(byTie.values());
  };

  it('picks A\'s ranks 11-14 and the B runners-up for A/B, and the B 4th-placed teams vs C runners-up for B/C', () => {
    const matchups = config.buildPlayoffTies(buildStandings(), []);
    const ab = ties(matchups.filter((m) => m.stageName === 'playoffAB'));
    const bc = ties(matchups.filter((m) => m.stageName === 'playoffBC'));

    expect(ab).toHaveLength(4);
    expect(bc).toHaveLength(4);

    // Team ids are `<group><position-1>`. Groups A3/A4 rank lowest among
    // 3rd-placed teams; groups A1/A2 rank highest among 4th-placed teams.
    const aTeams = ab.map((t) => t[0].awayTeamId).sort();
    expect(aTeams).toEqual(['A13', 'A23', 'A32', 'A42']);
    const bTeams = ab.map((t) => t[0].homeTeamId).sort();
    expect(bTeams).toEqual(['B11', 'B21', 'B31', 'B41'].sort());

    expect(bc.map((t) => t[0].awayTeamId).sort()).toEqual(['B13', 'B23', 'B33', 'B43'].sort());
    expect(bc.map((t) => t[0].homeTeamId).sort()).toEqual(['C11', 'C21', 'C31', 'C41'].sort());
  });

  it('has the lower-league team host leg 1 and the higher-league team host leg 2', () => {
    config.buildPlayoffTies(buildStandings(), []).forEach((m) => {
      const [leg1Home, leg2Home] = [m.tieLeg === 1, m.tieLeg === 2];
      const lowerLeagueLetter = m.stageName === 'playoffAB' ? 'B' : 'C';
      const homeLetter = m.homeTeamId[0];
      if (leg1Home) expect(homeLetter).toBe(lowerLeagueLetter);
      if (leg2Home) expect(homeLetter).not.toBe(lowerLeagueLetter);
    });
  });

  it('prefers a real drawn pairing over a random one', () => {
    const known: any[] = [
      { id: 1, tournament: 'ENB', date: new Date('2027-03-19'), homeTeamId: 'B41', awayTeamId: 'A13', homeGoals: null, awayGoals: null, isKnockout: true, location: 'B41', ratingChange: 0 },
    ];
    for (let i = 0; i < 20; i++) {
      const ab = config.buildPlayoffTies(buildStandings(), known).filter((m) => m.stageName === 'playoffAB');
      const tie = ab.find((m) => m.homeTeamId === 'B41' && m.tieLeg === 1);
      expect(tie?.awayTeamId).toBe('A13');
    }
  });

  it('awards promoted to a lower-league winner and relegated to the higher-league loser', () => {
    const out = config.evaluatePlayoffMilestones([
      { stageName: 'playoffAB', winnerId: 'B11', loserId: 'A13', leg1HomeTeamId: 'B11' },
      { stageName: 'playoffAB', winnerId: 'A23', loserId: 'B21', leg1HomeTeamId: 'B21' },
    ]);
    expect(out).toEqual({ B11: ['promoted'], A13: ['relegated'] });
  });
});

describe('NationsLeagueConfig hosting rules', () => {
  const config = new NationsLeagueConfig();

  it('never lets Ukraine, Israel or Belarus host', () => {
    ['UA', 'IL', 'BY'].forEach((id) => expect(config.hostsHomeMatch(id, 'PL')).toBe(false));
    expect(config.hostsHomeMatch('PL', 'UA')).toBe(true);
  });

  it('plays Ireland v Israel at a neutral venue', () => {
    expect(config.hostsHomeMatch('IE', 'IL')).toBe(false);
    expect(config.hostsHomeMatch('IE', 'AT')).toBe(true);
  });

  it('never picks a team that cannot host as the Finals host', () => {
    for (let i = 0; i < 50; i++) {
      expect(config.selectDynamicHost('semifinals', ['UA', 'ES', 'FR', 'IL'])).not.toMatch(/UA|IL/);
    }
    expect(config.selectDynamicHost('semifinals', ['UA', 'IL'])).toBeNull();
  });
});
