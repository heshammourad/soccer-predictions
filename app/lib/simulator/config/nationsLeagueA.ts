import { TournamentConfig, GroupStandings, Matchup, TeamStats, Match } from '../types';
import { sortGroup } from './base';
import { UEFA_NATIONS_LEAGUE_TIEBREAKERS } from './nationsLeagueTiebreakers';
import { CertaintyRules } from '../certainty';

// 2026-27 UEFA Nations League A. League phase: 4 groups of 4
// (A1-A4, 24 Sep - 17 Nov 2026); group winners + runners-up advance to
// two-legged quarterfinals (March 2027, winner hosts leg 2, opponent drawn
// from a different group); the 4 QF winners play the Finals (semifinals +
// final, single matches, June 2027, hosted by one of the semifinalists).
export class NationsLeagueAConfig implements TournamentConfig {
  code = 'ENA';
  name = '2026-27 UEFA Nations League';
  groups = ['A1', 'A2', 'A3', 'A4'];
  knockoutStages = ['quarterfinals', 'semifinals', 'final', 'champions'];
  milestones = ['winGroup', 'quarterfinals', 'semifinals', 'final', 'champions'];
  groupStageDefaultLocation = null;

  // The Finals host isn't fixed by the bracket (unlike a QF leg, whose home
  // team is structurally determined) — selectDynamicHost resolves it.
  dynamicHostStages = ['semifinals'];

  getKnockoutMatchLocation(): string | null {
    return null;
  }

  selectDynamicHost(stageName: string, candidateTeamIds: string[]): string | null {
    if (candidateTeamIds.length === 0) return null;
    return candidateTeamIds[Math.floor(Math.random() * candidateTeamIds.length)];
  }

  groupRules = UEFA_NATIONS_LEAGUE_TIEBREAKERS;
  twoLeggedStages = ['quarterfinals'];
  certainty: CertaintyRules = {
    winGroup: { position: [1, 1] },
    quarterfinals: { position: [1, 2] },
  };

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return sortGroup(teams, matches, this.groupRules);
  }

  evaluateGroupPhaseMilestones(rankedStandings: GroupStandings): { [teamId: string]: string[] } {
    const milestones: { [teamId: string]: string[] } = {};
    this.groups.forEach((group) => {
      const standings = rankedStandings[group];
      if (standings && standings.length > 0) {
        const groupWinnerId = standings[0].teamId;
        milestones[groupWinnerId] = [...(milestones[groupWinnerId] ?? []), 'winGroup'];
      }
    });
    return milestones;
  }

  // Pairs each group's winner against a runner-up from a different group,
  // for a two-legged tie (runner-up hosts leg 1, group winner hosts leg 2).
  // Prefers UEFA's real drawn pairing once it's been synced into the
  // database as a knockout fixture; falls back to a random valid pairing
  // (redrawn fresh each Monte Carlo iteration) before the real draw exists.
  buildKnockoutBracket(groupStandings: GroupStandings, knownKnockoutFixtures: Match[]): Matchup[] {
    const winners = this.groups
      .map((g) => groupStandings[g]?.[0]?.teamId)
      .filter((id): id is string => Boolean(id));
    const runnersUp = this.groups
      .map((g) => groupStandings[g]?.[1]?.teamId)
      .filter((id): id is string => Boolean(id));

    const groupOfRunnerUp = (teamId: string) =>
      this.groups.find((g) => groupStandings[g]?.[1]?.teamId === teamId);
    const groupOfWinner = (teamId: string) =>
      this.groups.find((g) => groupStandings[g]?.[0]?.teamId === teamId);

    const pairing = new Map<string, string>(); // winner -> runner-up
    const usedRunnersUp = new Set<string>();

    winners.forEach((winner) => {
      const realMatch = knownKnockoutFixtures.find(
        (m) =>
          m.tournament === this.code &&
          ((m.homeTeamId === winner && runnersUp.includes(m.awayTeamId)) ||
            (m.awayTeamId === winner && runnersUp.includes(m.homeTeamId)))
      );
      if (realMatch) {
        const runnerUp = realMatch.homeTeamId === winner ? realMatch.awayTeamId : realMatch.homeTeamId;
        pairing.set(winner, runnerUp);
        usedRunnersUp.add(runnerUp);
      }
    });

    const remainingWinners = winners.filter((w) => !pairing.has(w));
    const remainingRunnersUp = runnersUp.filter((r) => !usedRunnersUp.has(r));

    // Randomly pair whatever's left, retrying the shuffle if it happens to
    // leave a winner facing a runner-up from its own group (a greedy
    // one-at-a-time random pick can paint itself into exactly that corner
    // once few options remain, so pick-then-check-then-retry instead).
    let shuffled = remainingRunnersUp;
    for (let attempt = 0; attempt < 200; attempt++) {
      shuffled = [...remainingRunnersUp].sort(() => Math.random() - 0.5);
      const valid = remainingWinners.every(
        (w, i) => groupOfWinner(w) !== groupOfRunnerUp(shuffled[i])
      );
      if (valid) break;
    }
    remainingWinners.forEach((winner, i) => {
      if (shuffled[i]) pairing.set(winner, shuffled[i]);
    });

    const matchups: Matchup[] = [];
    let tieIndex = 0;
    pairing.forEach((runnerUp, winner) => {
      const tieId = `${this.code}-qf-${tieIndex++}`;
      // Leg 1: runner-up hosts. Leg 2: group winner hosts.
      matchups.push({ homeTeamId: runnerUp, awayTeamId: winner, isKnockout: true, stageName: 'quarterfinals', tieId, tieLeg: 1 });
      matchups.push({ homeTeamId: winner, awayTeamId: runnerUp, isKnockout: true, stageName: 'quarterfinals', tieId, tieLeg: 2 });
    });

    return matchups;
  }
}
