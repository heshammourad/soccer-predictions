import { prisma } from '../db';
import { TournamentConfig, TeamStats, GroupStandings, Matchup, Match } from './types';
import { simulateResult, getLowerScore, calculateRatingChange } from './math';

export class SimulatorEngine {
  private config: TournamentConfig;
  private simulationsCount: number;
  private asOfDate?: Date;
  private description: string;

  constructor(
    config: TournamentConfig,
    simulationsCount: number = 10000,
    asOfDate?: Date,
    description: string = 'Current Projections'
  ) {
    this.config = config;
    this.simulationsCount = simulationsCount;
    this.asOfDate = asOfDate;
    this.description = description;
  }

  async runSimulation() {
    // 1. Fetch all teams
    const teams = await prisma.team.findMany();
    
    // 2. Fetch matches for this tournament
    const matches = await prisma.match.findMany({
      where: { tournament: this.config.code },
      orderBy: { date: 'asc' },
    });

    const results = matches.filter((m) => {
      const isCompleted = m.homeGoals !== null;
      if (!isCompleted) return false;
      if (this.asOfDate) {
        return m.date <= this.asOfDate;
      }
      return true;
    }).map(m => this.mapMatchPrismaToLocal(m));

    const fixtures = matches.filter((m) => {
      const isCompleted = m.homeGoals !== null;
      if (!isCompleted) return true;
      if (this.asOfDate) {
        return m.date > this.asOfDate;
      }
      return false;
    }).map(m => {
      const local = this.mapMatchPrismaToLocal(m);
      if (this.asOfDate && m.date > this.asOfDate) {
        local.homeGoals = null;
        local.awayGoals = null;
      }
      return local;
    });

    const groupMatches = fixtures.filter((m) => !m.isKnockout);
    const knockoutMatches = matches.filter((m) => {
      if (!m.isKnockout) return false;
      if (this.asOfDate) {
        return m.date <= this.asOfDate;
      }
      return true;
    }).map(m => this.mapMatchPrismaToLocal(m));

    // Maps ELO and basic fields
    const initialEloMap: { [teamId: string]: number } = {};
    const teamGroupMap: { [teamId: string]: string } = {};
    
    teams.forEach((t) => {
      initialEloMap[t.id] = t.currentElo;
      if (t.group) {
        teamGroupMap[t.id] = t.group;
      }
    });

    const tournamentTeamIds = Array.from(new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])));
    const initialStandings: GroupStandings = {};
    
    this.config.groups.forEach((g) => {
      initialStandings[g] = [];
    });

    tournamentTeamIds.forEach((teamId) => {
      const g = teamGroupMap[teamId];
      if (g && this.config.groups.includes(g)) {
        initialStandings[g].push({
          teamId,
          group: g,
          points: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0
        });
      }
    });

    // Populate actual played matches in initial standings
    results.forEach((match) => {
      if (match.isKnockout) return;
      
      const homeStats = this.findTeamInStandings(initialStandings, match.homeTeamId);
      const awayStats = this.findTeamInStandings(initialStandings, match.awayTeamId);

      if (homeStats && awayStats && match.homeGoals !== null && match.awayGoals !== null) {
        this.updateStandingsStats(homeStats, awayStats, match.homeGoals, match.awayGoals);
      }
    });

    // Accumulate results
    const accumulator: {
      [teamId: string]: {
        winGroup: number;
        champions: number;
        final: number;
        semifinals: number;
        quarterfinals: number;
        roundOf16: number;
        roundOf32: number;
      };
    } = {};

    tournamentTeamIds.forEach((id) => {
      accumulator[id] = {
        winGroup: 0,
        champions: 0,
        final: 0,
        semifinals: 0,
        quarterfinals: 0,
        roundOf16: 0,
        roundOf32: 0,
      };
    });

    // Pre-calculate shootout winners map for real-world draws to avoid 64 million operations in MC loop
    const shootoutWinnersMap: { [matchId: number]: string } = {};
    matches.forEach((match) => {
      if (match.isKnockout && match.homeGoals !== null && match.awayGoals !== null && match.homeGoals === match.awayGoals) {
        const homeAdvanced = matches.some(
          (m) =>
            m.isKnockout &&
            m.date > match.date &&
            (m.homeTeamId === match.homeTeamId || m.awayTeamId === match.homeTeamId)
        );
        const awayAdvanced = matches.some(
          (m) =>
            m.isKnockout &&
            m.date > match.date &&
            (m.homeTeamId === match.awayTeamId || m.awayTeamId === match.awayTeamId)
        );
        if (homeAdvanced && !awayAdvanced) {
          shootoutWinnersMap[match.id] = match.homeTeamId;
        } else if (awayAdvanced && !homeAdvanced) {
          shootoutWinnersMap[match.id] = match.awayTeamId;
        }
      }
    });

    // Monte Carlo loop
    for (let sim = 0; sim < this.simulationsCount; sim++) {
      const simElo = { ...initialEloMap };
      const simStandings: GroupStandings = {};
      this.config.groups.forEach((g) => {
        simStandings[g] = initialStandings[g].map((t) => ({ ...t }));
      });

      const simResults: Match[] = [];

      // A. Simulate group fixtures
      groupMatches.forEach((fixture) => {
        const homeAdvantage = (this.config.groupStageDefaultLocation === fixture.homeTeamId) ? 100 : 0;
        const homeElo = simElo[fixture.homeTeamId] + homeAdvantage;
        const awayElo = simElo[fixture.awayTeamId];

        const isHomeFav = homeElo >= awayElo;
        const favUnderdogDiff = Math.abs(homeElo - awayElo);
        const marginResult = simulateResult(favUnderdogDiff);

        const margin = Math.abs(marginResult);
        const lower = getLowerScore(margin);
        const higher = margin + lower;

        let homeGoals = 0;
        let awayGoals = 0;

        if (marginResult > 0) {
          homeGoals = isHomeFav ? higher : lower;
          awayGoals = isHomeFav ? lower : higher;
        } else if (marginResult < 0) {
          homeGoals = isHomeFav ? lower : higher;
          awayGoals = isHomeFav ? higher : lower;
        } else {
          homeGoals = lower;
          awayGoals = lower;
        }

        simResults.push({
          ...fixture,
          homeGoals,
          awayGoals
        });

        const homeStats = this.findTeamInStandings(simStandings, fixture.homeTeamId);
        const awayStats = this.findTeamInStandings(simStandings, fixture.awayTeamId);
        if (homeStats && awayStats) {
          this.updateStandingsStats(homeStats, awayStats, homeGoals, awayGoals);
        }

        const favTeam = isHomeFav ? fixture.homeTeamId : fixture.awayTeamId;
        const undTeam = isHomeFav ? fixture.awayTeamId : fixture.homeTeamId;
        const ratingChange = calculateRatingChange(simElo[favTeam], simElo[undTeam], marginResult, this.config.code);
        simElo[favTeam] += ratingChange;
        simElo[undTeam] -= ratingChange;
      });

      // B. Sort standings
      const rankedStandings: GroupStandings = {};
      this.config.groups.forEach((g) => {
        const groupMatchesForSort = [
          ...results.filter((m) => !m.isKnockout),
          ...simResults.filter((m) => !m.isKnockout)
        ];
        rankedStandings[g] = this.config.sortGroupStandings(simStandings[g], groupMatchesForSort);

        if (rankedStandings[g] && rankedStandings[g].length > 0) {
          const groupWinnerId = rankedStandings[g][0].teamId;
          if (accumulator[groupWinnerId]) {
            accumulator[groupWinnerId].winGroup++;
          }
        }
      });

      // C. Knockout stages
      let stageMatches = this.config.buildKnockoutBracket(rankedStandings);
      
      // Increment roundOf32 counts
      stageMatches.forEach((m) => {
        if (accumulator[m.homeTeamId]) accumulator[m.homeTeamId].roundOf32++;
        if (accumulator[m.awayTeamId]) accumulator[m.awayTeamId].roundOf32++;
      });

      let stageIndex = 0;
      let currentStageName = this.config.knockoutStages[0];

      while (stageMatches.length > 0) {
        const nextStageName = this.config.knockoutStages[stageIndex + 1];
        const winners: string[] = [];

        for (let mIdx = 0; mIdx < stageMatches.length; mIdx++) {
          const match = stageMatches[mIdx];
          
          const actualResult = knockoutMatches.find(
            (m) =>
              (m.homeTeamId === match.homeTeamId && m.awayTeamId === match.awayTeamId) ||
              (m.homeTeamId === match.awayTeamId && m.awayTeamId === match.homeTeamId)
          );

          let winner = '';

          if (actualResult && actualResult.homeGoals !== null && actualResult.awayGoals !== null) {
            if (actualResult.homeGoals > actualResult.awayGoals) {
              winner = actualResult.homeTeamId;
            } else if (actualResult.awayGoals > actualResult.homeGoals) {
              winner = actualResult.awayTeamId;
            } else {
              // Draw: determine who won the penalty shootout by checking who advanced to a subsequent round in matches
              winner = shootoutWinnersMap[actualResult.id] || (Math.random() < 0.5 ? actualResult.homeTeamId : actualResult.awayTeamId);
            }
          } else {
            const location = this.config.getKnockoutMatchLocation(currentStageName, mIdx);
            const homeAdvantage = (location === match.homeTeamId) ? 100 : 0;
            const homeElo = simElo[match.homeTeamId] + homeAdvantage;
            const awayElo = simElo[match.awayTeamId];

            const isHomeFav = homeElo >= awayElo;
            const favUnderdogDiff = Math.abs(homeElo - awayElo);
            let marginResult = simulateResult(favUnderdogDiff);

            let isDraw = marginResult === 0;
            let shootoutWinner = '';
            if (isDraw) {
              marginResult = Math.round(simulateResult(favUnderdogDiff * 0.4) / 2.5);
              isDraw = marginResult === 0;
              if (isDraw) {
                const we = 1 / (Math.pow(10, -favUnderdogDiff / 400) + 1);
                const penaltyWe = 0.5 + (we - 0.5) / 4;
                shootoutWinner = Math.random() <= penaltyWe ? (isHomeFav ? match.homeTeamId : match.awayTeamId) : (isHomeFav ? match.awayTeamId : match.homeTeamId);
              }
            }

            if (shootoutWinner) {
              winner = shootoutWinner;
            } else if (marginResult > 0) {
              winner = isHomeFav ? match.homeTeamId : match.awayTeamId;
            } else {
              winner = isHomeFav ? match.awayTeamId : match.homeTeamId;
            }

            const favTeam = isHomeFav ? match.homeTeamId : match.awayTeamId;
            const undTeam = isHomeFav ? match.awayTeamId : match.homeTeamId;
            const ratingChange = calculateRatingChange(simElo[favTeam], simElo[undTeam], marginResult, this.config.code);
            simElo[favTeam] += ratingChange;
            simElo[undTeam] -= ratingChange;
          }

          winners.push(winner);

          if (accumulator[winner] && nextStageName) {
            const nextStageKey = nextStageName as keyof typeof accumulator[string];
            if (accumulator[winner][nextStageKey] !== undefined) {
              accumulator[winner][nextStageKey]++;
            }
          }
        }

        if (stageMatches.length === 1) {
          break;
        }

        const nextStageMatches: Matchup[] = [];
        for (let i = 0; i < winners.length; i += 2) {
          nextStageMatches.push({
            homeTeamId: winners[i],
            awayTeamId: winners[i + 1],
            isKnockout: true,
            stageName: nextStageName,
          });
        }

        stageMatches = nextStageMatches;
        stageIndex++;
        currentStageName = nextStageName;
      }
    }

    // 4. Save results
    console.log(`Writing simulation results to database for ${this.config.code} (${this.description})...`);

    const existingRun = await prisma.simulationRun.findFirst({
      where: {
        tournament: this.config.code,
        description: this.description,
      },
    });

    if (existingRun) {
      await prisma.simulationRun.delete({
        where: { id: existingRun.id },
      });
    }

    const run = await prisma.simulationRun.create({
      data: {
        tournament: this.config.code,
        description: this.description,
      },
    });

    for (const [teamId, totals] of Object.entries(accumulator)) {
      const winGroup = totals.winGroup / this.simulationsCount;
      const roundOf32 = totals.roundOf32 / this.simulationsCount;
      const roundOf16 = totals.roundOf16 / this.simulationsCount;
      const champions = totals.champions / this.simulationsCount;
      const final = totals.final / this.simulationsCount;
      const semifinals = totals.semifinals / this.simulationsCount;
      const quarterfinals = totals.quarterfinals / this.simulationsCount;

      await prisma.prediction.create({
        data: {
          simulationRunId: run.id,
          teamId,
          tournament: this.config.code,
          winGroup,
          roundOf32,
          roundOf16,
          champions,
          final,
          semifinals,
          quarterfinals,
        },
      });
    }

    console.log(`Successfully completed all simulations for ${this.config.code} (${this.description}).`);
  }

  private findTeamInStandings(standings: GroupStandings, teamId: string): TeamStats | null {
    for (const group of Object.values(standings)) {
      const stats = group.find((t) => t.teamId === teamId);
      if (stats) return stats;
    }
    return null;
  }

  private updateStandingsStats(home: TeamStats, away: TeamStats, homeGoals: number, awayGoals: number) {
    home.played++;
    away.played++;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    home.goalDifference += (homeGoals - awayGoals);
    
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;
    away.goalDifference += (awayGoals - homeGoals);

    if (homeGoals > awayGoals) {
      home.points += 3;
      home.won++;
      away.lost++;
    } else if (awayGoals > homeGoals) {
      away.points += 3;
      away.won++;
      home.lost++;
    } else {
      home.points += 1;
      away.points += 1;
      home.drawn++;
      away.drawn++;
    }
  }

  private mapMatchPrismaToLocal(m: any): Match {
    return {
      id: m.id,
      tournament: m.tournament,
      date: m.date,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      isKnockout: m.isKnockout
    };
  }
}
