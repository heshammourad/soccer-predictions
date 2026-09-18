import { calculateMathematicalStatus, calculateGroupTop2Status, SimpleTeam, SimpleMatch } from './simulator/mathematicalStatus';
import { AFCON_HOSTS } from './simulator/config/africaCupQualifiers';

export interface MathStatus {
  guaranteedProgress: Set<string>;
  mathematicallyEliminated: Set<string>;
  guaranteedWinGroup: Set<string>;
  eliminatedWinGroup: Set<string>;
}

export interface TournamentDescriptor {
  code: string;
  name: string;
  // Every outcome this tournament tracks, in display order. Must match the
  // server-side TournamentConfig.milestones for this code.
  milestones: string[];
  // The knockout ladder (a subset of milestones representing "reached this stage").
  knockoutStages: string[];
  // Human-readable header/label per milestone.
  milestoneLabels: { [milestone: string]: string };
  // Which milestone (if any) means "won the group" — drives the group
  // column/filter and the win-group math status. Omit for tournaments with
  // no group phase.
  groupPhaseMilestone?: string;
  // Mirrors the milestone list scripts/sync.ts uses for this tournament, so
  // the dashboard can compute the right historical cutoff date per run.
  milestoneDates: { [description: string]: string | undefined };
  // Milestones in the order the table sorts by default (all descending), and
  // the first of them is the headline outcome. Defaults to the reverse of
  // `milestones`, which suits a ladder ending in a champion; set it when the
  // milestone list also has outcomes (e.g. relegation) that shouldn't drive
  // the default ordering.
  defaultSortMilestones?: string[];
  // Keep the group-phase milestone column after the group stage ends. It's
  // otherwise hidden then, since for a knockout tournament "won the group"
  // stops being interesting; not so when it's a final outcome (promotion).
  keepGroupPhaseMilestoneAfterGroupStage?: boolean;
  // Milestones where a high probability is bad news (relegation): shaded red
  // instead of the usual green.
  negativeMilestones?: string[];
  // Grey out and strike through teams the math status says are eliminated
  // (default true). Turn off when elimination from the headline ladder isn't
  // the interesting outcome (e.g. a team out of the title race can still be
  // fighting relegation).
  dimEliminatedTeams?: boolean;
  // Deterministic (non-simulation) group-phase status calculator for this
  // tournament's group shape.
  calculateMathStatus: (teams: SimpleTeam[], results: SimpleMatch[], fixtures: SimpleMatch[]) => MathStatus;
}

// Leagues with no knockout ladder only have a "finish 1st" outcome that can be
// proved from the group table (direct promotion). Reaching a playoff or
// avoiding relegation also depends on cross-group rankings, so nothing else is
// reported as guaranteed or eliminated.
const calculateWinGroupOnlyStatus: TournamentDescriptor['calculateMathStatus'] = (teams, results, fixtures) => ({
  ...calculateGroupTop2Status(teams, results, fixtures),
  guaranteedProgress: new Set<string>(),
  mathematicallyEliminated: new Set<string>(),
});

// Leagues A-C are simulated together (the promotion/relegation playoffs link
// them), with one run per league; they share this milestone schedule.
const NATIONS_LEAGUE_MILESTONE_DATES: TournamentDescriptor['milestoneDates'] = {
  'Start (Pre-tournament)': '2026-09-23T23:59:59Z',
  'Matchday 1 Completed': '2026-09-26T23:59:59Z',
  'Matchday 2 Completed': '2026-09-29T23:59:59Z',
  'Matchday 3 Completed': '2026-10-03T23:59:59Z',
  'Matchday 4 Completed': '2026-10-06T23:59:59Z',
  'Matchday 5 Completed': '2026-11-14T23:59:59Z',
  'Matchday 6 Completed': '2026-11-17T23:59:59Z',
  'Playoffs & Quarterfinals Completed': '2027-03-30T23:59:59Z',
  'Semifinals Completed': '2027-06-10T23:59:59Z',
  'Current Projections': undefined,
};

// The AFCON qualifiers' only outcome is qualifying, which the dashboard reads
// from the group-phase milestone's status sets. The status enumeration is 6^k
// per group, so it is skipped until at most 6 matches of a group remain
// (i.e. from the third matchday onward).
const calculateAfconQualifierStatus: TournamentDescriptor['calculateMathStatus'] = (teams, results, fixtures) => {
  const status = calculateGroupTop2Status(teams, results, fixtures, {
    automaticQualifiers: AFCON_HOSTS,
    maxRemainingPerGroup: 6,
  });
  return {
    ...status,
    guaranteedWinGroup: status.guaranteedProgress,
    eliminatedWinGroup: status.mathematicallyEliminated,
  };
};

export const TOURNAMENTS: TournamentDescriptor[] = [
  {
    code: 'WC',
    name: '2026 World Cup',
    milestones: ['winGroup', 'roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'],
    knockoutStages: ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'],
    milestoneLabels: {
      winGroup: 'Win Group',
      roundOf32: 'Round of 32',
      roundOf16: 'Round of 16',
      quarterfinals: 'Quarterfinals',
      semifinals: 'Semifinals',
      final: 'Finalist',
      champions: 'Champion',
    },
    groupPhaseMilestone: 'winGroup',
    milestoneDates: {
      'Start (Pre-tournament)': '2026-06-10T23:59:59Z',
      'Matchday 1 Completed': '2026-06-17T23:59:59Z',
      'Matchday 2 Completed': '2026-06-23T23:59:59Z',
      'Matchday 3 Completed': '2026-06-27T23:59:59Z',
      'Round of 32 Completed': '2026-07-03T23:59:59Z',
      'Round of 16 Completed': '2026-07-08T23:59:59Z',
      'Quarterfinals Completed': '2026-07-13T23:59:59Z',
      'Semifinals Completed': '2026-07-17T23:59:59Z',
      'Current Projections': undefined,
    },
    calculateMathStatus: calculateMathematicalStatus,
  },
  {
    code: 'ENA',
    name: '2026-27 UEFA Nations League A',
    milestones: ['winGroup', 'quarterfinals', 'semifinals', 'final', 'champions', 'autoRelegated', 'relegated'],
    knockoutStages: ['quarterfinals', 'semifinals', 'final', 'champions'],
    milestoneLabels: {
      winGroup: 'Win Group',
      quarterfinals: 'Quarterfinals',
      semifinals: 'Semifinals',
      final: 'Finalist',
      champions: 'Champion',
      autoRelegated: 'Auto Relegation',
      relegated: 'Relegation',
    },
    groupPhaseMilestone: 'winGroup',
    defaultSortMilestones: ['champions', 'final', 'semifinals', 'quarterfinals', 'winGroup'],
    negativeMilestones: ['autoRelegated', 'relegated'],
    dimEliminatedTeams: false,
    // Official UEFA schedule: league phase 24 Sep - 17 Nov 2026 (6
    // matchdays), League A quarterfinals (two legs) 25-30 March 2027,
    // Finals (semifinals + third-place playoff/final) 9-13 June 2027.
    milestoneDates: NATIONS_LEAGUE_MILESTONE_DATES,
    calculateMathStatus: calculateGroupTop2Status,
  },
  {
    code: 'ENB',
    name: '2026-27 UEFA Nations League B',
    milestones: ['autoPromoted', 'promoted', 'relegated'],
    knockoutStages: [],
    milestoneLabels: {
      autoPromoted: 'Auto Promotion',
      promoted: 'Promotion',
      relegated: 'Relegation',
    },
    groupPhaseMilestone: 'autoPromoted',
    defaultSortMilestones: ['promoted', 'autoPromoted'],
    negativeMilestones: ['relegated'],
    keepGroupPhaseMilestoneAfterGroupStage: true,
    dimEliminatedTeams: false,
    milestoneDates: NATIONS_LEAGUE_MILESTONE_DATES,
    calculateMathStatus: calculateWinGroupOnlyStatus,
  },
  {
    code: 'ENC',
    name: '2026-27 UEFA Nations League C',
    milestones: ['autoPromoted', 'promoted'],
    knockoutStages: [],
    milestoneLabels: {
      autoPromoted: 'Auto Promotion',
      promoted: 'Promotion',
    },
    groupPhaseMilestone: 'autoPromoted',
    defaultSortMilestones: ['promoted', 'autoPromoted'],
    keepGroupPhaseMilestoneAfterGroupStage: true,
    dimEliminatedTeams: false,
    milestoneDates: NATIONS_LEAGUE_MILESTONE_DATES,
    calculateMathStatus: calculateWinGroupOnlyStatus,
  },
  {
    code: 'FQ',
    name: '2027 Africa Cup of Nations Qualifiers',
    milestones: ['qualified'],
    knockoutStages: [],
    milestoneLabels: {
      qualified: 'Qualify',
    },
    groupPhaseMilestone: 'qualified',
    keepGroupPhaseMilestoneAfterGroupStage: true,
    // Group stage 24 Sep 2026 - 30 Mar 2027 (6 matchdays; matchdays 3-6 are
    // dated by placeholder days inside the Nov and Mar windows until the real
    // days are published). Hosts KE/TZ/UG are already qualified. Keep in sync
    // with scripts/sync.ts.
    milestoneDates: {
      'Start (Pre-tournament)': '2026-09-23T23:59:59Z',
      'Matchday 1 Completed': '2026-09-27T23:59:59Z',
      'Matchday 2 Completed': '2026-10-07T23:59:59Z',
      'Matchday 3 Completed': '2026-11-13T23:59:59Z',
      'Matchday 4 Completed': '2026-11-17T23:59:59Z',
      'Matchday 5 Completed': '2027-03-27T23:59:59Z',
      'Tournament Completed': '2027-03-30T23:59:59Z',
      'Current Projections': undefined,
    },
    calculateMathStatus: calculateAfconQualifierStatus,
  },
];

export function getTournament(code: string): TournamentDescriptor | undefined {
  const upper = code.toUpperCase();
  return TOURNAMENTS.find((t) => t.code === upper);
}
