import { TeamStats } from '../types';

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

export function sortGroupTeamsWithH2H(
  teams: TeamStats[],
  getMatchResult: (teamA: string, teamB: string) => H2HMatch | null
): TeamStats[] {
  const overallStatsMap: { [teamId: string]: TeamStats } = {};
  teams.forEach((t) => {
    overallStatsMap[t.teamId] = t;
  });

  const getH2HStats = (subset: string[]) => {
    const stats: { [teamId: string]: { points: number; goalDifference: number; goalsFor: number } } = {};
    subset.forEach((team) => {
      stats[team] = { points: 0, goalDifference: 0, goalsFor: 0 };
    });

    for (let i = 0; i < subset.length; i++) {
      for (let j = i + 1; j < subset.length; j++) {
        const teamA = subset[i];
        const teamB = subset[j];
        const match = getMatchResult(teamA, teamB);
        if (match) {
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

    const sortedSubset = [...subset].sort((a, b) => {
      return compareStats(h2hStats[a], h2hStats[b]);
    });

    const groups: string[][] = [];
    let currentGroup = [sortedSubset[0]];

    for (let i = 1; i < sortedSubset.length; i++) {
      const prev = sortedSubset[i - 1];
      const curr = sortedSubset[i];
      const statsPrev = h2hStats[prev];
      const statsCurr = h2hStats[curr];

      if (
        statsPrev.points === statsCurr.points &&
        statsPrev.goalDifference === statsCurr.goalDifference &&
        statsPrev.goalsFor === statsCurr.goalsFor
      ) {
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
          return sortGroupTeamsStandard([overallStatsMap[a], overallStatsMap[b]])[0].teamId === a ? -1 : 1;
        });
        resolved.push(...resolvedSub);
      }
    });

    return resolved;
  };

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
