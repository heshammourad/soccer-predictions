export interface SimpleTeam {
  id: string;
  name: string;
  group: string | null;
}

export interface SimpleMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  isKnockout: boolean;
}

// Which criteria come first when ranking a group: head-to-head among the tied
// teams (FIFA, UEFA, CAF), or the overall record (Concacaf Nations League).
export type SortRules = 'h2hFirst' | 'overallFirst';

function compareStatsObj(
  a: { points: number; gd: number; gf: number },
  b: { points: number; gd: number; gf: number }
): number {
  if (a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.gd !== b.gd) {
    return b.gd - a.gd;
  }
  if (a.gf !== b.gf) {
    return b.gf - a.gf;
  }
  return 0;
}

// Ties that only CAF's away-goals criteria would break are left unresolved
// (reported as a range of positions), which is the conservative reading for
// "guaranteed"/"eliminated" — see config/base.ts for the simulation's sort.
function sortGroup(
  groupTeams: string[],
  groupMatches: SimpleMatch[],
  rules: SortRules = 'h2hFirst'
): string[][] {
  // Calculate overall stats for each team
  const stats: Record<string, { points: number; gd: number; gf: number; id: string }> = {};
  groupTeams.forEach(id => {
    stats[id] = { points: 0, gd: 0, gf: 0, id };
  });

  groupMatches.forEach(m => {
    if (m.homeGoals === null || m.awayGoals === null) return;
    const h = m.homeTeamId;
    const a = m.awayTeamId;
    stats[h].gf += m.homeGoals;
    stats[h].gd += (m.homeGoals - m.awayGoals);
    stats[a].gf += m.awayGoals;
    stats[a].gd += (m.awayGoals - m.homeGoals);
    if (m.homeGoals > m.awayGoals) {
      stats[h].points += 3;
    } else if (m.awayGoals > m.homeGoals) {
      stats[a].points += 3;
    } else {
      stats[h].points += 1;
      stats[a].points += 1;
    }
  });

  const resolveSubset = (subset: string[]): string[][] => {
    if (subset.length <= 1) return [subset];

    // Compute H2H stats among subset
    const h2hStats: Record<string, { points: number; gd: number; gf: number }> = {};
    subset.forEach(id => {
      h2hStats[id] = { points: 0, gd: 0, gf: 0 };
    });

    for (let i = 0; i < subset.length; i++) {
      for (let j = i + 1; j < subset.length; j++) {
        const u = subset[i];
        const v = subset[j];
        // Every meeting of the pair counts (two in a double round-robin).
        const meetings = groupMatches.filter(m =>
          (m.homeTeamId === u && m.awayTeamId === v) ||
          (m.homeTeamId === v && m.awayTeamId === u)
        );
        meetings.forEach(m => {
          if (m.homeGoals === null || m.awayGoals === null) return;
          const uIsHome = m.homeTeamId === u;
          const uGoals = uIsHome ? m.homeGoals : m.awayGoals;
          const vGoals = uIsHome ? m.awayGoals : m.homeGoals;
          h2hStats[u].gf += uGoals;
          h2hStats[u].gd += (uGoals - vGoals);
          h2hStats[v].gf += vGoals;
          h2hStats[v].gd += (vGoals - uGoals);
          if (uGoals > vGoals) {
            h2hStats[u].points += 3;
          } else if (vGoals > uGoals) {
            h2hStats[v].points += 3;
          } else {
            h2hStats[u].points += 1;
            h2hStats[v].points += 1;
          }
        });
      }
    }

    const compareSubsetH2H = (t1: string, t2: string) => {
      const s1 = h2hStats[t1];
      const s2 = h2hStats[t2];
      if (s1.points !== s2.points) return s2.points - s1.points;
      if (s1.gd !== s2.gd) return s2.gd - s1.gd;
      if (s1.gf !== s2.gf) return s2.gf - s1.gf;
      return 0;
    };

    const sortedSubset = [...subset].sort(compareSubsetH2H);

    // Group by H2H stats
    const groups: string[][] = [];
    let currentGroup = [sortedSubset[0]];
    for (let i = 1; i < sortedSubset.length; i++) {
      const prev = sortedSubset[i - 1];
      const curr = sortedSubset[i];
      if (compareSubsetH2H(prev, curr) === 0) {
        currentGroup.push(curr);
      } else {
        groups.push(currentGroup);
        currentGroup = [curr];
      }
    }
    groups.push(currentGroup);

    const result: string[][] = [];
    groups.forEach(g => {
      if (g.length === 1) {
        result.push(g);
      } else if (g.length < subset.length) {
        result.push(...resolveSubset(g));
      } else {
        // Tied H2H. Compare overall GD, overall GF
        const compareSubsetOverall = (t1: string, t2: string) => {
          const s1 = stats[t1];
          const s2 = stats[t2];
          if (s1.gd !== s2.gd) return s2.gd - s1.gd;
          if (s1.gf !== s2.gf) return s2.gf - s1.gf;
          return 0;
        };
        const sortedOverall = [...g].sort(compareSubsetOverall);

        const overallGroups: string[][] = [];
        let curOverall = [sortedOverall[0]];
        for (let i = 1; i < sortedOverall.length; i++) {
          const prev = sortedOverall[i - 1];
          const curr = sortedOverall[i];
          if (compareSubsetOverall(prev, curr) === 0) {
            curOverall.push(curr);
          } else {
            overallGroups.push(curOverall);
            curOverall = [curr];
          }
        }
        overallGroups.push(curOverall);

        overallGroups.forEach(og => {
          result.push(og);
        });
      }
    });

    return result;
  };

  if (rules === 'overallFirst') {
    // Overall points, GD and goals scored first; teams still level are split
    // by head-to-head points only, and whatever is left stays a tie (a range
    // of positions), so nothing is ever claimed that a later criterion could
    // overturn.
    const level = (a: string, b: string) =>
      stats[a].points === stats[b].points && stats[a].gd === stats[b].gd && stats[a].gf === stats[b].gf;
    const byOverall = [...groupTeams].sort((a, b) => compareStatsObj(stats[a], stats[b]));
    const overallGroups: string[][] = [];
    byOverall.forEach((id, i) => {
      if (i > 0 && level(byOverall[i - 1], id)) overallGroups[overallGroups.length - 1].push(id);
      else overallGroups.push([id]);
    });
    const result: string[][] = [];
    overallGroups.forEach((tied) => {
      if (tied.length === 1) {
        result.push(tied);
        return;
      }
      const h2hPoints: Record<string, number> = {};
      tied.forEach((id) => (h2hPoints[id] = 0));
      groupMatches.forEach((m) => {
        if (m.homeGoals === null || m.awayGoals === null) return;
        if (h2hPoints[m.homeTeamId] === undefined || h2hPoints[m.awayTeamId] === undefined) return;
        if (m.homeGoals > m.awayGoals) h2hPoints[m.homeTeamId] += 3;
        else if (m.awayGoals > m.homeGoals) h2hPoints[m.awayTeamId] += 3;
        else {
          h2hPoints[m.homeTeamId] += 1;
          h2hPoints[m.awayTeamId] += 1;
        }
      });
      const byH2H = [...tied].sort((a, b) => h2hPoints[b] - h2hPoints[a]);
      byH2H.forEach((id, i) => {
        if (i > 0 && h2hPoints[byH2H[i - 1]] === h2hPoints[id]) result[result.length - 1].push(id);
        else result.push([id]);
      });
    });
    return result;
  }

  // Group by overall points
  const sortedByPoints = [...groupTeams].sort((t1, t2) => stats[t2].points - stats[t1].points);
  const pointGroups: string[][] = [];
  let curGroup = [sortedByPoints[0]];
  for (let i = 1; i < sortedByPoints.length; i++) {
    const prev = sortedByPoints[i - 1];
    const curr = sortedByPoints[i];
    if (stats[prev].points === stats[curr].points) {
      curGroup.push(curr);
    } else {
      pointGroups.push(curGroup);
      curGroup = [curr];
    }
  }
  pointGroups.push(curGroup);

  const finalResult: string[][] = [];
  pointGroups.forEach(g => {
    finalResult.push(...resolveSubset(g));
  });

  return finalResult;
}

export function calculateMathematicalStatus(
  teams: SimpleTeam[],
  results: SimpleMatch[],
  fixtures: SimpleMatch[]
) {
  const teamGroupMap: Record<string, string> = {};
  const groupTeams: Record<string, string[]> = {};
  const allGroups = new Set<string>();

  teams.forEach(t => {
    if (t.group) {
      teamGroupMap[t.id] = t.group;
      allGroups.add(t.group);
      if (!groupTeams[t.group]) groupTeams[t.group] = [];
      groupTeams[t.group].push(t.id);
    }
  });

  const remainingGroupMatches = fixtures.filter(f => !f.isKnockout);

  const guaranteedProgress = new Set<string>();
  const mathematicallyEliminated = new Set<string>();
  const guaranteedWinGroup = new Set<string>();
  const eliminatedWinGroup = new Set<string>();

  if (remainingGroupMatches.length === 0) {
    return {
      guaranteedProgress,
      mathematicallyEliminated,
      guaranteedWinGroup,
      eliminatedWinGroup
    };
  }

  const playedGroupMatches = results.filter(r => !r.isKnockout);
  if (playedGroupMatches.length === 0) {
    return {
      guaranteedProgress,
      mathematicallyEliminated,
      guaranteedWinGroup,
      eliminatedWinGroup
    };
  }

  const OUTCOMES = [
    [8, 0],
    [1, 0],
    [4, 4],
    [0, 0],
    [0, 1],
    [0, 8]
  ];

  const bestThirdStatsOfGroup: Record<string, { points: number; gd: number; gf: number } | null> = {};
  const worstThirdStatsOfGroup: Record<string, { points: number; gd: number; gf: number } | null> = {};

  const canFinishTop2: Record<string, boolean> = {};
  const mustFinishTop2: Record<string, boolean> = {};
  const canFinishTop3: Record<string, boolean> = {};
  const mustFinishTop3: Record<string, boolean> = {};
  const bestThirdStats: Record<string, { points: number; gd: number; gf: number } | null> = {};
  const worstThirdStats: Record<string, { points: number; gd: number; gf: number } | null> = {};

  const canFinishTop1: Record<string, boolean> = {};
  const mustFinishTop1: Record<string, boolean> = {};

  teams.forEach(t => {
    canFinishTop2[t.id] = false;
    mustFinishTop2[t.id] = true;
    canFinishTop3[t.id] = false;
    mustFinishTop3[t.id] = true;
    bestThirdStats[t.id] = null;
    worstThirdStats[t.id] = null;
    canFinishTop1[t.id] = false;
    mustFinishTop1[t.id] = true;
  });

  allGroups.forEach(g => {
    bestThirdStatsOfGroup[g] = null;
    worstThirdStatsOfGroup[g] = null;
  });

  allGroups.forEach(g => {
    const groupTeamsList = groupTeams[g] || [];
    const groupPlayedMatches = results.filter(m => !m.isKnockout && (teamGroupMap[m.homeTeamId] === g || teamGroupMap[m.awayTeamId] === g));
    const groupUnplayedMatches = remainingGroupMatches.filter(m => teamGroupMap[m.homeTeamId] === g || teamGroupMap[m.awayTeamId] === g);

    if (groupUnplayedMatches.length === 6) {
      bestThirdStatsOfGroup[g] = { points: 6, gd: 8, gf: 16 };
      worstThirdStatsOfGroup[g] = { points: 1, gd: -16, gf: 0 };
      groupTeamsList.forEach(id => {
        canFinishTop1[id] = true;
        mustFinishTop1[id] = false;
        canFinishTop2[id] = true;
        mustFinishTop2[id] = false;
        canFinishTop3[id] = true;
        mustFinishTop3[id] = false;
        bestThirdStats[id] = { points: 6, gd: 8, gf: 16 };
        worstThirdStats[id] = { points: 1, gd: -16, gf: 0 };
      });
      return;
    }

    const generate = (index: number, currentMatches: SimpleMatch[]) => {
      if (index === groupUnplayedMatches.length) {
        const allMatches = [...groupPlayedMatches, ...currentMatches];
        const sorted = sortGroup(groupTeamsList, allMatches);
        
        let currentIndex = 1;
        const rankRanges: Record<string, { best: number; worst: number }> = {};
        sorted.forEach(sub => {
          const size = sub.length;
          const best = currentIndex;
          const worst = currentIndex + size - 1;
          sub.forEach(id => {
            rankRanges[id] = { best, worst };
          });
          currentIndex += size;
        });

        const stats: Record<string, { points: number; gd: number; gf: number }> = {};
        groupTeamsList.forEach(id => {
          stats[id] = { points: 0, gd: 0, gf: 0 };
        });
        allMatches.forEach(m => {
          if (m.homeGoals === null || m.awayGoals === null) return;
          const h = m.homeTeamId;
          const a = m.awayTeamId;
          stats[h].gf += m.homeGoals;
          stats[h].gd += (m.homeGoals - m.awayGoals);
          stats[a].gf += m.awayGoals;
          stats[a].gd += (m.awayGoals - m.homeGoals);
          if (m.homeGoals > m.awayGoals) {
            stats[h].points += 3;
          } else if (m.awayGoals > m.homeGoals) {
            stats[a].points += 3;
          } else {
            stats[h].points += 1;
            stats[a].points += 1;
          }
        });

        groupTeamsList.forEach(id => {
          const { best, worst } = rankRanges[id];
          if (best === 1) canFinishTop1[id] = true;
          if (worst > 1) mustFinishTop1[id] = false;

          if (best <= 2) canFinishTop2[id] = true;
          if (worst > 2) mustFinishTop2[id] = false;

          if (best <= 3) canFinishTop3[id] = true;
          if (worst > 3) mustFinishTop3[id] = false;

          if (best <= 3 && worst >= 3) {
            const tStats = stats[id];
            if (!bestThirdStats[id] || compareStatsObj(tStats, bestThirdStats[id]!) < 0) {
              bestThirdStats[id] = tStats;
            }
            if (!worstThirdStats[id] || compareStatsObj(tStats, worstThirdStats[id]!) > 0) {
              worstThirdStats[id] = tStats;
            }

            if (!bestThirdStatsOfGroup[g] || compareStatsObj(tStats, bestThirdStatsOfGroup[g]!) < 0) {
              bestThirdStatsOfGroup[g] = tStats;
            }
            if (!worstThirdStatsOfGroup[g] || compareStatsObj(tStats, worstThirdStatsOfGroup[g]!) > 0) {
              worstThirdStatsOfGroup[g] = tStats;
            }
          }
        });

        return;
      }

      const match = groupUnplayedMatches[index];
      OUTCOMES.forEach(([hG, aG]) => {
        currentMatches.push({ ...match, homeGoals: hG, awayGoals: aG });
        generate(index + 1, currentMatches);
        currentMatches.pop();
      });
    };

    generate(0, []);
  });

  teams.forEach(t => {
    const g = teamGroupMap[t.id];
    if (!g) return;

    if (mustFinishTop1[t.id]) {
      guaranteedWinGroup.add(t.id);
    }
    if (!canFinishTop1[t.id]) {
      eliminatedWinGroup.add(t.id);
    }

    if (mustFinishTop2[t.id]) {
      guaranteedProgress.add(t.id);
    } else if (!mustFinishTop3[t.id]) {
      if (!canFinishTop3[t.id]) {
        mathematicallyEliminated.add(t.id);
      }
    } else {
      const worstT = worstThirdStats[t.id];
      if (worstT) {
        let betterOrEqualGroupCount = 0;
        allGroups.forEach(otherG => {
          if (otherG === g) return;
          const bestOther = bestThirdStatsOfGroup[otherG];
          if (bestOther && compareStatsObj(bestOther, worstT) <= 0) {
            betterOrEqualGroupCount++;
          }
        });
        if (betterOrEqualGroupCount <= 7) {
          guaranteedProgress.add(t.id);
        }
      }
    }

    if (!canFinishTop2[t.id]) {
      if (!canFinishTop3[t.id]) {
        mathematicallyEliminated.add(t.id);
      } else {
        const bestT = bestThirdStats[t.id];
        if (bestT) {
          let betterGroupCount = 0;
          allGroups.forEach(otherG => {
            if (otherG === g) return;
            const worstOther = worstThirdStatsOfGroup[otherG];
            if (worstOther && compareStatsObj(worstOther, bestT) < 0) {
              betterGroupCount++;
            }
          });
          if (betterGroupCount >= 8) {
            mathematicallyEliminated.add(t.id);
          }
        } else {
          mathematicallyEliminated.add(t.id);
        }
      }
    }
  });

  return {
    guaranteedProgress,
    mathematicallyEliminated,
    guaranteedWinGroup,
    eliminatedWinGroup
  };
}

export interface GroupTop2Options {
  // Teams already through regardless of results (e.g. tournament hosts in a
  // qualifying group). Each takes one of a group's two places: it is always
  // guaranteed, and the remaining places go to the best-placed other teams,
  // so the "top 1/2" results below then refer to a team's rank among the
  // non-automatic teams and to the reduced number of places.
  automaticQualifiers?: string[];
  // Skip (report nothing as decided for) any group with more unplayed
  // matches than this. The enumeration below is 6^k per group, which is too
  // slow to run in the browser for a double round-robin early on.
  maxRemainingPerGroup?: number;
  // Tiebreak order used to rank a group (default head-to-head first).
  sortRules?: SortRules;
}

// Simpler group-phase status for tournaments where only the top 2 of each
// group advance and there's no cross-group "best third place" comparison
// (e.g. the 2026-27 Nations League A's 4-team groups) — unlike
// calculateMathematicalStatus above, this never needs to compare one
// group's standings against another's.
export function calculateGroupTop2Status(
  teams: SimpleTeam[],
  results: SimpleMatch[],
  fixtures: SimpleMatch[],
  options: GroupTop2Options = {}
) {
  const automatic = new Set(options.automaticQualifiers ?? []);
  const teamGroupMap: Record<string, string> = {};
  const groupTeams: Record<string, string[]> = {};
  const allGroups = new Set<string>();

  teams.forEach(t => {
    if (t.group) {
      teamGroupMap[t.id] = t.group;
      allGroups.add(t.group);
      if (!groupTeams[t.group]) groupTeams[t.group] = [];
      groupTeams[t.group].push(t.id);
    }
  });

  const remainingGroupMatches = fixtures.filter(f => !f.isKnockout);
  // Automatic qualifiers are through whatever has (or hasn't) been played, so
  // they're seeded here and survive the early returns below.
  const guaranteedProgress = new Set<string>(teams.filter(t => t.group && automatic.has(t.id)).map(t => t.id));
  const mathematicallyEliminated = new Set<string>();
  const guaranteedWinGroup = new Set<string>();
  const eliminatedWinGroup = new Set<string>();

  if (remainingGroupMatches.length === 0) {
    return { guaranteedProgress, mathematicallyEliminated, guaranteedWinGroup, eliminatedWinGroup };
  }

  const playedGroupMatches = results.filter(r => !r.isKnockout);
  if (playedGroupMatches.length === 0) {
    return { guaranteedProgress, mathematicallyEliminated, guaranteedWinGroup, eliminatedWinGroup };
  }

  const OUTCOMES = [
    [8, 0],
    [1, 0],
    [4, 4],
    [0, 0],
    [0, 1],
    [0, 8]
  ];

  const canFinishTop1: Record<string, boolean> = {};
  const mustFinishTop1: Record<string, boolean> = {};
  const canFinishTop2: Record<string, boolean> = {};
  const mustFinishTop2: Record<string, boolean> = {};

  teams.forEach(t => {
    canFinishTop1[t.id] = false;
    mustFinishTop1[t.id] = true;
    canFinishTop2[t.id] = false;
    mustFinishTop2[t.id] = true;
  });

  allGroups.forEach(g => {
    const groupTeamsList = groupTeams[g] || [];
    const groupPlayedMatches = results.filter(m => !m.isKnockout && (teamGroupMap[m.homeTeamId] === g || teamGroupMap[m.awayTeamId] === g));
    const groupUnplayedMatches = remainingGroupMatches.filter(m => teamGroupMap[m.homeTeamId] === g || teamGroupMap[m.awayTeamId] === g);

    if (groupUnplayedMatches.length === 0) return;

    // Places open to the group's non-automatic teams.
    const slots = 2 - groupTeamsList.filter(id => automatic.has(id)).length;

    const tooManyRemaining =
      options.maxRemainingPerGroup !== undefined && groupUnplayedMatches.length > options.maxRemainingPerGroup;
    if (groupPlayedMatches.length === 0 || tooManyRemaining) {
      // Nothing decided yet: anyone could finish 1st or 2nd, no one is guaranteed.
      groupTeamsList.forEach(id => {
        canFinishTop1[id] = true;
        canFinishTop2[id] = true;
        mustFinishTop1[id] = false;
        mustFinishTop2[id] = false;
      });
      return;
    }

    const generate = (index: number, currentMatches: SimpleMatch[]) => {
      if (index === groupUnplayedMatches.length) {
        const allMatches = [...groupPlayedMatches, ...currentMatches];
        const sorted = sortGroup(groupTeamsList, allMatches, options.sortRules)
          .map(sub => sub.filter(id => !automatic.has(id)))
          .filter(sub => sub.length > 0);

        let currentIndex = 1;
        const rankRanges: Record<string, { best: number; worst: number }> = {};
        sorted.forEach(sub => {
          const size = sub.length;
          const best = currentIndex;
          const worst = currentIndex + size - 1;
          sub.forEach(id => {
            rankRanges[id] = { best, worst };
          });
          currentIndex += size;
        });

        groupTeamsList.forEach(id => {
          if (automatic.has(id)) return;
          const { best, worst } = rankRanges[id];
          if (best === 1) canFinishTop1[id] = true;
          if (worst > 1) mustFinishTop1[id] = false;
          if (best <= slots) canFinishTop2[id] = true;
          if (worst > slots) mustFinishTop2[id] = false;
        });

        return;
      }

      const match = groupUnplayedMatches[index];
      OUTCOMES.forEach(([hG, aG]) => {
        currentMatches.push({ ...match, homeGoals: hG, awayGoals: aG });
        generate(index + 1, currentMatches);
        currentMatches.pop();
      });
    };

    generate(0, []);
  });

  teams.forEach(t => {
    const g = teamGroupMap[t.id];
    if (!g) return;

    if (automatic.has(t.id)) {
      guaranteedProgress.add(t.id);
      return;
    }

    if (mustFinishTop1[t.id]) guaranteedWinGroup.add(t.id);
    if (!canFinishTop1[t.id]) eliminatedWinGroup.add(t.id);
    if (mustFinishTop2[t.id]) guaranteedProgress.add(t.id);
    if (!canFinishTop2[t.id]) mathematicallyEliminated.add(t.id);
  });

  return {
    guaranteedProgress,
    mathematicallyEliminated,
    guaranteedWinGroup,
    eliminatedWinGroup
  };
}
