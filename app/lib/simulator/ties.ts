import { TieTeamStats } from './types';

export interface LegScore {
  homeGoals: number;
  awayGoals: number;
}

// The two-legged tie's teams, named by who hosts leg 1: team A hosts leg 1 and
// plays away in leg 2, team B the reverse.

// Decides a two-legged tie on goals. The aggregate decides it; if that is level
// and `awayGoalsRule` is set, more away goals wins (each away goal counting
// double, which comes to the same comparison once the aggregate is level).
// Returns null if it's still level, i.e. extra time / penalties.
export function decideByGoals(leg1: LegScore, leg2: LegScore, awayGoalsRule: boolean): 'A' | 'B' | null {
  const aggregateA = leg1.homeGoals + leg2.awayGoals;
  const aggregateB = leg1.awayGoals + leg2.homeGoals;
  if (aggregateA !== aggregateB) return aggregateA > aggregateB ? 'A' : 'B';
  if (awayGoalsRule) {
    const awayA = leg2.awayGoals;
    const awayB = leg1.awayGoals;
    if (awayA !== awayB) return awayA > awayB ? 'A' : 'B';
  }
  return null;
}

// Each team's record over the two legs (three points for a win, one for a draw
// per leg), used to rank the winners of a round against each other.
export function twoLeggedStats(
  teamAId: string,
  teamBId: string,
  leg1: LegScore,
  leg2: LegScore
): { [teamId: string]: TieTeamStats } {
  const record = (scored: number, conceded: number) => (scored > conceded ? 3 : scored === conceded ? 1 : 0);
  const a: TieTeamStats = {
    points: record(leg1.homeGoals, leg1.awayGoals) + record(leg2.awayGoals, leg2.homeGoals),
    goalDifference: leg1.homeGoals + leg2.awayGoals - (leg1.awayGoals + leg2.homeGoals),
    goalsFor: leg1.homeGoals + leg2.awayGoals,
    awayGoals: leg2.awayGoals,
  };
  const b: TieTeamStats = {
    points: record(leg1.awayGoals, leg1.homeGoals) + record(leg2.homeGoals, leg2.awayGoals),
    goalDifference: -a.goalDifference,
    goalsFor: leg1.awayGoals + leg2.homeGoals,
    awayGoals: leg1.awayGoals,
  };
  return { [teamAId]: a, [teamBId]: b };
}
