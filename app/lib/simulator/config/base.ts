import { GroupStandings, TeamStats } from '../types';
import { GroupRules, MatchStats, RankingMatch, rankGroup } from '../ranking';

export type { GroupRules, OverallTiebreaker } from '../ranking';

export function compareStats(a: { points: number; goalDifference: number; goalsFor: number }, b: { points: number; goalDifference: number; goalsFor: number }): number {
  if (a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  if (a.goalsFor !== b.goalsFor) {
    return b.goalsFor - a.goalsFor;
  }
  return 0;
}

// FIFA (World Cup): points, head-to-head, then overall GD and goals scored.
// Fair-play points and the FIFA ranking come next but aren't tracked, so a tie
// that far is drawn by lots.
export const FIFA_TIEBREAKERS: GroupRules = { order: 'headToHeadFirst' };

// CAF: H2H away goals; overall GD, goals scored, away goals; then lots.
export const CAF_TIEBREAKERS: GroupRules = { order: 'headToHeadFirst', headToHeadAwayGoals: true, overall: ['awayGoals'] };

// Concacaf Nations League (regulations art. 12.6): overall points, GD and
// goals scored first; then head-to-head points among the tied teams; then, if
// more than two are level, head-to-head GD and goals scored, or if exactly two
// are, away goals scored in their matches; then lots. Fair-play points aren't
// tracked, so that step is skipped. The head-to-head criteria are applied once
// to the tied set rather than again to a smaller set left over from it, which
// the rules don't say.
export const CONCACAF_NATIONS_LEAGUE_TIEBREAKERS: GroupRules = { order: 'overallFirst' };

// Sorts a group's standings under `rules`. Head-to-head criteria count every
// meeting of a pair in `matches` (both legs of a double round-robin). Teams
// the rules leave level (drawing of lots) are ordered at random.
export function sortGroup(teams: TeamStats[], matches: RankingMatch[], rules: GroupRules = FIFA_TIEBREAKERS): TeamStats[] {
  if (teams.length === 0) {
    throw new Error('sortGroup called with an empty group; this should never happen in a normal simulation.');
  }
  const byId: { [teamId: string]: TeamStats } = {};
  teams.forEach((t) => (byId[t.teamId] = t));
  const stats = new MatchStats(matches, byId);
  return rankGroup(rules, teams.map((t) => t.teamId), stats)
    .flatMap((block) => shuffle(block))
    .map((id) => byId[id]);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Teams finishing in the given group position (1-based) in each of the given
// groups, best to worst by the cross-group ranking criteria (points, goal
// difference, goals scored; remaining ties broken randomly, as by a draw).
export function rankAcrossGroups(standings: GroupStandings, groups: string[], position: number): TeamStats[] {
  const teams = groups
    .map((g) => standings[g]?.[position - 1])
    .filter((t): t is TeamStats => Boolean(t))
    .sort(() => Math.random() - 0.5);
  return teams.sort(compareStats);
}
