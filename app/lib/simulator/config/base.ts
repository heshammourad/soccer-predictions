import { Match, TeamStats } from '../types';

export interface H2HMatch {
  team1: string;
  team2: string;
  score1: number;
  score2: number;
}

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

export function sortGroupTeamsStandard(teams: TeamStats[]): TeamStats[] {
  return [...teams].sort((a, b) => {
    const diff = compareStats(a, b);
    if (diff !== 0) return diff;
    return Math.random() - 0.5;
  });
}

export interface H2HSortOptions {
  // Count away goals scored ("away" is the second-listed team of an
  // H2HMatch) as a fourth head-to-head criterion, after points, GD and goals
  // scored among the tied teams (CAF).
  h2hAwayGoals?: boolean;
  // Criteria for teams still tied after overall points, GD and goals scored,
  // applied in order. Each returns a value where higher ranks ahead; teams
  // still level after all of them are ordered at random (drawing of lots).
  overallTiebreakers?: ((teamId: string) => number)[];
}

export function sortGroupTeamsWithH2H(
  teams: TeamStats[],
  // May return several matches for a pair (a double round-robin group), all
  // of which count towards the head-to-head mini-table.
  getMatchResult: (teamA: string, teamB: string) => H2HMatch | H2HMatch[] | null,
  options: H2HSortOptions = {}
): TeamStats[] {
  const { h2hAwayGoals = false, overallTiebreakers } = options;
  const overallStatsMap: { [teamId: string]: TeamStats } = {};
  teams.forEach((t) => {
    overallStatsMap[t.teamId] = t;
  });

  const getH2HStats = (subset: string[]) => {
    const stats: { [teamId: string]: { points: number; goalDifference: number; goalsFor: number; awayGoals: number } } = {};
    subset.forEach((team) => {
      stats[team] = { points: 0, goalDifference: 0, goalsFor: 0, awayGoals: 0 };
    });

    for (let i = 0; i < subset.length; i++) {
      for (let j = i + 1; j < subset.length; j++) {
        const teamA = subset[i];
        const teamB = subset[j];
        const found = getMatchResult(teamA, teamB);
        const pairMatches = found === null ? [] : Array.isArray(found) ? found : [found];
        for (const match of pairMatches) {
          let scoreA = 0;
          let scoreB = 0;
          if (match.team1 === teamA) {
            scoreA = match.score1;
            scoreB = match.score2;
          } else {
            scoreA = match.score2;
            scoreB = match.score1;
          }

          if (scoreA > scoreB) {
            stats[teamA].points += 3;
          } else if (scoreB > scoreA) {
            stats[teamB].points += 3;
          } else {
            stats[teamA].points += 1;
            stats[teamB].points += 1;
          }

          stats[teamA].goalsFor += scoreA;
          stats[teamA].goalDifference += (scoreA - scoreB);

          stats[teamB].goalsFor += scoreB;
          stats[teamB].goalDifference += (scoreB - scoreA);

          // team2 is the away side
          if (match.team1 === teamA) {
            stats[teamB].awayGoals += scoreB;
          } else {
            stats[teamA].awayGoals += scoreA;
          }
        }
      }
    }
    return stats;
  };

  const resolveTie = (subset: string[]): string[] => {
    if (subset.length <= 1) {
      return subset;
    }

    const h2hStats = getH2HStats(subset);

    // Points, GD, goals scored among the tied teams, then (if enabled) away goals.
    const compareH2H = (a: string, b: string) => {
      const diff = compareStats(h2hStats[a], h2hStats[b]);
      if (diff !== 0 || !h2hAwayGoals) return diff;
      return h2hStats[b].awayGoals - h2hStats[a].awayGoals;
    };

    const sortedSubset = [...subset].sort(compareH2H);

    const groups: string[][] = [];
    let currentGroup = [sortedSubset[0]];

    for (let i = 1; i < sortedSubset.length; i++) {
      const prev = sortedSubset[i - 1];
      const curr = sortedSubset[i];
      if (compareH2H(prev, curr) === 0) {
        currentGroup.push(curr);
      } else {
        groups.push(currentGroup);
        currentGroup = [curr];
      }
    }
    groups.push(currentGroup);

    const resolved: string[] = [];
    groups.forEach((group) => {
      if (group.length === 1) {
        resolved.push(group[0]);
      } else if (group.length < subset.length) {
        const resolvedSub = resolveTie(group);
        resolved.push(...resolvedSub);
      } else {
        const resolvedSub = [...group].sort((a, b) => {
          if (overallTiebreakers) {
            const diff = compareStats(overallStatsMap[a], overallStatsMap[b]);
            if (diff !== 0) return diff;
            for (const criterion of overallTiebreakers) {
              const criterionDiff = criterion(b) - criterion(a);
              if (criterionDiff !== 0) return criterionDiff;
            }
            return Math.random() - 0.5;
          }
          return sortGroupTeamsStandard([overallStatsMap[a], overallStatsMap[b]])[0].teamId === a ? -1 : 1;
        });
        resolved.push(...resolvedSub);
      }
    });

    return resolved;
  };

  if (teams.length === 0) {
    throw new Error('sortGroupTeamsWithH2H called with an empty group; this should never happen in a normal simulation.');
  }

  // First sort overall by points descending.
  const sortedByPoints = [...teams].sort((a, b) => b.points - a.points);

  // Group teams by their points
  const pointGroups: TeamStats[][] = [];
  let currentGroup = [sortedByPoints[0]];

  for (let i = 1; i < sortedByPoints.length; i++) {
    const prev = sortedByPoints[i - 1];
    const curr = sortedByPoints[i];

    if (prev.points === curr.points) {
      currentGroup.push(curr);
    } else {
      pointGroups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  pointGroups.push(currentGroup);

  const finalSortedTeams: TeamStats[] = [];
  pointGroups.forEach((group) => {
    if (group.length === 1) {
      finalSortedTeams.push(group[0]);
    } else {
      const subsetCodes = group.map((t) => t.teamId);
      const resolvedCodes = resolveTie(subsetCodes);
      resolvedCodes.forEach((code) => {
        finalSortedTeams.push(overallStatsMap[code]);
      });
    }
  });

  return finalSortedTeams;
}

// Overall (all group matches) tiebreakers available for a double round-robin,
// applied after overall GD and goals scored. 'awayGoals', 'wins' and
// 'awayWins' are counted from the group's matches; a function supplies any
// other criterion (higher ranks ahead), e.g. a position in an access list.
export type OverallTiebreaker = 'awayGoals' | 'wins' | 'awayWins' | ((teamId: string) => number);

export interface DoubleRoundRobinOptions {
  h2hAwayGoals?: boolean;
  overall?: OverallTiebreaker[];
}

// CAF: H2H away goals; overall GD, goals scored, away goals; then lots.
export const CAF_TIEBREAKERS: DoubleRoundRobinOptions = { h2hAwayGoals: true, overall: ['awayGoals'] };

// Group sorting for a double round-robin: every pair meets home and away, and
// both matches count towards the head-to-head tiebreakers.
export function sortDoubleRoundRobinGroup(
  teams: TeamStats[],
  matches: Match[],
  { h2hAwayGoals = false, overall }: DoubleRoundRobinOptions = {}
): TeamStats[] {
  const getMatchResult = (teamA: string, teamB: string) =>
    matches
      .filter(
        (m) =>
          ((m.homeTeamId === teamA && m.awayTeamId === teamB) ||
            (m.homeTeamId === teamB && m.awayTeamId === teamA)) &&
          m.homeGoals !== null &&
          m.awayGoals !== null
      )
      .map((m) => ({
        team1: m.homeTeamId,
        team2: m.awayTeamId,
        score1: m.homeGoals as number,
        score2: m.awayGoals as number,
      }));

  // Only reached for teams tied on everything before, so count lazily.
  type Counts = { [teamId: string]: { awayGoals: number; wins: number; awayWins: number } };
  let counts: Counts | undefined;
  const countsFor = (teamId: string) => {
    if (!counts) {
      const tally: Counts = {};
      teams.forEach((t) => (tally[t.teamId] = { awayGoals: 0, wins: 0, awayWins: 0 }));
      matches.forEach((m) => {
        if (m.homeGoals === null || m.awayGoals === null) return;
        if (tally[m.awayTeamId]) tally[m.awayTeamId].awayGoals += m.awayGoals;
        if (m.homeGoals > m.awayGoals && tally[m.homeTeamId]) tally[m.homeTeamId].wins++;
        if (m.awayGoals > m.homeGoals && tally[m.awayTeamId]) {
          tally[m.awayTeamId].wins++;
          tally[m.awayTeamId].awayWins++;
        }
      });
      counts = tally;
    }
    return counts[teamId];
  };

  const overallTiebreakers = overall?.map((criterion) =>
    typeof criterion === 'function' ? criterion : (teamId: string) => countsFor(teamId)[criterion]
  );
  return sortGroupTeamsWithH2H(teams, getMatchResult, { h2hAwayGoals, overallTiebreakers });
}
