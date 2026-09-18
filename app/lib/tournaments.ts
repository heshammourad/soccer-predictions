import { calculateMathematicalStatus, calculateGroupTop2Status, SimpleTeam, SimpleMatch } from './simulator/mathematicalStatus';

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
  // Deterministic (non-simulation) group-phase status calculator for this
  // tournament's group shape.
  calculateMathStatus: (teams: SimpleTeam[], results: SimpleMatch[], fixtures: SimpleMatch[]) => MathStatus;
}

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
    name: '2026-27 UEFA Nations League',
    milestones: ['winGroup', 'quarterfinals', 'semifinals', 'final', 'champions'],
    knockoutStages: ['quarterfinals', 'semifinals', 'final', 'champions'],
    milestoneLabels: {
      winGroup: 'Win Group',
      quarterfinals: 'Quarterfinals',
      semifinals: 'Semifinals',
      final: 'Finalist',
      champions: 'Champion',
    },
    groupPhaseMilestone: 'winGroup',
    // Official UEFA schedule: league phase 24 Sep - 17 Nov 2026 (6
    // matchdays), League A quarterfinals (two legs) 25-30 March 2027,
    // Finals (semifinals + third-place playoff/final) 9-13 June 2027.
    milestoneDates: {
      'Start (Pre-tournament)': '2026-09-23T23:59:59Z',
      'Matchday 1 Completed': '2026-09-26T23:59:59Z',
      'Matchday 2 Completed': '2026-09-29T23:59:59Z',
      'Matchday 3 Completed': '2026-10-03T23:59:59Z',
      'Matchday 4 Completed': '2026-10-06T23:59:59Z',
      'Matchday 5 Completed': '2026-11-14T23:59:59Z',
      'Matchday 6 Completed': '2026-11-17T23:59:59Z',
      'Quarterfinals Completed': '2027-03-30T23:59:59Z',
      'Semifinals Completed': '2027-06-10T23:59:59Z',
      'Current Projections': undefined,
    },
    calculateMathStatus: calculateGroupTop2Status,
  },
];

export function getTournament(code: string): TournamentDescriptor | undefined {
  const upper = code.toUpperCase();
  return TOURNAMENTS.find((t) => t.code === upper);
}
