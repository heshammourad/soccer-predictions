import { CLA_MILESTONES, CLB_MILESTONES, CLC_MILESTONES, scheduleDates } from './simulator/config/concacafNationsLeague';

export interface TournamentDescriptor {
  code: string;
  name: string;
  // Logo under public/, shown in the sidebar. Qualifiers use the logo of the
  // tournament they qualify for.
  logo: string;
  // Every outcome this tournament tracks, in display order. Must match the
  // server-side TournamentConfig.milestones for this code.
  milestones: string[];
  // The knockout ladder (a subset of milestones representing "reached this stage").
  knockoutStages: string[];
  // Human-readable header/label per milestone.
  milestoneLabels: { [milestone: string]: string };
  // Plain-language format rules shown above the projections, so readers can
  // tell what each column means (e.g. auto promotion vs promotion).
  rules: string[];
  // Which milestone (if any) means "won the group" — drives the group
  // column. Omit for tournaments with no group phase.
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
  // Grey out and strike through teams whose headline outcome (the first of
  // the default sort milestones) is proven impossible (default true). Turn
  // off when elimination from the headline ladder isn't the interesting
  // outcome (e.g. a team out of the title race can still be fighting
  // relegation).
  dimEliminatedTeams?: boolean;
}

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
  'Tournament Completed': '2027-06-13T23:59:59Z',
  'Current Projections': undefined,
};

export const TOURNAMENTS: TournamentDescriptor[] = [
  {
    code: 'WC',
    name: '2026 World Cup',
    logo: '/tournaments/wc.png',
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
    rules: [
      'The top two teams in each of the 12 groups advance to the Round of 32.',
      'The eight best third-placed teams across all groups also advance.',
      'From the Round of 32 on, every round is a single knockout match.',
    ],
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
      'Tournament Completed': '2026-07-19T23:59:59Z',
      'Current Projections': undefined,
    },
  },
  {
    code: 'ENA',
    name: '2026-27 UEFA Nations League A',
    logo: '/tournaments/uefa-nations-league.png',
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
    rules: [
      'The top two teams in each group reach the quarterfinals, two-legged ties in which each group winner faces a runner-up from another group.',
      'The four quarterfinal winners play the Finals (semifinals and final) in June 2027.',
      'The two lowest-ranked 4th-placed teams are relegated to League B automatically (Auto Relegation).',
      'The two other 4th-placed teams and the two lowest-ranked 3rd-placed teams play two-legged playoffs against League B runners-up; the losers are relegated.',
      'Relegation covers both routes: automatic, or by losing a playoff.',
    ],
    groupPhaseMilestone: 'winGroup',
    defaultSortMilestones: ['champions', 'final', 'semifinals', 'quarterfinals', 'winGroup'],
    negativeMilestones: ['autoRelegated', 'relegated'],
    dimEliminatedTeams: false,
    // Official UEFA schedule: league phase 24 Sep - 17 Nov 2026 (6
    // matchdays), League A quarterfinals (two legs) 25-30 March 2027,
    // Finals (semifinals + third-place playoff/final) 9-13 June 2027.
    milestoneDates: NATIONS_LEAGUE_MILESTONE_DATES,
  },
  {
    code: 'ENB',
    name: '2026-27 UEFA Nations League B',
    logo: '/tournaments/uefa-nations-league.png',
    milestones: ['autoPromoted', 'promoted', 'relegated'],
    knockoutStages: [],
    milestoneLabels: {
      autoPromoted: 'Auto Promotion',
      promoted: 'Promotion',
      relegated: 'Relegation',
    },
    rules: [
      'Group winners are promoted to League A automatically (Auto Promotion).',
      'Runners-up play two-legged playoffs against the League A playoff teams (two 3rd- and two 4th-placed); the winners are promoted.',
      '4th-placed teams play two-legged playoffs against League C runners-up; the losers are relegated to League C.',
      'Promotion covers both routes: automatic, or by winning a playoff.',
    ],
    groupPhaseMilestone: 'autoPromoted',
    defaultSortMilestones: ['promoted', 'autoPromoted'],
    negativeMilestones: ['relegated'],
    keepGroupPhaseMilestoneAfterGroupStage: true,
    dimEliminatedTeams: false,
    milestoneDates: NATIONS_LEAGUE_MILESTONE_DATES,
  },
  {
    code: 'ENC',
    name: '2026-27 UEFA Nations League C',
    logo: '/tournaments/uefa-nations-league.png',
    milestones: ['autoPromoted', 'promoted'],
    knockoutStages: [],
    milestoneLabels: {
      autoPromoted: 'Auto Promotion',
      promoted: 'Promotion',
    },
    rules: [
      'Group winners are promoted to League B automatically (Auto Promotion).',
      'Runners-up play two-legged playoffs against the League B 4th-placed teams; the winners are promoted.',
      'Promotion covers both routes: automatic, or by winning a playoff.',
      'No team is relegated from League C, since the next edition has only three leagues.',
    ],
    groupPhaseMilestone: 'autoPromoted',
    defaultSortMilestones: ['promoted', 'autoPromoted'],
    keepGroupPhaseMilestoneAfterGroupStage: true,
    dimEliminatedTeams: false,
    milestoneDates: NATIONS_LEAGUE_MILESTONE_DATES,
  },
  {
    code: 'FQ',
    name: '2027 Africa Cup of Nations Qualifiers',
    logo: '/tournaments/afcon.png',
    milestones: ['qualified'],
    knockoutStages: [],
    milestoneLabels: {
      qualified: 'Qualify',
    },
    rules: [
      'Kenya, Tanzania and Uganda qualify automatically as co-hosts, but still play in the qualifying groups.',
      'The top two teams in each group qualify.',
      'In a group with a host, the host takes one of those two places, so only the best-placed other team qualifies.',
    ],
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
  },
  {
    code: 'CLA',
    name: '2026-27 CONCACAF Nations League A',
    logo: '/tournaments/concacaf-nations-league.png',
    milestones: ['winGroup', 'quarterfinals', 'semifinals', 'final', 'champions', 'relegated'],
    knockoutStages: ['quarterfinals', 'semifinals', 'final', 'champions'],
    milestoneLabels: {
      winGroup: 'Win Group',
      quarterfinals: 'Quarterfinals',
      semifinals: 'Semifinals',
      final: 'Finalist',
      champions: 'Champion',
      relegated: 'Relegation',
    },
    rules: [
      'Mexico, the United States, Canada and Panama are seeded straight into the quarterfinals.',
      'The other 12 teams play four matches each in two groups of six; the top two in each group join the seeds in two-legged quarterfinals.',
      'The quarterfinal winners qualify for the 2027 Gold Cup and play the Finals (semifinals and final) in Los Angeles in March 2027.',
      'The 5th- and 6th-placed teams in each group are relegated to League B.',
    ],
    groupPhaseMilestone: 'winGroup',
    defaultSortMilestones: ['champions', 'final', 'semifinals', 'quarterfinals', 'winGroup'],
    negativeMilestones: ['relegated'],
    dimEliminatedTeams: false,
    // Two groups of six (4 matches each, 24 Sep - 5 Oct); the top two join the
    // four seeds in the quarter-finals (9-17 Nov); Finals 25-28 Mar 2027.
    // Reaching the semi-finals means winning a quarter-final, which qualifies
    // for the 2027 Gold Cup.
    milestoneDates: scheduleDates(CLA_MILESTONES),
  },
  {
    code: 'CLB',
    name: '2026-27 CONCACAF Nations League B',
    logo: '/tournaments/concacaf-nations-league.png',
    milestones: ['promoted', 'relegated'],
    knockoutStages: [],
    milestoneLabels: {
      promoted: 'Promotion',
      relegated: 'Relegation',
    },
    rules: [
      'Each group winner is promoted to League A and qualifies for the 2027 Gold Cup.',
      'Each 4th-placed team is relegated to League C.',
    ],
    groupPhaseMilestone: 'promoted',
    defaultSortMilestones: ['promoted'],
    negativeMilestones: ['relegated'],
    keepGroupPhaseMilestoneAfterGroupStage: true,
    dimEliminatedTeams: false,
    milestoneDates: scheduleDates(CLB_MILESTONES),
  },
  {
    code: 'CLC',
    name: '2026-27 CONCACAF Nations League C',
    logo: '/tournaments/concacaf-nations-league.png',
    milestones: ['winGroup', 'promoted'],
    knockoutStages: [],
    milestoneLabels: {
      winGroup: 'Win Group',
      promoted: 'Promotion',
    },
    rules: [
      'The three group winners are promoted to League B.',
      'The best runner-up across the three groups is promoted too.',
    ],
    groupPhaseMilestone: 'winGroup',
    defaultSortMilestones: ['promoted', 'winGroup'],
    keepGroupPhaseMilestoneAfterGroupStage: true,
    dimEliminatedTeams: false,
    milestoneDates: scheduleDates(CLC_MILESTONES),
  },
];

export function getTournament(code: string): TournamentDescriptor | undefined {
  const upper = code.toUpperCase();
  return TOURNAMENTS.find((t) => t.code === upper);
}

// Once every dated milestone has passed the tournament is over, and its last
// dated milestone is the final result. Returns that milestone's name (the
// undated "Current Projections" doesn't count), or null while any milestone is
// still ahead. Mirrors the sync's own "all historical dates passed" check.
export function finalMilestoneIfOver(tournament: TournamentDescriptor, now: Date = new Date()): string | null {
  const dated = Object.entries(tournament.milestoneDates)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, date]) => ({ name, time: new Date(date).getTime() }));
  if (dated.length === 0 || dated.some((m) => m.time > now.getTime())) return null;
  return dated.reduce((last, m) => (m.time > last.time ? m : last)).name;
}
