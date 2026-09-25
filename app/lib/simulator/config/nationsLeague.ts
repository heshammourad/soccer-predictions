import { TournamentConfig, GroupStandings, Matchup, TeamStats, Match, League, PlayoffOutcome } from '../types';
import { rankAcrossGroups } from './base';
import { NationsLeagueAConfig } from './nationsLeagueA';
import { Condition } from '../certainty';

// 2026-27 UEFA Nations League, Leagues A-C simulated together in one Monte
// Carlo pass (League D isn't modelled: next edition has three leagues, so D
// has no relegation and every D team is promoted). Running the leagues
// together is what makes the cross-league playoffs possible, since a playoff
// opponent has to be the team the other league's simulation produced in that
// same iteration. Results are still written per league (ENA/ENB/ENC), so
// each league keeps its own dashboard page.
//
// Movement between leagues (Regulations art. 16):
//  - B and C group winners are promoted to the next league up (auto).
//  - A's 4th-placed teams ranked 15th-16th in the interim overall rankings
//    are relegated to B (auto).
//  - A/B playoff: A's two lowest-ranked 3rd-placed teams (ranks 11-12) and
//    two highest-ranked 4th-placed teams (13-14) vs the four B runners-up.
//  - B/C playoff: the four B 4th-placed teams vs the four C runners-up.
//  - Pairings are drawn (higher league seeded); two legs, the lower-league
//    team hosts leg 1; winners play in the higher league next edition.
//
// Simplifications: draw conditions are ignored, and the cross-group ranking
// tiebreak after points/GD/GF is random rather than the full art. 19.02
// criteria.
const A_GROUPS = ['A1', 'A2', 'A3', 'A4'];

// League A's two lowest-ranked 4th-placed teams go straight down.
const A_AUTO_RELEGATED: Condition = { acrossGroups: { position: 4, groups: A_GROUPS, worst: 2 } };
// The runner-up (B, C) or 4th-placed team (B) that plays the playoff against
// the league above (runner-up) or below (4th) and wins or loses it.
const playoff = (position: number, result: 'won' | 'lost'): Condition => ({
  all: [{ position: [position, position] }, { playoff: result }],
});

const LEAGUES: League[] = [
  {
    code: 'ENA',
    groups: A_GROUPS,
    milestones: ['winGroup', 'quarterfinals', 'semifinals', 'final', 'champions', 'autoRelegated', 'relegated'],
    certainty: {
      ...new NationsLeagueAConfig().certainty,
      autoRelegated: A_AUTO_RELEGATED,
      // Auto-relegated, or in the A/B playoff (the two lowest-ranked
      // 3rd-placed and two highest-ranked 4th-placed teams) and lost it.
      relegated: {
        any: [
          A_AUTO_RELEGATED,
          {
            all: [
              {
                any: [
                  { acrossGroups: { position: 3, groups: A_GROUPS, worst: 2 } },
                  { acrossGroups: { position: 4, groups: A_GROUPS, best: 2 } },
                ],
              },
              { playoff: 'lost' },
            ],
          },
        ],
      },
    },
  },
  {
    code: 'ENB',
    groups: ['B1', 'B2', 'B3', 'B4'],
    milestones: ['autoPromoted', 'promoted', 'relegated'],
    certainty: {
      autoPromoted: { position: [1, 1] },
      promoted: { any: [{ position: [1, 1] }, playoff(2, 'won')] },
      relegated: playoff(4, 'lost'),
    },
  },
  {
    code: 'ENC',
    groups: ['C1', 'C2', 'C3', 'C4'],
    milestones: ['autoPromoted', 'promoted'],
    certainty: {
      autoPromoted: { position: [1, 1] },
      promoted: { any: [{ position: [1, 1] }, playoff(2, 'won')] },
    },
  },
];

// These associations cannot host home matches at the moment.
const NO_HOST_TEAMS = ['UA', 'IL', 'BY'];

const groupsOf = (code: string) => LEAGUES.find((l) => l.code === code)!.groups;

export class NationsLeagueConfig implements TournamentConfig {
  code = 'EN';
  name = '2026-27 UEFA Nations League (Leagues A-C)';
  sourceTournaments = LEAGUES.map((l) => l.code);
  leagues = LEAGUES;
  groups = LEAGUES.flatMap((l) => l.groups);
  // League A's title ladder; leagues B and C have no knockout stages.
  knockoutStages = ['quarterfinals', 'semifinals', 'final', 'champions'];
  milestones = Array.from(new Set(LEAGUES.flatMap((l) => l.milestones)));
  groupStageDefaultLocation = null;
  dynamicHostStages = ['semifinals'];

  // League A's group sorting and title-ladder bracket are unchanged from the
  // standalone League A config, which only reads its own groups.
  private leagueA = new NationsLeagueAConfig();

  getKnockoutMatchLocation(): string | null {
    return null;
  }

  // The Finals host is one of the semifinalists that is able to host.
  selectDynamicHost(_stageName: string, candidateTeamIds: string[]): string | null {
    const eligible = candidateTeamIds.filter((id) => !NO_HOST_TEAMS.includes(id));
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  hostsHomeMatch(homeTeamId: string, awayTeamId: string): boolean {
    if (NO_HOST_TEAMS.includes(homeTeamId)) return false;
    // Ireland v Israel is played at a neutral venue.
    return !(homeTeamId === 'IE' && awayTeamId === 'IL');
  }

  groupRules = this.leagueA.groupRules;
  twoLeggedStages = this.leagueA.twoLeggedStages;

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return this.leagueA.sortGroupStandings(teams, matches);
  }

  evaluateGroupPhaseMilestones(rankedStandings: GroupStandings): { [teamId: string]: string[] } {
    const milestones = this.leagueA.evaluateGroupPhaseMilestones(rankedStandings);
    const add = (teamId: string, ...names: string[]) => {
      milestones[teamId] = [...(milestones[teamId] ?? []), ...names];
    };

    ['ENB', 'ENC'].forEach((code) => {
      groupsOf(code).forEach((g) => {
        const winner = rankedStandings[g]?.[0];
        if (winner) add(winner.teamId, 'autoPromoted', 'promoted');
      });
    });

    // The two lowest-ranked A 4th-placed teams (ranks 15-16) go straight down.
    rankAcrossGroups(rankedStandings, groupsOf('ENA'), 4)
      .slice(2)
      .forEach((t) => add(t.teamId, 'autoRelegated', 'relegated'));

    return milestones;
  }

  buildKnockoutBracket(groupStandings: GroupStandings, knownKnockoutFixtures: Match[]): Matchup[] {
    return this.leagueA.buildKnockoutBracket(groupStandings, knownKnockoutFixtures);
  }

  buildPlayoffTies(rankedStandings: GroupStandings, knownFixtures: Match[]): Matchup[] {
    const aGroups = groupsOf('ENA');
    const bGroups = groupsOf('ENB');
    const cGroups = groupsOf('ENC');

    // A/B: A's ranks 11-12 (two lowest 3rd-placed) and 13-14 (two highest
    // 4th-placed) vs the B runners-up.
    const aThird = rankAcrossGroups(rankedStandings, aGroups, 3).slice(2);
    const aFourth = rankAcrossGroups(rankedStandings, aGroups, 4).slice(0, 2);
    const bRunnersUp = rankAcrossGroups(rankedStandings, bGroups, 2);
    // B/C: B's four 4th-placed teams vs the C runners-up.
    const bFourth = rankAcrossGroups(rankedStandings, bGroups, 4);
    const cRunnersUp = rankAcrossGroups(rankedStandings, cGroups, 2);

    return [
      ...this.drawTies('playoffAB', [...aThird, ...aFourth].map((t) => t.teamId), bRunnersUp.map((t) => t.teamId), knownFixtures),
      ...this.drawTies('playoffBC', bFourth.map((t) => t.teamId), cRunnersUp.map((t) => t.teamId), knownFixtures),
    ];
  }

  // Draws each higher-league team against a lower-league team. A real drawn
  // pairing (once synced as a knockout fixture) is preferred over an invented
  // one; the rest are paired at random, redrawn every Monte Carlo iteration.
  private drawTies(stageName: string, higher: string[], lower: string[], knownFixtures: Match[]): Matchup[] {
    const pairs: [string, string][] = [];
    const usedHigher = new Set<string>();
    const usedLower = new Set<string>();

    higher.forEach((h) => {
      const real = knownFixtures.find(
        (m) =>
          (m.homeTeamId === h && lower.includes(m.awayTeamId) && !usedLower.has(m.awayTeamId)) ||
          (m.awayTeamId === h && lower.includes(m.homeTeamId) && !usedLower.has(m.homeTeamId))
      );
      if (real) {
        const l = real.homeTeamId === h ? real.awayTeamId : real.homeTeamId;
        pairs.push([h, l]);
        usedHigher.add(h);
        usedLower.add(l);
      }
    });

    const remainingLower = lower.filter((l) => !usedLower.has(l)).sort(() => Math.random() - 0.5);
    higher
      .filter((h) => !usedHigher.has(h))
      .forEach((h, i) => {
        if (remainingLower[i]) pairs.push([h, remainingLower[i]]);
      });

    const matchups: Matchup[] = [];
    pairs.forEach(([h, l], i) => {
      const tieId = `${this.code}-${stageName}-${i}`;
      // Leg 1 is hosted by the lower-league team.
      matchups.push({ homeTeamId: l, awayTeamId: h, isKnockout: true, stageName, tieId, tieLeg: 1 });
      matchups.push({ homeTeamId: h, awayTeamId: l, isKnockout: true, stageName, tieId, tieLeg: 2 });
    });
    return matchups;
  }

  evaluatePlayoffMilestones(outcomes: PlayoffOutcome[]): { [teamId: string]: string[] } {
    const milestones: { [teamId: string]: string[] } = {};
    outcomes.forEach(({ winnerId, loserId, leg1HomeTeamId }) => {
      // The lower-league team hosted leg 1: it is promoted if it wins, and
      // the higher-league team is relegated if it loses.
      if (winnerId === leg1HomeTeamId) {
        milestones[winnerId] = [...(milestones[winnerId] ?? []), 'promoted'];
        milestones[loserId] = [...(milestones[loserId] ?? []), 'relegated'];
      }
    });
    return milestones;
  }
}
