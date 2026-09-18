import { TournamentConfig, GroupStandings, Matchup, TeamStats, Match } from '../types';
import { sortDoubleRoundRobinGroup, CAF_TIEBREAKERS } from './base';

// 2027 Africa Cup of Nations qualifiers (eloratings.net code `FQ`): 12 groups
// of 4 playing a double round-robin over six matchdays (Sep 2026 - Mar 2027).
// The top two of each group qualify, except that the three hosts (Kenya,
// Tanzania, Uganda) are already qualified: in each host's group only the
// best-placed non-host team qualifies alongside it. There is no knockout
// phase, so "qualified" is the only outcome tracked.
//
// Tiebreakers (CAF): points; then among the tied teams head-to-head points,
// GD, goals scored, away goals scored (both meetings count), re-applied to any
// still-tied subset of three or more; then overall GD, goals scored, away
// goals scored; then drawing of lots (random here). "Away" is the second-listed
// team of a fixture as published by eloratings.net, taken as given. Home
// advantage follows the feed's venue: a team gets it only when the fixture's
// location is its own ground, so a neutral venue favours neither side.
export const AFCON_HOSTS = ['KE', 'TZ', 'UG'];

export class AfricaCupQualifiersConfig implements TournamentConfig {
  code = 'FQ';
  name = '2027 Africa Cup of Nations Qualifiers';
  groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  knockoutStages: string[] = [];
  milestones = ['qualified'];
  groupStageDefaultLocation = null;

  getKnockoutMatchLocation(): string | null {
    return null;
  }

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return sortDoubleRoundRobinGroup(teams, matches, CAF_TIEBREAKERS);
  }

  evaluateGroupPhaseMilestones(rankedStandings: GroupStandings): { [teamId: string]: string[] } {
    const milestones: { [teamId: string]: string[] } = {};
    this.groups.forEach((group) => {
      const standings = rankedStandings[group] ?? [];
      const hosts = standings.filter((t) => AFCON_HOSTS.includes(t.teamId));
      // Hosts are through automatically, so each takes one of the two places.
      const slots = Math.max(0, 2 - hosts.length);
      hosts.forEach((t) => (milestones[t.teamId] = ['qualified']));
      standings
        .filter((t) => !AFCON_HOSTS.includes(t.teamId))
        .slice(0, slots)
        .forEach((t) => (milestones[t.teamId] = ['qualified']));
    });
    return milestones;
  }

  // No knockout phase.
  buildKnockoutBracket(): Matchup[] {
    return [];
  }
}
