import type { Match as PrismaMatch } from '@/app/generated/prisma/client';
import { prisma } from '../db';
import { TournamentConfig, TeamStats, GroupStandings, Matchup, Match, PlayoffOutcome, TieResult } from './types';
import { decideByGoals, twoLeggedStats } from './ties';
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

    // 2. Fetch matches for this tournament (or every source tournament of a
    // multi-league config, which simulates its leagues in one pass)
    const sources = this.config.sourceTournaments ?? [this.config.code];
    const tournamentFilter = sources.length === 1 ? sources[0] : { in: sources };
    const matches = await prisma.match.findMany({
      where: { tournament: tournamentFilter },
      orderBy: { date: 'asc' },
    });

    // 3. Fetch this tournament's team-group assignments (per-tournament, so
    // different tournaments never overwrite each other's group data)
    const teamTournamentGroups = await prisma.teamTournamentGroup.findMany({
      where: { tournament: tournamentFilter },
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
    });

    teamTournamentGroups.forEach((tg) => {
      teamGroupMap[tg.teamId] = tg.group;
    });

    // Reconstruct ELO ratings as of this milestone's date by reversing post-cutoff rating changes
    const cutOff = this.asOfDate;
    if (cutOff) {
      const postCutoffMatches = matches.filter(m => m.date > cutOff);
      postCutoffMatches.forEach((m) => {
        if (m.ratingChange) {
          if (initialEloMap[m.homeTeamId] !== undefined) {
            initialEloMap[m.homeTeamId] -= m.ratingChange;
          }
          if (initialEloMap[m.awayTeamId] !== undefined) {
            initialEloMap[m.awayTeamId] += m.ratingChange;
          }
        }
      });
    }

    const knownTeamIds = new Set(teams.map((t) => t.id));
    const additionalTeamIds = (this.config.additionalTeamIds ?? []).filter((id) => {
      if (!knownTeamIds.has(id)) console.warn(`Ignoring additional team ${id}: not in the Team table.`);
      return knownTeamIds.has(id);
    });
    const tournamentTeamIds = Array.from(
      new Set([...matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]), ...additionalTeamIds])
    );
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

    this.config.groups.forEach((g) => {
      if (initialStandings[g].length === 0) {
        throw new Error(
          `Simulation aborted: group "${g}" for tournament "${this.config.code}" has no teams. ` +
          `Check TeamTournamentGroup assignments and Match fixtures for this tournament.`
        );
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

    // Accumulate results. The set of tracked milestones (and their meaning)
    // is entirely declared by config.milestones, so different tournaments
    // never share or clash over accumulator shape.
    const accumulator: { [teamId: string]: { [milestone: string]: number } } = {};

    tournamentTeamIds.forEach((id) => {
      accumulator[id] = {};
      this.config.milestones.forEach((milestone) => {
        accumulator[id][milestone] = 0;
      });
    });

    // Pre-calculate shootout winners map for real-world single-match draws to avoid
    // 64 million operations in the MC loop
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

    const firstKnockoutStage = this.config.knockoutStages[0];

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
        const homeHosts = this.config.hostsHomeMatch?.(fixture.homeTeamId, fixture.awayTeamId) ?? true;
        const homeAdvantage = (homeHosts && fixture.location === fixture.homeTeamId) ? 100 : 0;
        const awayAdvantage = (fixture.location === fixture.awayTeamId) ? 100 : 0;
        const homeElo = simElo[fixture.homeTeamId] + homeAdvantage;
        const awayElo = simElo[fixture.awayTeamId] + awayAdvantage;

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
        const ratingChange = calculateRatingChange(simElo[favTeam], simElo[undTeam], marginResult, fixture.tournament);
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
      });

      // Award group-phase milestones (e.g. "winGroup"). Each tournament
      // declares its own meaning for these via evaluateGroupPhaseMilestones;
      // a tournament with none simply omits the hook.
      const groupPhaseMilestones = this.config.evaluateGroupPhaseMilestones?.(rankedStandings) ?? {};
      Object.entries(groupPhaseMilestones).forEach(([teamId, milestoneNames]) => {
        milestoneNames.forEach((milestone) => {
          if (accumulator[teamId] && accumulator[teamId][milestone] !== undefined) {
            accumulator[teamId][milestone]++;
          }
        });
      });

      // Cross-league playoffs (e.g. promotion/relegation), resolved with the
      // same two-legged machinery as knockout ties.
      if (this.config.buildPlayoffTies && this.config.evaluatePlayoffMilestones) {
        const playoffOutcomes: PlayoffOutcome[] = [];
        this.groupIntoTies(this.config.buildPlayoffTies(rankedStandings, knockoutMatches)).forEach((tie) => {
          const { winnerId } = this.resolveTwoLeggedTie(tie, knockoutMatches, simElo);
          const teamA = tie[0].homeTeamId;
          const teamB = tie[0].awayTeamId;
          playoffOutcomes.push({
            stageName: tie[0].stageName,
            winnerId,
            loserId: winnerId === teamA ? teamB : teamA,
            leg1HomeTeamId: teamA,
          });
        });
        Object.entries(this.config.evaluatePlayoffMilestones(playoffOutcomes)).forEach(([teamId, names]) => {
          names.forEach((milestone) => {
            if (accumulator[teamId] && accumulator[teamId][milestone] !== undefined) {
              accumulator[teamId][milestone]++;
            }
          });
        });
      }

      // C. Knockout stages
      let ties = this.groupIntoTies(this.config.buildKnockoutBracket(rankedStandings, knockoutMatches));

      // Increment the "reached the first knockout stage" milestone once per team
      if (firstKnockoutStage) {
        const firstStageTeamIds = Array.from(new Set(ties.flat().flatMap((m) => [m.homeTeamId, m.awayTeamId])));
        firstStageTeamIds.forEach((id) => {
          if (accumulator[id] && accumulator[id][firstKnockoutStage] !== undefined) {
            accumulator[id][firstKnockoutStage]++;
          }
        });
      }

      let stageIndex = 0;
      let currentStageName = this.config.knockoutStages[0];
      let dynamicHostTeamId: string | null = null;

      while (ties.length > 0) {
        if (
          currentStageName &&
          this.config.dynamicHostStages?.includes(currentStageName) &&
          dynamicHostTeamId === null
        ) {
          const candidateTeamIds = Array.from(new Set(ties.flat().flatMap((m) => [m.homeTeamId, m.awayTeamId])));
          dynamicHostTeamId = this.config.selectDynamicHost?.(currentStageName, candidateTeamIds) ?? null;
        }

        const nextStageName = this.config.knockoutStages[stageIndex + 1];
        let winners: string[] = [];
        const stageResults: TieResult[] = [];

        for (let tIdx = 0; tIdx < ties.length; tIdx++) {
          const tieMatchups = ties[tIdx];
          let winner: string;

          if (tieMatchups.length === 2) {
            const result = this.resolveTwoLeggedTie(tieMatchups, knockoutMatches, simElo);
            stageResults.push(result);
            winner = result.winnerId;
          } else {
            winner = this.resolveSingleKnockoutMatch(
              tieMatchups[0],
              tIdx,
              currentStageName,
              knockoutMatches,
              shootoutWinnersMap,
              simElo,
              dynamicHostTeamId
            );
          }

          if (tieMatchups.length !== 2) {
            stageResults.push({ winnerId: winner, teamAId: tieMatchups[0].homeTeamId, teamBId: tieMatchups[0].awayTeamId, stats: {} });
          }
          winners.push(winner);

          if (accumulator[winner] && nextStageName && accumulator[winner][nextStageName] !== undefined) {
            accumulator[winner][nextStageName]++;
          }
        }

        if (ties.length === 1) {
          break;
        }

        // Some formats pair the next round by this round's results rather
        // than by bracket position.
        if (this.config.orderStageWinners) {
          const ordered = this.config.orderStageWinners(currentStageName, stageResults);
          if (ordered.length !== winners.length || ordered.some((id) => !winners.includes(id))) {
            throw new Error(`orderStageWinners for ${currentStageName} must return the stage's winners, reordered.`);
          }
          winners = ordered;
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

        ties = this.groupIntoTies(nextStageMatches);
        stageIndex++;
        currentStageName = nextStageName;
      }
    }

    // 4. Save results. A single-tournament config writes one run under its
    // own code; a multi-league config writes one run per league, each team's
    // predictions limited to its own league's milestones.
    const leagues = this.config.leagues ?? [
      { code: this.config.code, groups: this.config.groups, milestones: this.config.milestones },
    ];
    const leagueOfTeam = (teamId: string) => {
      const group = teamGroupMap[teamId];
      return leagues.find((l) => l.groups.includes(group));
    };

    for (const league of leagues) {
      console.log(`Writing simulation results to database for ${league.code} (${this.description})...`);

      const existingRun = await prisma.simulationRun.findFirst({
        where: {
          tournament: league.code,
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
          tournament: league.code,
          description: this.description,
        },
      });

      for (const [teamId, totals] of Object.entries(accumulator)) {
        if (this.config.leagues && leagueOfTeam(teamId)?.code !== league.code) continue;
        const eloAtSimulation = Math.round(initialEloMap[teamId] ?? 0);
        for (const milestone of league.milestones) {
          await prisma.prediction.create({
            data: {
              simulationRunId: run.id,
              teamId,
              tournament: league.code,
              milestone,
              probability: totals[milestone] / this.simulationsCount,
              eloAtSimulation,
            },
          });
        }
      }
    }

    console.log(`Successfully completed all simulations for ${this.config.code} (${this.description}).`);
  }

  // Groups a stage's Matchups into "ties" to resolve: single matches stay
  // as their own 1-entry tie, while entries sharing a tieId (two-legged
  // ties) are grouped together, ordered by tieLeg.
  private groupIntoTies(matchups: Matchup[]): Matchup[][] {
    const ties: Matchup[][] = [];
    const seenTieIds = new Set<string>();

    matchups.forEach((m) => {
      if (m.tieId) {
        if (seenTieIds.has(m.tieId)) return;
        seenTieIds.add(m.tieId);
        const legs = matchups
          .filter((x) => x.tieId === m.tieId)
          .sort((a, b) => (a.tieLeg ?? 1) - (b.tieLeg ?? 1));
        ties.push(legs);
      } else {
        ties.push([m]);
      }
    });

    return ties;
  }

  // Resolves a single (non-two-legged) knockout match: uses the real result
  // if one exists (including penalty-shootout winner detection via
  // shootoutWinnersMap), otherwise simulates a win/loss/penalties outcome.
  // This is the original single-match knockout algorithm, unchanged.
  private resolveSingleKnockoutMatch(
    match: Matchup,
    matchIndex: number,
    stageName: string,
    knockoutMatches: Match[],
    shootoutWinnersMap: { [matchId: number]: string },
    simElo: { [teamId: string]: number },
    dynamicHostTeamId: string | null
  ): string {
    const actualResult = knockoutMatches.find(
      (m) =>
        (m.homeTeamId === match.homeTeamId && m.awayTeamId === match.awayTeamId) ||
        (m.homeTeamId === match.awayTeamId && m.awayTeamId === match.homeTeamId)
    );

    if (actualResult && actualResult.homeGoals !== null && actualResult.awayGoals !== null) {
      if (actualResult.homeGoals > actualResult.awayGoals) {
        return actualResult.homeTeamId;
      }
      if (actualResult.awayGoals > actualResult.homeGoals) {
        return actualResult.awayTeamId;
      }
      return shootoutWinnersMap[actualResult.id] || (Math.random() < 0.5 ? actualResult.homeTeamId : actualResult.awayTeamId);
    }

    const location = dynamicHostTeamId ?? this.config.getKnockoutMatchLocation(stageName, matchIndex);
    const homeAdvantage = (location === match.homeTeamId) ? 100 : 0;
    const awayAdvantage = (location === match.awayTeamId) ? 100 : 0;
    const homeElo = simElo[match.homeTeamId] + homeAdvantage;
    const awayElo = simElo[match.awayTeamId] + awayAdvantage;

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

    let winner: string;
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

    return winner;
  }

  // Resolves a two-legged tie by simulating (or using real results for) each
  // leg's actual scoreline and comparing aggregate goals (then away goals, if
  // the config uses that rule), falling back to a penalty-probability coin
  // flip on a level tie. Known simplification:
  // unlike single knockout matches, this doesn't check real subsequent-round
  // data to resolve a real aggregate draw (extra time / shootout) — it always
  // uses the ELO-weighted probability, since two legs' worth of real dates
  // makes the "who appears in a later round" lookup ambiguous without an
  // explicit tie identifier in the database.
  private resolveTwoLeggedTie(
    legs: Matchup[],
    knockoutMatches: Match[],
    simElo: { [teamId: string]: number }
  ): TieResult {
    const leg1 = legs.find((l) => l.tieLeg === 1) ?? legs[0];
    const leg2 = legs.find((l) => l.tieLeg === 2) ?? legs[1];

    const teamA = leg1.homeTeamId; // hosts leg 1
    const teamB = leg1.awayTeamId; // hosts leg 2

    const leg1Score = this.resolveLegGoals(leg1.homeTeamId, leg1.awayTeamId, knockoutMatches, simElo);
    const leg2Score = this.resolveLegGoals(leg2.homeTeamId, leg2.awayTeamId, knockoutMatches, simElo);
    const stats = twoLeggedStats(teamA, teamB, leg1Score, leg2Score);

    const decided = decideByGoals(leg1Score, leg2Score, this.config.twoLeggedAwayGoals ?? false);
    if (decided) {
      return { winnerId: decided === 'A' ? teamA : teamB, teamAId: teamA, teamBId: teamB, stats };
    }

    const ratingDiff = simElo[teamA] - simElo[teamB];
    const isAFav = ratingDiff >= 0;
    const we = 1 / (Math.pow(10, -Math.abs(ratingDiff) / 400) + 1);
    const penaltyWe = 0.5 + (we - 0.5) / 4;
    const favWon = Math.random() <= penaltyWe;
    const winnerId = isAFav ? (favWon ? teamA : teamB) : favWon ? teamB : teamA;
    return { winnerId, teamAId: teamA, teamBId: teamB, stats };
  }

  // Resolves one leg's scoreline: the real result if it's already been
  // played, otherwise a simulated scoreline (with the home team always
  // getting the home-field ELO boost, since a leg is by definition played
  // at its designated home team's ground, unless the config says that team
  // cannot host).
  private resolveLegGoals(
    homeTeamId: string,
    awayTeamId: string,
    knockoutMatches: Match[],
    simElo: { [teamId: string]: number }
  ): { homeGoals: number; awayGoals: number } {
    const actual = knockoutMatches.find(
      (m) => m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId
    );
    if (actual && actual.homeGoals !== null && actual.awayGoals !== null) {
      return { homeGoals: actual.homeGoals, awayGoals: actual.awayGoals };
    }

    const homeHosts = this.config.hostsHomeMatch?.(homeTeamId, awayTeamId) ?? true;
    const homeElo = simElo[homeTeamId] + (homeHosts ? 100 : 0);
    const awayElo = simElo[awayTeamId];

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

    const favTeam = isHomeFav ? homeTeamId : awayTeamId;
    const undTeam = isHomeFav ? awayTeamId : homeTeamId;
    const ratingChange = calculateRatingChange(simElo[favTeam], simElo[undTeam], marginResult, this.config.code);
    simElo[favTeam] += ratingChange;
    simElo[undTeam] -= ratingChange;

    return { homeGoals, awayGoals };
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

  private mapMatchPrismaToLocal(m: PrismaMatch): Match {
    return {
      id: m.id,
      tournament: m.tournament,
      date: m.date,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      isKnockout: m.isKnockout,
      location: m.location,
      ratingChange: m.ratingChange
    };
  }
}
