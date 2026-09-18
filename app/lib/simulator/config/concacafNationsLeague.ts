import { TournamentConfig, GroupStandings, Matchup, Match, TeamStats, TieResult } from '../types';
import { rankAcrossGroups, sortOverallThenH2H } from './base';

// 2026-27 CONCACAF Nations League (Concacaf regulations, art. 12). Each league
// is simulated on its own: the only links between them are the Play-In and Gold
// Cup preliminary round, which aren't modelled.
//
// Groups are ranked by the overall record first and head-to-head only as a
// tiebreaker (see sortOverallThenH2H). Fair-play points aren't tracked, and
// drawing of lots is random.

// The four League A teams seeded straight into the quarter-finals, best first:
// the Concacaf Ranking of 20 July 2026 (Mexico, United States, Canada, Panama).
export const CNL_A_SEEDS = ['MX', 'US', 'CA', 'PA'];

// The League A Finals are played at a single venue (SoFi Stadium, Los
// Angeles), so the United States has home advantage there if it gets that far.
const FINALS_HOST = 'US';

// ---------------------------------------------------------------------------
// League A: 16 teams. The 12 lowest-ranked play a Swiss-style group stage (two
// groups of six, four matches each). The top two of each group join the four
// seeds in two-legged quarter-finals; the winners play the Finals (semi-finals
// 1 v 4 and 2 v 3, then a final). The 5th and 6th placed teams are relegated.
// ---------------------------------------------------------------------------
export class ConcacafLeagueAConfig implements TournamentConfig {
  code = 'CLA';
  name = '2026-27 CONCACAF Nations League A';
  groups = ['A1', 'A2'];
  knockoutStages = ['quarterfinals', 'semifinals', 'final', 'champions'];
  milestones = ['winGroup', 'quarterfinals', 'semifinals', 'final', 'champions', 'relegated'];
  groupStageDefaultLocation = null;
  additionalTeamIds = CNL_A_SEEDS;
  // A quarter-final level on aggregate goes to away goals (counted double).
  twoLeggedAwayGoals = true;

  // Only the single-match Finals use this; the quarter-finals are two-legged.
  getKnockoutMatchLocation(): string | null {
    return FINALS_HOST;
  }

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return sortOverallThenH2H(teams, matches);
  }

  evaluateGroupPhaseMilestones(rankedStandings: GroupStandings): { [teamId: string]: string[] } {
    const milestones: { [teamId: string]: string[] } = {};
    this.groups.forEach((group) => {
      const standings = rankedStandings[group] ?? [];
      if (standings[0]) milestones[standings[0].teamId] = ['winGroup'];
      // 5th and 6th are relegated to League B.
      standings.slice(4, 6).forEach((t) => (milestones[t.teamId] = ['relegated']));
    });
    return milestones;
  }

  // Quarter-finals (12.10): each seed meets one of the four group qualifiers.
  // The two group winners and the two runners-up are ranked against each other
  // on their group record (points, GD, goals scored, lots) and drawn as
  //   4th seed v best winner, 3rd seed v next winner,
  //   2nd seed v best runner-up, 1st seed v next runner-up.
  // A real pairing is preferred once it has been published as a fixture.
  buildKnockoutBracket(groupStandings: GroupStandings, knownKnockoutFixtures: Match[]): Matchup[] {
    const winners = rankAcrossGroups(groupStandings, this.groups, 1).map((t) => t.teamId);
    const runnersUp = rankAcrossGroups(groupStandings, this.groups, 2).map((t) => t.teamId);
    const qualifiers = [...winners, ...runnersUp];

    // Seeds in quarter-final order (QF1 = 4th seed ... QF4 = 1st seed) and the
    // qualifier each meets by default.
    const seeds = [...CNL_A_SEEDS].reverse();
    const defaults = [winners[0], winners[1], runnersUp[0], runnersUp[1]];

    const taken = new Set<string>();
    const opponents: (string | undefined)[] = seeds.map((seed) => {
      const real = knownKnockoutFixtures.find(
        (m) =>
          (m.homeTeamId === seed && qualifiers.includes(m.awayTeamId) && !taken.has(m.awayTeamId)) ||
          (m.awayTeamId === seed && qualifiers.includes(m.homeTeamId) && !taken.has(m.homeTeamId))
      );
      if (!real) return undefined;
      const opponent = real.homeTeamId === seed ? real.awayTeamId : real.homeTeamId;
      taken.add(opponent);
      return opponent;
    });
    // Everyone not already drawn against a seed fills the remaining places in
    // default order.
    const remaining = defaults.filter((id) => !taken.has(id));
    let next = 0;
    const paired = opponents.map((opponent) => opponent ?? remaining[next++]);

    const matchups: Matchup[] = [];
    seeds.forEach((seed, i) => {
      const opponent = paired[i];
      if (!opponent) return;
      const tieId = `${this.code}-qf-${i}`;
      // The regulations let the seeds choose the order of the legs but don't
      // say what they chose; a published fixture settles it, otherwise assume
      // the seed hosts the second leg.
      const firstReal = knownKnockoutFixtures
        .filter(
          (m) =>
            (m.homeTeamId === seed && m.awayTeamId === opponent) || (m.homeTeamId === opponent && m.awayTeamId === seed)
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
      const leg1Host = firstReal ? firstReal.homeTeamId : opponent;
      const leg1Away = leg1Host === seed ? opponent : seed;
      matchups.push({ homeTeamId: leg1Host, awayTeamId: leg1Away, isKnockout: true, stageName: 'quarterfinals', tieId, tieLeg: 1 });
      matchups.push({ homeTeamId: leg1Away, awayTeamId: leg1Host, isKnockout: true, stageName: 'quarterfinals', tieId, tieLeg: 2 });
    });
    return matchups;
  }

  // Finals semi-finals (12.16-12.17): the four quarter-final winners are ranked
  // on their quarter-final record (points, GD, goals scored, away goals, lots)
  // and play 1 v 4 and 2 v 3. Later rounds keep bracket order.
  orderStageWinners(stageName: string, results: TieResult[]): string[] {
    if (stageName !== 'quarterfinals') return results.map((r) => r.winnerId);
    const ranked = results
      .map((r) => ({ id: r.winnerId, stats: r.stats[r.winnerId] }))
      .sort(() => Math.random() - 0.5) // ties left after every criterion go to lots
      .sort((a, b) => {
        if (!a.stats || !b.stats) return 0;
        return (
          b.stats.points - a.stats.points ||
          b.stats.goalDifference - a.stats.goalDifference ||
          b.stats.goalsFor - a.stats.goalsFor ||
          b.stats.awayGoals - a.stats.awayGoals
        );
      })
      .map((r) => r.id);
    return ranked.length === 4 ? [ranked[0], ranked[3], ranked[1], ranked[2]] : ranked;
  }
}

// ---------------------------------------------------------------------------
// League B: 16 teams in four double round-robin groups. The group winner is
// promoted to League A (and qualifies for the 2027 Gold Cup); 4th is relegated.
// League B also has a Finals for its group winners, which isn't modelled.
// ---------------------------------------------------------------------------
export class ConcacafLeagueBConfig implements TournamentConfig {
  code = 'CLB';
  name = '2026-27 CONCACAF Nations League B';
  groups = ['B1', 'B2', 'B3', 'B4'];
  knockoutStages: string[] = [];
  milestones = ['promoted', 'relegated'];
  groupStageDefaultLocation = null;

  getKnockoutMatchLocation(): string | null {
    return null;
  }

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return sortOverallThenH2H(teams, matches);
  }

  evaluateGroupPhaseMilestones(rankedStandings: GroupStandings): { [teamId: string]: string[] } {
    const milestones: { [teamId: string]: string[] } = {};
    this.groups.forEach((group) => {
      const standings = rankedStandings[group] ?? [];
      if (standings[0]) milestones[standings[0].teamId] = ['promoted'];
      if (standings[3]) milestones[standings[3].teamId] = ['relegated'];
    });
    return milestones;
  }

  buildKnockoutBracket(): Matchup[] {
    return [];
  }
}

// ---------------------------------------------------------------------------
// League C: 9 teams in three double round-robin groups. The three group winners
// and the best runner-up (ranked across groups on their group record) are
// promoted to League B. League C also has a Finals, which isn't modelled.
// ---------------------------------------------------------------------------
export class ConcacafLeagueCConfig implements TournamentConfig {
  code = 'CLC';
  name = '2026-27 CONCACAF Nations League C';
  groups = ['C1', 'C2', 'C3'];
  knockoutStages: string[] = [];
  milestones = ['winGroup', 'promoted'];
  groupStageDefaultLocation = null;

  getKnockoutMatchLocation(): string | null {
    return null;
  }

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return sortOverallThenH2H(teams, matches);
  }

  evaluateGroupPhaseMilestones(rankedStandings: GroupStandings): { [teamId: string]: string[] } {
    const milestones: { [teamId: string]: string[] } = {};
    this.groups.forEach((group) => {
      const winner = rankedStandings[group]?.[0];
      if (winner) milestones[winner.teamId] = ['winGroup', 'promoted'];
    });
    const bestRunnerUp = rankAcrossGroups(rankedStandings, this.groups, 2)[0];
    if (bestRunnerUp) milestones[bestRunnerUp.teamId] = ['promoted'];
    return milestones;
  }

  buildKnockoutBracket(): Matchup[] {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Milestone snapshots. Used both by scripts/sync.ts (to run them) and by the
// dashboard (to pick each run's cutoff), so the dates can't drift apart. Group
// matchdays are read off the fixtures' dates (League A: 24-25 Sep, 27-28 Sep,
// 1-2 Oct, 4-5 Oct; League B: 24-26 Sep, 27-29 Sep, 1-3 Oct, 4-6 Oct, 13 Nov,
// 17 Nov; League C: one match per group on each of six dates). The League A
// quarter-finals are 9-17 Nov and the Finals 25-28 Mar; their exact dates
// aren't published yet.
// ---------------------------------------------------------------------------
export interface MilestoneSchedule {
  name: string;
  // ISO cutoff; undefined for the live "Current Projections" run.
  date?: string;
}

export const CLA_MILESTONES: MilestoneSchedule[] = [
  { name: 'Start (Pre-tournament)', date: '2026-09-22T23:59:59Z' },
  { name: 'Matchday 1 Completed', date: '2026-09-26T23:59:59Z' },
  { name: 'Matchday 2 Completed', date: '2026-09-29T23:59:59Z' },
  { name: 'Matchday 3 Completed', date: '2026-10-03T23:59:59Z' },
  { name: 'Matchday 4 Completed', date: '2026-10-06T23:59:59Z' },
  { name: 'Quarterfinals Completed', date: '2026-11-18T23:59:59Z' },
  { name: 'Tournament Completed', date: '2027-03-29T23:59:59Z' },
  { name: 'Current Projections' },
];

export const CLB_MILESTONES: MilestoneSchedule[] = [
  { name: 'Start (Pre-tournament)', date: '2026-09-22T23:59:59Z' },
  { name: 'Matchday 1 Completed', date: '2026-09-26T23:59:59Z' },
  { name: 'Matchday 2 Completed', date: '2026-09-29T23:59:59Z' },
  { name: 'Matchday 3 Completed', date: '2026-10-03T23:59:59Z' },
  { name: 'Matchday 4 Completed', date: '2026-10-06T23:59:59Z' },
  { name: 'Matchday 5 Completed', date: '2026-11-13T23:59:59Z' },
  { name: 'Matchday 6 Completed', date: '2026-11-17T23:59:59Z' },
  { name: 'Current Projections' },
];

export const CLC_MILESTONES: MilestoneSchedule[] = [
  { name: 'Start (Pre-tournament)', date: '2026-09-22T23:59:59Z' },
  { name: 'Matchday 1 Completed', date: '2026-09-23T23:59:59Z' },
  { name: 'Matchday 2 Completed', date: '2026-09-26T23:59:59Z' },
  { name: 'Matchday 3 Completed', date: '2026-09-29T23:59:59Z' },
  { name: 'Matchday 4 Completed', date: '2026-10-01T23:59:59Z' },
  { name: 'Matchday 5 Completed', date: '2026-10-04T23:59:59Z' },
  { name: 'Matchday 6 Completed', date: '2026-10-06T23:59:59Z' },
  { name: 'Current Projections' },
];

export const scheduleDates = (schedule: MilestoneSchedule[]): { [description: string]: string | undefined } =>
  Object.fromEntries(schedule.map((m) => [m.name, m.date]));
