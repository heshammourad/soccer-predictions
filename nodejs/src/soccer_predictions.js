const partition = require("lodash.partition");
const sampleSize = require("lodash.samplesize");
const { simulations, tournament, calculateScoreBreakdowns = true } = require("./configuration");
const { getKnockoutsStageDate } = require("./data");
const { init } = require("./init");
const { getLowerScore, getWeight, simulateResult } = require("./simulation");
const { askQuestion, updateStandings } = require("./utils");

const locations = {
  AC: "QA",
  AR: "CI",
  ARC: "QA",
  CA: "BR",
  CCH: "US",
  CLA: "XX",
  EC: "EN",
  WC: "US",
};

let fixtures;
let nationsLeagueStandings;
let results;
let standings;
let teamRatings;

let simRatings;
let groupFixtures;
let fixtureScoreCounts;
const simResults = [];

const resetRatings = () => {
  simRatings = Object.entries(teamRatings).reduce((acc, [team, info]) => {
    acc[team] = {
      ...info,
    };
    return acc;
  }, {});
};

const updateRating = (team, ratingChange) => {
  simRatings[team].rating = simRatings[team].rating + ratingChange;
};

const getNationsLeagueRank = () =>
  Object.values(nationsLeagueStandings).reduceRight(
    (acc, { groupWinners, rest }) => {
      acc.push(...groupWinners, ...rest);
      return acc;
    },
    [],
  );

const getTeamRank = (team) =>
  getNationsLeagueRank().findIndex((t) => t === team);

let simStandings;

const resetStandings = () => {
  simStandings = Object.entries(standings).reduce((acc, [team, teamInfo]) => {
    acc[team] = {
      ...teamInfo,
    };
    return acc;
  }, {});
};

const compareStats = (a, b) => {
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
};

const sortFunction = (a, b) => {
  const diff = compareStats(a, b);
  if (diff !== 0) {
    return diff;
  }
  return Math.random() - 0.5;
};

const convertStandingsToArray = (standingsToConvert) => {
  const standingsArray = Object.entries(standingsToConvert).reduce(
    (acc, [team, { group, ...values }]) => {
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push({
        team,
        ...values,
      });
      return acc;
    },
    {},
  );
  return standingsArray;
};

const getGroupMatchResult = (teamA, teamB) => {
  // First, check simulated results
  let match = simResults.find(
    (m) =>
      (m.team1 === teamA && m.team2 === teamB) ||
      (m.team1 === teamB && m.team2 === teamA),
  );
  if (match) {
    return match;
  }
  // Second, check real results (played group stage matches)
  match = results.find(
    (m) =>
      m.date.isBefore(getKnockoutsStageDate(tournament)) &&
      ((m.team1 === teamA && m.team2 === teamB) ||
        (m.team1 === teamB && m.team2 === teamA)),
  );
  return match;
};

const sortGroupTeamsWithH2H = (teams) => {
  const overallStatsMap = {};
  teams.forEach((tObj) => {
    overallStatsMap[tObj.team] = tObj;
  });

  const getH2HStats = (subset) => {
    const stats = {};
    subset.forEach((team) => {
      stats[team] = { points: 0, goalDifference: 0, goalsFor: 0 };
    });

    for (let i = 0; i < subset.length; i++) {
      for (let j = i + 1; j < subset.length; j++) {
        const teamA = subset[i];
        const teamB = subset[j];
        const match = getGroupMatchResult(teamA, teamB);
        if (match) {
          let scoreA, scoreB;
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

  const resolveTie = (subset) => {
    if (subset.length <= 1) {
      return subset;
    }

    const h2hStats = getH2HStats(subset);

    const sortedSubset = [...subset].sort((a, b) => {
      return compareStats(h2hStats[a], h2hStats[b]);
    });

    const groups = [];
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

    const resolved = [];
    groups.forEach((group) => {
      if (group.length === 1) {
        resolved.push(group[0]);
      } else if (group.length < subset.length) {
        const resolvedSub = resolveTie(group);
        resolved.push(...resolvedSub);
      } else {
        const resolvedSub = [...group].sort((a, b) => {
          return sortFunction(overallStatsMap[a], overallStatsMap[b]);
        });
        resolved.push(...resolvedSub);
      }
    });

    return resolved;
  };

  // First sort overall by points descending.
  const sortedByPoints = [...teams].sort((a, b) => b.points - a.points);

  // Group teams by their points
  const pointGroups = [];
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

  const finalSortedTeams = [];
  pointGroups.forEach((group) => {
    if (group.length === 1) {
      finalSortedTeams.push(group[0]);
    } else {
      const subsetCodes = group.map((tObj) => tObj.team);
      const resolvedCodes = resolveTie(subsetCodes);
      resolvedCodes.forEach((code) => {
        finalSortedTeams.push(overallStatsMap[code]);
      });
    }
  });

  // Modify the original teams array in-place
  for (let i = 0; i < teams.length; i++) {
    teams[i] = finalSortedTeams[i];
  }
};

const sortStandings = () => {
  simStandings = convertStandingsToArray(simStandings);

  Object.values(simStandings).forEach((teams) => {
    if (tournament === "WC") {
      sortGroupTeamsWithH2H(teams);
    } else {
      teams.sort(sortFunction);
    }
  });
};

const getTeamFromStandings = (group, rank) => {
  return simStandings[group][rank - 1].team;
};

const evaluatedStats = {
  AC: {
    first: 0,
    second: 0,
    third: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
  EQ: {
    totalQualify: 0,
    qualifyFromGroup: 0,
    qualifyToPlayoffs: 0,
    qualifyFromPlayoffs: 0,
  },
  CA: {
    first: 0,
    second: 0,
    third: 0,
    fourth: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
  AR: {
    first: 0,
    second: 0,
    third: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
  ARC: {
    first: 0,
    second: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
  CCH: {
    first: 0,
    second: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
  CLA: {
    finals: 0,
    champions: 0,
    relegated: 0,
  },
  CLB: {
    promoted: 0,
    relegated: 0,
  },
  CLC: {
    promoted: 0,
  },
  EC: {
    first: 0,
    second: 0,
    third: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
  WC: {
    first: 0,
    roundOf32: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0,
  },
};

const sortStats =
  (t) =>
  ([teamA, totalsA], [teamB, totalsB]) => {
    const order = [];

    switch (t) {
      case "EQ": {
        order.push(
          "totalQualify",
          "qualifyFromGroup",
          "qualifyFromPlayoffs",
          "qualifyToPlayoffs",
        );
        break;
      }
      case "CA":
        order.push(
          "champions",
          "final",
          "semifinals",
          "quarterfinals",
          "first",
          "second",
          "third",
          "fourth",
        );
        break;
      case "AC":
      case "AR":
      case "EC":
        order.push(
          "champions",
          "final",
          "semifinals",
          "quarterfinals",
          "roundOf16",
          "first",
          "second",
          "third",
        );
        break;
      case "ARC":
      case "CCH":
        order.push(
          "champions",
          "final",
          "semifinals",
          "quarterfinals",
          "first",
          "second",
        );
        break;
      case "CLA":
        order.push("champions", "finals", "!relegated");
        break;
      case "CLB":
        order.push("promoted", "!relegated");
        break;
      case "CLC":
        order.push("promoted");
        break;
      case "WC":
        order.push(
          "champions",
          "final",
          "semifinals",
          "quarterfinals",
          "roundOf16",
          "roundOf32",
          "first",
        );
      default:
        break;
    }

    for (let stat of order) {
      if (stat.startsWith("!")) {
        const s = stat.substr(1);
        if (totalsA[s] !== totalsB[s]) {
          return totalsA[s] - totalsB[s];
        }
      }
      if (totalsA[stat] !== totalsB[stat]) {
        return totalsB[stat] - totalsA[stat];
      }
    }

    return teamA > teamB ? 1 : -1;
  };

let stats;

const getMostCommon = (countsObj) => {
  let maxKey = null;
  let maxCount = -1;
  for (const [key, count] of Object.entries(countsObj || {})) {
    if (count > maxCount) {
      maxCount = count;
      maxKey = key;
    }
  }
  return { key: maxKey, count: maxCount };
};

const printStats = () => {
  const statPrint = Object.entries(stats).reduce((acc, [group, teams]) => {
    acc += `Group ${group}:\n`;

    acc += Object.entries(teams)
      .sort(sortStats(tournament))
      .reduce((tAcc, [team, totals]) => {
        const [, { name }] = Object.entries(teamRatings).find(
          ([code]) => code === team,
        );
        tAcc += `${name}`;

        const valuePrint = Object.values(totals).reduce((vAcc, total) => {
          const percentage = Math.round((total / simulations) * 100);
          vAcc += `,${percentage}%`;

          return vAcc;
        }, "");

        tAcc += `${valuePrint}\n`;

        return tAcc;
      }, "");
    return `${acc}`;
  }, "");

  console.log(statPrint);

  if (groupFixtures && fixtureScoreCounts) {
    let matchesPrint = "\nSuggested Match Scores:\n";
    const matchesByGroup = {};
    groupFixtures.forEach((fixture, index) => {
      const team1 = fixture.teams[0];
      const group = standings[team1] ? standings[team1].group : "Unknown";
      if (!matchesByGroup[group]) {
        matchesByGroup[group] = [];
      }
      matchesByGroup[group].push({ fixture, index });
    });

    for (const [group, items] of Object.entries(matchesByGroup).sort()) {
      matchesPrint += `Group ${group}:\n`;
      items.forEach(({ fixture, index }) => {
        const [team1, team2] = fixture.teams;
        const team1Name = teamRatings[team1]?.name || team1;
        const team2Name = teamRatings[team2]?.name || team2;

        const scoreCounts = fixtureScoreCounts[index]?.scores || {};
        const marginCounts = fixtureScoreCounts[index]?.margins || {};

        const { key: bestScore, count: bestScoreCount } = getMostCommon(scoreCounts);
        const { key: bestMarginStr, count: bestMarginCount } = getMostCommon(marginCounts);

        const scorePercent = Math.round((bestScoreCount / simulations) * 100);
        const marginPercent = Math.round((bestMarginCount / simulations) * 100);

        let marginText = "Draw";
        if (bestMarginStr !== null) {
          const bestMargin = parseInt(bestMarginStr, 10);
          if (bestMargin > 0) {
            marginText = `${team1Name} +${bestMargin}`;
          } else if (bestMargin < 0) {
            marginText = `${team2Name} +${Math.abs(bestMargin)}`;
          }
        }

        let team1WinCount = 0;
        let drawCount = 0;
        let team2WinCount = 0;
        for (const [marginStr, count] of Object.entries(marginCounts)) {
          const margin = parseInt(marginStr, 10);
          if (margin > 0) {
            team1WinCount += count;
          } else if (margin === 0) {
            drawCount += count;
          } else if (margin < 0) {
            team2WinCount += count;
          }
        }

        const team1WinPercent = Math.round((team1WinCount / simulations) * 100);
        const drawPercent = Math.round((drawCount / simulations) * 100);
        const team2WinPercent = Math.round((team2WinCount / simulations) * 100);

        matchesPrint += `  ${team1Name} vs ${team2Name}: ${bestScore || "N/A"} (${scorePercent}%) | Margin: ${marginText} (${marginPercent}%) | ${team1Name} Win (${team1WinPercent}%) Draw (${drawPercent}%) ${team2Name} Win (${team2WinPercent}%)\n`;
      });
    }
    console.log(matchesPrint);
  }
};

const addStat = (team, ...statList) => {
  statList.forEach((stat) => {
    if (team[stat] != undefined) {
      team[stat]++;
    }
  });
};

const addStats = (group, team, ...statList) => {
  if (group) {
    addStat(stats[group][team], ...statList);
  } else {
    const group = Object.values(stats).find((group) =>
      Object.keys(group).includes(team),
    );
    addStat(group[team], ...statList);
  }
};

const rankStatNames = ["first", "second", "third", "fourth"];

const getBestTeamsOfRank = (rank, teamCount, automaticStat) => {
  const rankIndex = rank - 1;
  const teams = Object.entries(simStandings)
    .reduce((acc, [group, teams]) => {
      teams.forEach((team, index) => {
        const teamCode = team.team;
        const stat = rankStatNames[index];
        if (index < rankIndex) {
          addStats(group, teamCode, stat, automaticStat);
        } else if (index === rankIndex && teamCount) {
          addStats(group, teamCode, stat);
          acc.push({
            ...team,
            group,
          });
        }
      });
      return acc;
    }, [])
    .sort(sortFunction)
    .slice(0, teamCount);

  teams.forEach(({ group, team }) => {
    addStats(group, team, automaticStat);
  });

  return teams;
};

const drawTeam = (pot) => pot[Math.floor(Math.random() * pot.length)];

const updateStats = (stage) => {
  sortStandings();

  switch (stage) {
    case "AC": {
      const matchupIndices = {
        ABCD: [2, 3, 0, 1],
        ABCE: [2, 0, 1, 3],
        ABCF: [2, 0, 1, 3],
        ABDE: [2, 0, 1, 3],
        ABDF: [2, 0, 1, 3],
        ABEF: [2, 0, 1, 3],
        ACDE: [1, 2, 0, 3],
        ACDF: [1, 2, 0, 3],
        ACEF: [1, 0, 3, 2],
        ADEF: [1, 0, 3, 2],
        BCDE: [1, 2, 0, 3],
        BCDF: [1, 2, 0, 3],
        BCEF: [2, 1, 0, 3],
        BDEF: [2, 1, 0, 3],
        CDEF: [0, 1, 3, 2],
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, "roundOf16").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        },
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        "",
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("C", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        thirdPlacedTeams[scenarioIndices[3]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        thirdPlacedTeams[scenarioIndices[1]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        getTeamFromStandings("E", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        thirdPlacedTeams[scenarioIndices[2]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("E", 1),
        getTeamFromStandings("D", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        thirdPlacedTeams[scenarioIndices[0]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("B", 2),
        getTeamFromStandings("F", 2),
      ]);

      return knockouts;
    }
    case "ARC": {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, "quarterfinals");

      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("A", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        getTeamFromStandings("C", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("B", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        getTeamFromStandings("D", 2),
      ]);

      return knockouts;
    }
    case "EQ": {
      const qualifiedTeams = [];

      Object.entries(simStandings).forEach(([group, [qual1, qual2]]) => {
        const stats = ["totalQualify", "qualifyFromGroup"];

        const q1 = qual1.team;
        const q2 = qual2.team;

        addStats(group, q1, ...stats);
        addStats(group, q2, ...stats);

        qualifiedTeams.push(q1, q2);
      });

      const playoffTeams = [];

      const isQualified = (team) =>
        qualifiedTeams.includes(team) || playoffTeams.includes(team);

      const addTeamsToLeague = (obj, league, teams) => {
        const leagueTeams = obj[league];

        obj[league] = {
          ...leagueTeams,
          rest: [...leagueTeams.rest, ...teams],
        };
      };

      const leagues = ["C", "B", "A"];
      const selectedTeamsFromLeagues = leagues.reduce((acc, cur) => {
        acc[cur] = { groupWinnerSelected: false, teams: [] };
        return acc;
      }, {});

      leagues.forEach((league) => {
        const { groupWinners, rest } = nationsLeagueStandings[league];
        const selectedTeamsFromLeague = selectedTeamsFromLeagues[league];
        groupWinners.forEach((groupWinner) => {
          if (!isQualified(groupWinner)) {
            playoffTeams.push(groupWinner);
            selectedTeamsFromLeague.teams.push(groupWinner);
            selectedTeamsFromLeague.groupWinnerSelected = true;
          }
        });
        for (
          let i = 0;
          i < rest.length && selectedTeamsFromLeague.teams.length < 4;
          i += 1
        ) {
          const team = rest[i];
          if (isQualified(team)) {
            continue;
          }
          playoffTeams.push(team);
          selectedTeamsFromLeague.teams.push(team);
        }
      });

      const bestGroupWinnerD = nationsLeagueStandings.D.groupWinners[0];
      const transitionLetter = (letter, increment = true) =>
        String.fromCharCode(letter.charCodeAt(0) + (increment ? 1 : -1));
      leagues.forEach((league) => {
        const { groupWinnerSelected, teams } = selectedTeamsFromLeagues[league];
        let teamsToSelect = 4 - teams.length;
        while (teamsToSelect > 0) {
          if (!isQualified(bestGroupWinnerD)) {
            playoffTeams.push(bestGroupWinnerD);
            selectedTeamsFromLeagues.D = { teams: [bestGroupWinnerD] };
            teamsToSelect--;
          }
          for (
            let group = groupWinnerSelected ? transitionLetter(league) : "A";
            group <= "D";
            group = transitionLetter(group)
          ) {
            const availableTeams = nationsLeagueStandings[group].rest.filter(
              (team) => !isQualified(team),
            );
            if (availableTeams.length) {
              const nextTeam = availableTeams[0];
              playoffTeams.push(nextTeam);
              selectedTeamsFromLeagues[group].teams.push(nextTeam);
              teamsToSelect--;
              break;
            }
          }
        }
      });

      playoffTeams.forEach((team) => {
        addStats(null, team, "qualifyToPlayoffs");
      });

      const drawnTeams = [];
      const draws = leagues.reduce((acc, cur) => {
        const { teams } = selectedTeamsFromLeagues[cur];
        if (teams.length === 4) {
          acc[cur] = teams;
          drawnTeams.push(...teams);
        } else if (teams.length > 4) {
          const pathTeams = [];
          if (
            Object.keys(selectedTeamsFromLeagues).some(
              (league) =>
                league < cur && selectedTeamsFromLeagues[league].teams.length,
            )
          ) {
            const [groupWinners, rest] = partition(teams, (team) =>
              nationsLeagueStandings[cur].groupWinners.includes(team),
            );
            pathTeams.push(...groupWinners);

            const pot = rest.filter((team) => !drawnTeams.includes(team));
            const restTeams = sampleSize(pot, 4 - groupWinners.length);
            pathTeams.push(...restTeams);
          } else {
            pathTeams.push(...sampleSize(teams, 4));
          }
          pathTeams.sort((a, b) => teams.indexOf(a) - teams.indexOf(b));
          acc[cur] = pathTeams;
          drawnTeams.push(...pathTeams);
        } else {
          const findLeague = (team) =>
            Object.keys(selectedTeamsFromLeagues).find((league) =>
              selectedTeamsFromLeagues[league].teams.includes(team),
            );
          const pathTeams = playoffTeams.filter(
            (team) => !drawnTeams.includes(team),
          );
          pathTeams.sort((a, b) => {
            const aLeague = findLeague(a);
            const bLeague = findLeague(b);
            if (aLeague < bLeague) {
              return -1;
            }
            if (bLeague < aLeague) {
              return 1;
            }
            const { teams } = selectedTeamsFromLeagues[aLeague];
            return teams.indexOf(a) - teams.indexOf(b);
          });
          acc[cur] = pathTeams;
          drawnTeams.push(...pathTeams);
        }
        return acc;
      }, {});

      return draws;
    }
    case "CA": {
      getBestTeamsOfRank(5, 0, "quarterfinals");

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("B", 4),
      ]);
      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("B", 3),
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("A", 4),
      ]);
      knockouts.push([
        getTeamFromStandings("B", 2),
        getTeamFromStandings("A", 3),
      ]);

      return knockouts;
    }
    case "EC": {
      const matchupIndices = {
        ABCD: [0, 3, 1, 2],
        ABCE: [0, 3, 1, 2],
        ABCF: [0, 3, 1, 2],
        ABDE: [2, 3, 0, 1],
        ABDF: [2, 3, 0, 1],
        ABEF: [3, 2, 1, 0],
        ACDE: [3, 2, 1, 0],
        ACDF: [3, 2, 1, 0],
        ACEF: [2, 3, 1, 0],
        ADEF: [2, 3, 1, 0],
        BCDE: [3, 2, 0, 1],
        BCDF: [3, 2, 1, 0],
        BCEF: [3, 2, 1, 0],
        BDEF: [3, 2, 1, 0],
        CDEF: [3, 2, 1, 0],
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, "roundOf16").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        },
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        "",
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("B", 1),
        thirdPlacedTeams[scenarioIndices[0]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("C", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        thirdPlacedTeams[scenarioIndices[3]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("D", 2),
        getTeamFromStandings("E", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("E", 1),
        thirdPlacedTeams[scenarioIndices[2]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        getTeamFromStandings("F", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        thirdPlacedTeams[scenarioIndices[1]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("B", 2),
      ]);

      return knockouts;
    }
    case "AR": {
      const matchupIndices = {
        ABCD: [2, 3, 0, 1],
        ABCE: [2, 0, 1, 3],
        ABCF: [2, 0, 1, 3],
        ABDE: [2, 0, 1, 3],
        ABDF: [2, 0, 1, 3],
        ABEF: [2, 0, 1, 3],
        ACDE: [1, 2, 0, 3],
        ACDF: [1, 2, 0, 3],
        ACEF: [1, 0, 3, 2],
        ADEF: [1, 0, 3, 2],
        BCDE: [1, 2, 0, 3],
        BCDF: [1, 2, 0, 3],
        BCEF: [2, 1, 0, 3],
        BDEF: [2, 1, 0, 3],
        CDEF: [0, 1, 3, 2],
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, "roundOf16").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        },
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        "",
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("C", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        thirdPlacedTeams[scenarioIndices[3]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        thirdPlacedTeams[scenarioIndices[1]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        getTeamFromStandings("E", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("E", 1),
        getTeamFromStandings("D", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        thirdPlacedTeams[scenarioIndices[2]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("B", 2),
        getTeamFromStandings("F", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        thirdPlacedTeams[scenarioIndices[0]].team,
      ]);

      return knockouts;
    }
    case "CCH": {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, "quarterfinals");

      knockouts.push([
        getTeamFromStandings("D", 1),
        getTeamFromStandings("A", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("C", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("D", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        getTeamFromStandings("B", 2),
      ]);

      return knockouts;
    }
    case "WC": {
      const matchupIndices = {
        ABCDEFGH: [7, 6, 1, 2, 0, 5, 3, 4],
        ABCDEFGI: [2, 6, 1, 3, 0, 5, 4, 7],
        ABCDEFGJ: [2, 6, 1, 3, 0, 5, 4, 7],
        ABCDEFGK: [2, 6, 1, 3, 0, 5, 4, 7],
        ABCDEFGL: [2, 6, 1, 3, 0, 5, 7, 4],
        ABCDEFHI: [6, 4, 1, 2, 0, 5, 3, 7],
        ABCDEFHJ: [6, 7, 1, 2, 0, 5, 3, 4],
        ABCDEFHK: [6, 4, 1, 2, 0, 5, 3, 7],
        ABCDEFHL: [6, 5, 1, 2, 0, 3, 7, 4],
        ABCDEFIJ: [2, 7, 1, 3, 0, 5, 4, 6],
        ABCDEFIK: [2, 4, 1, 3, 0, 5, 6, 7],
        ABCDEFIL: [2, 4, 1, 3, 0, 5, 7, 6],
        ABCDEFJK: [2, 6, 1, 3, 0, 5, 4, 7],
        ABCDEFJL: [2, 6, 1, 3, 0, 5, 7, 4],
        ABCDEFKL: [2, 4, 1, 3, 0, 5, 7, 6],
        ABCDEGHI: [6, 5, 1, 2, 0, 3, 4, 7],
        ABCDEGHJ: [6, 5, 1, 2, 0, 3, 4, 7],
        ABCDEGHK: [6, 5, 1, 2, 0, 3, 4, 7],
        ABCDEGHL: [6, 5, 1, 2, 0, 3, 7, 4],
        ABCDEGIJ: [4, 5, 1, 2, 0, 3, 6, 7],
        ABCDEGIK: [4, 5, 1, 2, 0, 3, 6, 7],
        ABCDEGIL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDEGJK: [4, 5, 1, 2, 0, 3, 6, 7],
        ABCDEGJL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDEGKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDEHIJ: [5, 7, 1, 2, 0, 3, 4, 6],
        ABCDEHIK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCDEHIL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDEHJK: [5, 6, 1, 2, 0, 3, 4, 7],
        ABCDEHJL: [5, 6, 1, 2, 0, 3, 7, 4],
        ABCDEHKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDEIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABCDEIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABCDEIKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDEJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDFGHI: [6, 5, 1, 2, 0, 4, 3, 7],
        ABCDFGHJ: [6, 5, 1, 2, 0, 4, 3, 7],
        ABCDFGHK: [6, 5, 1, 2, 0, 4, 3, 7],
        ABCDFGHL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDFGIJ: [2, 5, 1, 3, 0, 4, 6, 7],
        ABCDFGIK: [2, 5, 1, 3, 0, 4, 6, 7],
        ABCDFGIL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDFGJK: [2, 5, 1, 3, 0, 4, 6, 7],
        ABCDFGJL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDFGKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDFHIJ: [5, 7, 1, 2, 0, 4, 3, 6],
        ABCDFHIK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCDFHIL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDFHJK: [5, 6, 1, 2, 0, 4, 3, 7],
        ABCDFHJL: [2, 6, 1, 3, 0, 4, 7, 5],
        ABCDFHKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDFIJK: [2, 6, 1, 3, 0, 4, 5, 7],
        ABCDFIJL: [2, 6, 1, 3, 0, 4, 7, 5],
        ABCDFIKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDFJKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDGHIJ: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCDGHIK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCDGHIL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDGHJK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCDGHJL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDGHKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDGIJK: [2, 6, 1, 3, 0, 4, 5, 7],
        ABCDGIJL: [2, 6, 1, 3, 0, 4, 7, 5],
        ABCDGIKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCDGJKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCDHIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABCDHIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABCDHIKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDHJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCDIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCEFGHI: [6, 5, 1, 2, 0, 4, 3, 7],
        ABCEFGHJ: [6, 5, 1, 2, 0, 4, 3, 7],
        ABCEFGHK: [6, 5, 1, 2, 0, 4, 3, 7],
        ABCEFGHL: [6, 5, 1, 2, 0, 4, 7, 3],
        ABCEFGIJ: [3, 5, 1, 2, 0, 4, 6, 7],
        ABCEFGIK: [3, 5, 1, 2, 0, 4, 6, 7],
        ABCEFGIL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEFGJK: [3, 5, 1, 2, 0, 4, 6, 7],
        ABCEFGJL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEFGKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEFHIJ: [5, 7, 1, 2, 0, 4, 3, 6],
        ABCEFHIK: [5, 3, 1, 2, 0, 4, 6, 7],
        ABCEFHIL: [5, 3, 1, 2, 0, 4, 7, 6],
        ABCEFHJK: [5, 6, 1, 2, 0, 4, 3, 7],
        ABCEFHJL: [5, 6, 1, 2, 0, 4, 7, 3],
        ABCEFHKL: [5, 3, 1, 2, 0, 4, 7, 6],
        ABCEFIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABCEFIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABCEFIKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEFJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEGHIJ: [5, 7, 1, 2, 0, 4, 3, 6],
        ABCEGHIK: [3, 4, 1, 2, 0, 5, 6, 7],
        ABCEGHIL: [3, 4, 1, 2, 0, 5, 7, 6],
        ABCEGHJK: [5, 6, 1, 2, 0, 4, 3, 7],
        ABCEGHJL: [5, 6, 1, 2, 0, 4, 7, 3],
        ABCEGHKL: [3, 4, 1, 2, 0, 5, 7, 6],
        ABCEGIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABCEGIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABCEGIKL: [3, 4, 1, 0, 5, 2, 7, 6],
        ABCEGJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEHIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABCEHIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABCEHIKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEHJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABCEIJKL: [3, 5, 1, 0, 4, 2, 7, 6],
        ABCFGHIJ: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCFGHIK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCFGHIL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCFGHJK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABCFGHJL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCFGHKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCFGIJK: [2, 6, 1, 3, 0, 4, 5, 7],
        ABCFGIJL: [2, 6, 1, 3, 0, 4, 7, 5],
        ABCFGIKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABCFGJKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABCFHIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABCFHIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABCFHIKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCFHJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCFIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCGHIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABCGHIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABCGHIKL: [5, 3, 1, 2, 0, 4, 7, 6],
        ABCGHJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCGIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABCHIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABDEFGHI: [6, 5, 1, 2, 0, 4, 3, 7],
        ABDEFGHJ: [6, 5, 1, 2, 0, 4, 3, 7],
        ABDEFGHK: [6, 5, 1, 2, 0, 4, 3, 7],
        ABDEFGHL: [6, 5, 1, 2, 0, 4, 7, 3],
        ABDEFGIJ: [3, 5, 1, 2, 0, 4, 6, 7],
        ABDEFGIK: [3, 5, 1, 2, 0, 4, 6, 7],
        ABDEFGIL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEFGJK: [3, 5, 1, 2, 0, 4, 6, 7],
        ABDEFGJL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEFGKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEFHIJ: [5, 7, 1, 2, 0, 4, 3, 6],
        ABDEFHIK: [5, 3, 1, 2, 0, 4, 6, 7],
        ABDEFHIL: [5, 3, 1, 2, 0, 4, 7, 6],
        ABDEFHJK: [5, 6, 1, 2, 0, 4, 3, 7],
        ABDEFHJL: [5, 6, 1, 2, 0, 4, 7, 3],
        ABDEFHKL: [5, 3, 1, 2, 0, 4, 7, 6],
        ABDEFIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABDEFIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABDEFIKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEFJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEGHIJ: [5, 7, 1, 2, 0, 4, 3, 6],
        ABDEGHIK: [3, 4, 1, 2, 0, 5, 6, 7],
        ABDEGHIL: [3, 4, 1, 2, 0, 5, 7, 6],
        ABDEGHJK: [5, 6, 1, 2, 0, 4, 3, 7],
        ABDEGHJL: [5, 6, 1, 2, 0, 4, 7, 3],
        ABDEGHKL: [3, 4, 1, 2, 0, 5, 7, 6],
        ABDEGIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABDEGIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABDEGIKL: [3, 4, 1, 0, 5, 2, 7, 6],
        ABDEGJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEHIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABDEHIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABDEHIKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEHJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDEIJKL: [3, 5, 1, 0, 4, 2, 7, 6],
        ABDFGHIJ: [5, 4, 1, 2, 0, 3, 6, 7],
        ABDFGHIK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABDFGHIL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABDFGHJK: [5, 4, 1, 2, 0, 3, 6, 7],
        ABDFGHJL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABDFGHKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABDFGIJK: [3, 6, 1, 2, 0, 4, 5, 7],
        ABDFGIJL: [3, 6, 1, 2, 0, 4, 7, 5],
        ABDFGIKL: [5, 4, 1, 2, 0, 3, 7, 6],
        ABDFGJKL: [3, 5, 1, 2, 0, 4, 7, 6],
        ABDFHIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABDFHIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABDFHIKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABDFHJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABDFIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABDGHIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABDGHIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABDGHIKL: [5, 3, 1, 2, 0, 4, 7, 6],
        ABDGHJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABDGIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABDHIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABEFGHIJ: [5, 7, 1, 3, 0, 4, 2, 6],
        ABEFGHIK: [2, 4, 1, 3, 0, 5, 6, 7],
        ABEFGHIL: [2, 4, 1, 3, 0, 5, 7, 6],
        ABEFGHJK: [5, 6, 1, 3, 0, 4, 2, 7],
        ABEFGHJL: [5, 6, 1, 3, 0, 4, 7, 2],
        ABEFGHKL: [2, 4, 1, 3, 0, 5, 7, 6],
        ABEFGIJK: [2, 6, 1, 3, 0, 4, 5, 7],
        ABEFGIJL: [2, 6, 1, 3, 0, 4, 7, 5],
        ABEFGIKL: [2, 4, 1, 0, 5, 3, 7, 6],
        ABEFGJKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABEFHIJK: [2, 6, 1, 3, 0, 4, 5, 7],
        ABEFHIJL: [2, 6, 1, 3, 0, 4, 7, 5],
        ABEFHIKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABEFHJKL: [2, 5, 1, 3, 0, 4, 7, 6],
        ABEFIJKL: [2, 5, 1, 0, 4, 3, 7, 6],
        ABEGHIJK: [2, 6, 1, 0, 4, 3, 5, 7],
        ABEGHIJL: [2, 6, 1, 0, 4, 3, 7, 5],
        ABEGHIKL: [2, 3, 1, 0, 5, 4, 7, 6],
        ABEGHJKL: [2, 5, 1, 0, 4, 3, 7, 6],
        ABEGIJKL: [2, 5, 1, 0, 4, 3, 7, 6],
        ABEHIJKL: [2, 5, 1, 0, 4, 3, 7, 6],
        ABFGHIJK: [4, 6, 1, 2, 0, 3, 5, 7],
        ABFGHIJL: [4, 6, 1, 2, 0, 3, 7, 5],
        ABFGHIKL: [4, 3, 1, 0, 5, 2, 7, 6],
        ABFGHJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABFGIJKL: [4, 5, 1, 2, 0, 3, 7, 6],
        ABFHIJKL: [3, 5, 1, 0, 4, 2, 7, 6],
        ABGHIJKL: [3, 5, 1, 0, 4, 2, 7, 6],
        ACDEFGHI: [6, 5, 3, 1, 0, 4, 2, 7],
        ACDEFGHJ: [6, 5, 7, 1, 0, 4, 2, 3],
        ACDEFGHK: [6, 5, 3, 1, 0, 4, 2, 7],
        ACDEFGHL: [6, 5, 4, 1, 0, 2, 7, 3],
        ACDEFGIJ: [1, 5, 7, 2, 0, 4, 3, 6],
        ACDEFGIK: [1, 5, 3, 2, 0, 4, 6, 7],
        ACDEFGIL: [1, 5, 3, 2, 0, 4, 7, 6],
        ACDEFGJK: [1, 5, 6, 2, 0, 4, 3, 7],
        ACDEFGJL: [1, 5, 6, 2, 0, 4, 7, 3],
        ACDEFGKL: [1, 5, 3, 2, 0, 4, 7, 6],
        ACDEFHIJ: [5, 7, 3, 1, 0, 4, 2, 6],
        ACDEFHIK: [5, 3, 4, 1, 0, 2, 6, 7],
        ACDEFHIL: [5, 3, 4, 1, 0, 2, 7, 6],
        ACDEFHJK: [5, 6, 3, 1, 0, 4, 2, 7],
        ACDEFHJL: [5, 6, 4, 1, 0, 2, 7, 3],
        ACDEFHKL: [5, 3, 4, 1, 0, 2, 7, 6],
        ACDEFIJK: [1, 6, 3, 2, 0, 4, 5, 7],
        ACDEFIJL: [1, 6, 3, 2, 0, 4, 7, 5],
        ACDEFIKL: [1, 3, 5, 2, 0, 4, 7, 6],
        ACDEFJKL: [1, 5, 3, 2, 0, 4, 7, 6],
        ACDEGHIJ: [5, 4, 7, 1, 0, 2, 3, 6],
        ACDEGHIK: [5, 4, 3, 1, 0, 2, 6, 7],
        ACDEGHIL: [5, 4, 3, 1, 0, 2, 7, 6],
        ACDEGHJK: [5, 4, 6, 1, 0, 2, 3, 7],
        ACDEGHJL: [5, 4, 6, 1, 0, 2, 7, 3],
        ACDEGHKL: [5, 4, 3, 1, 0, 2, 7, 6],
        ACDEGIJK: [3, 4, 6, 1, 0, 2, 5, 7],
        ACDEGIJL: [3, 4, 6, 1, 0, 2, 7, 5],
        ACDEGIKL: [3, 4, 5, 1, 0, 2, 7, 6],
        ACDEGJKL: [3, 4, 5, 1, 0, 2, 7, 6],
        ACDEHIJK: [4, 6, 3, 1, 0, 2, 5, 7],
        ACDEHIJL: [4, 6, 3, 1, 0, 2, 7, 5],
        ACDEHIKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACDEHJKL: [4, 5, 3, 1, 0, 2, 7, 6],
        ACDEIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        ACDFGHIJ: [5, 4, 7, 1, 0, 3, 2, 6],
        ACDFGHIK: [5, 4, 3, 1, 0, 2, 6, 7],
        ACDFGHIL: [5, 4, 3, 1, 0, 2, 7, 6],
        ACDFGHJK: [5, 4, 6, 1, 0, 3, 2, 7],
        ACDFGHJL: [1, 4, 6, 2, 0, 3, 7, 5],
        ACDFGHKL: [5, 4, 3, 1, 0, 2, 7, 6],
        ACDFGIJK: [1, 4, 6, 2, 0, 3, 5, 7],
        ACDFGIJL: [1, 4, 6, 2, 0, 3, 7, 5],
        ACDFGIKL: [1, 4, 5, 2, 0, 3, 7, 6],
        ACDFGJKL: [1, 4, 5, 2, 0, 3, 7, 6],
        ACDFHIJK: [4, 6, 3, 1, 0, 2, 5, 7],
        ACDFHIJL: [4, 6, 3, 1, 0, 2, 7, 5],
        ACDFHIKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACDFHJKL: [4, 5, 3, 1, 0, 2, 7, 6],
        ACDFIJKL: [1, 5, 4, 2, 0, 3, 7, 6],
        ACDGHIJK: [4, 3, 6, 1, 0, 2, 5, 7],
        ACDGHIJL: [4, 3, 6, 1, 0, 2, 7, 5],
        ACDGHIKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACDGHJKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACDGIJKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACDHIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        ACEFGHIJ: [5, 4, 7, 1, 0, 3, 2, 6],
        ACEFGHIK: [5, 4, 2, 1, 0, 3, 6, 7],
        ACEFGHIL: [5, 4, 2, 1, 0, 3, 7, 6],
        ACEFGHJK: [5, 4, 6, 1, 0, 3, 2, 7],
        ACEFGHJL: [5, 4, 6, 1, 0, 3, 7, 2],
        ACEFGHKL: [5, 4, 2, 1, 0, 3, 7, 6],
        ACEFGIJK: [2, 4, 6, 1, 0, 3, 5, 7],
        ACEFGIJL: [2, 4, 6, 1, 0, 3, 7, 5],
        ACEFGIKL: [2, 4, 5, 1, 0, 3, 7, 6],
        ACEFGJKL: [2, 4, 5, 1, 0, 3, 7, 6],
        ACEFHIJK: [4, 6, 2, 1, 0, 3, 5, 7],
        ACEFHIJL: [4, 6, 2, 1, 0, 3, 7, 5],
        ACEFHIKL: [4, 2, 5, 1, 0, 3, 7, 6],
        ACEFHJKL: [4, 5, 2, 1, 0, 3, 7, 6],
        ACEFIJKL: [2, 5, 4, 1, 0, 3, 7, 6],
        ACEGHIJK: [2, 3, 6, 1, 0, 4, 5, 7],
        ACEGHIJL: [2, 3, 6, 1, 0, 4, 7, 5],
        ACEGHIKL: [2, 3, 5, 1, 0, 4, 7, 6],
        ACEGHJKL: [2, 3, 5, 1, 0, 4, 7, 6],
        ACEGIJKL: [2, 5, 4, 1, 0, 3, 7, 6],
        ACEHIJKL: [2, 5, 4, 1, 0, 3, 7, 6],
        ACFGHIJK: [4, 3, 6, 1, 0, 2, 5, 7],
        ACFGHIJL: [4, 3, 6, 1, 0, 2, 7, 5],
        ACFGHIKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACFGHJKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACFGIJKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ACFHIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        ACGHIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        ADEFGHIJ: [5, 4, 7, 1, 0, 3, 2, 6],
        ADEFGHIK: [5, 4, 2, 1, 0, 3, 6, 7],
        ADEFGHIL: [5, 4, 2, 1, 0, 3, 7, 6],
        ADEFGHJK: [5, 4, 6, 1, 0, 3, 2, 7],
        ADEFGHJL: [5, 4, 6, 1, 0, 3, 7, 2],
        ADEFGHKL: [5, 4, 2, 1, 0, 3, 7, 6],
        ADEFGIJK: [2, 4, 6, 1, 0, 3, 5, 7],
        ADEFGIJL: [2, 4, 6, 1, 0, 3, 7, 5],
        ADEFGIKL: [2, 4, 5, 1, 0, 3, 7, 6],
        ADEFGJKL: [2, 4, 5, 1, 0, 3, 7, 6],
        ADEFHIJK: [4, 6, 2, 1, 0, 3, 5, 7],
        ADEFHIJL: [4, 6, 2, 1, 0, 3, 7, 5],
        ADEFHIKL: [4, 2, 5, 1, 0, 3, 7, 6],
        ADEFHJKL: [4, 5, 2, 1, 0, 3, 7, 6],
        ADEFIJKL: [2, 5, 4, 1, 0, 3, 7, 6],
        ADEGHIJK: [2, 3, 6, 1, 0, 4, 5, 7],
        ADEGHIJL: [2, 3, 6, 1, 0, 4, 7, 5],
        ADEGHIKL: [2, 3, 5, 1, 0, 4, 7, 6],
        ADEGHJKL: [2, 3, 5, 1, 0, 4, 7, 6],
        ADEGIJKL: [2, 5, 4, 1, 0, 3, 7, 6],
        ADEHIJKL: [2, 5, 4, 1, 0, 3, 7, 6],
        ADFGHIJK: [4, 3, 6, 1, 0, 2, 5, 7],
        ADFGHIJL: [4, 3, 6, 1, 0, 2, 7, 5],
        ADFGHIKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ADFGHJKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ADFGIJKL: [4, 3, 5, 1, 0, 2, 7, 6],
        ADFHIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        ADGHIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        AEFGHIJK: [1, 3, 6, 2, 0, 4, 5, 7],
        AEFGHIJL: [1, 3, 6, 2, 0, 4, 7, 5],
        AEFGHIKL: [1, 3, 5, 2, 0, 4, 7, 6],
        AEFGHJKL: [1, 3, 5, 2, 0, 4, 7, 6],
        AEFGIJKL: [1, 5, 4, 2, 0, 3, 7, 6],
        AEFHIJKL: [1, 5, 4, 2, 0, 3, 7, 6],
        AEGHIJKL: [1, 5, 4, 0, 3, 2, 7, 6],
        AFGHIJKL: [3, 5, 4, 1, 0, 2, 7, 6],
        BCDEFGHI: [1, 5, 0, 2, 6, 4, 3, 7],
        BCDEFGHJ: [6, 5, 0, 1, 7, 4, 2, 3],
        BCDEFGHK: [1, 5, 0, 2, 6, 4, 3, 7],
        BCDEFGHL: [1, 5, 0, 2, 6, 4, 7, 3],
        BCDEFGIJ: [1, 5, 0, 2, 7, 4, 3, 6],
        BCDEFGIK: [1, 5, 0, 2, 3, 4, 6, 7],
        BCDEFGIL: [1, 5, 0, 2, 3, 4, 7, 6],
        BCDEFGJK: [1, 5, 0, 2, 6, 4, 3, 7],
        BCDEFGJL: [1, 5, 0, 2, 6, 4, 7, 3],
        BCDEFGKL: [1, 5, 0, 2, 3, 4, 7, 6],
        BCDEFHIJ: [1, 7, 0, 2, 5, 4, 3, 6],
        BCDEFHIK: [1, 3, 0, 2, 5, 4, 6, 7],
        BCDEFHIL: [1, 3, 0, 2, 5, 4, 7, 6],
        BCDEFHJK: [1, 6, 0, 2, 5, 4, 3, 7],
        BCDEFHJL: [1, 6, 0, 2, 5, 4, 7, 3],
        BCDEFHKL: [1, 3, 0, 2, 5, 4, 7, 6],
        BCDEFIJK: [1, 6, 0, 2, 3, 4, 5, 7],
        BCDEFIJL: [1, 6, 0, 2, 3, 4, 7, 5],
        BCDEFIKL: [1, 3, 0, 2, 5, 4, 7, 6],
        BCDEFJKL: [1, 5, 0, 2, 3, 4, 7, 6],
        BCDEGHIJ: [5, 4, 0, 1, 7, 2, 3, 6],
        BCDEGHIK: [3, 4, 0, 1, 5, 2, 6, 7],
        BCDEGHIL: [3, 4, 0, 1, 5, 2, 7, 6],
        BCDEGHJK: [5, 4, 0, 1, 6, 2, 3, 7],
        BCDEGHJL: [5, 4, 0, 1, 6, 2, 7, 3],
        BCDEGHKL: [3, 4, 0, 1, 5, 2, 7, 6],
        BCDEGIJK: [3, 4, 0, 1, 6, 2, 5, 7],
        BCDEGIJL: [3, 4, 0, 1, 6, 2, 7, 5],
        BCDEGIKL: [3, 4, 0, 1, 5, 2, 7, 6],
        BCDEGJKL: [3, 4, 0, 1, 5, 2, 7, 6],
        BCDEHIJK: [3, 6, 0, 1, 4, 2, 5, 7],
        BCDEHIJL: [3, 6, 0, 1, 4, 2, 7, 5],
        BCDEHIKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BCDEHJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BCDEIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BCDFGHIJ: [5, 4, 0, 1, 7, 3, 2, 6],
        BCDFGHIK: [1, 4, 0, 2, 5, 3, 6, 7],
        BCDFGHIL: [1, 4, 0, 2, 5, 3, 7, 6],
        BCDFGHJK: [5, 4, 0, 1, 6, 3, 2, 7],
        BCDFGHJL: [1, 4, 0, 2, 5, 3, 7, 6],
        BCDFGHKL: [1, 4, 0, 2, 5, 3, 7, 6],
        BCDFGIJK: [1, 4, 0, 2, 6, 3, 5, 7],
        BCDFGIJL: [1, 4, 0, 2, 6, 3, 7, 5],
        BCDFGIKL: [1, 4, 0, 2, 5, 3, 7, 6],
        BCDFGJKL: [1, 4, 0, 2, 5, 3, 7, 6],
        BCDFHIJK: [1, 6, 0, 2, 4, 3, 5, 7],
        BCDFHIJL: [1, 6, 0, 2, 4, 3, 7, 5],
        BCDFHIKL: [1, 5, 0, 2, 4, 3, 7, 6],
        BCDFHJKL: [1, 5, 0, 2, 4, 3, 7, 6],
        BCDFIJKL: [1, 5, 0, 2, 4, 3, 7, 6],
        BCDGHIJK: [4, 3, 0, 1, 6, 2, 5, 7],
        BCDGHIJL: [4, 3, 0, 1, 6, 2, 7, 5],
        BCDGHIKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BCDGHJKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BCDGIJKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BCDHIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BCEFGHIJ: [5, 4, 0, 1, 7, 3, 2, 6],
        BCEFGHIK: [2, 4, 0, 1, 5, 3, 6, 7],
        BCEFGHIL: [2, 4, 0, 1, 5, 3, 7, 6],
        BCEFGHJK: [5, 4, 0, 1, 6, 3, 2, 7],
        BCEFGHJL: [5, 4, 0, 1, 6, 3, 7, 2],
        BCEFGHKL: [2, 4, 0, 1, 5, 3, 7, 6],
        BCEFGIJK: [2, 4, 0, 1, 6, 3, 5, 7],
        BCEFGIJL: [2, 4, 0, 1, 6, 3, 7, 5],
        BCEFGIKL: [2, 4, 0, 1, 5, 3, 7, 6],
        BCEFGJKL: [2, 4, 0, 1, 5, 3, 7, 6],
        BCEFHIJK: [2, 6, 0, 1, 4, 3, 5, 7],
        BCEFHIJL: [2, 6, 0, 1, 4, 3, 7, 5],
        BCEFHIKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BCEFHJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BCEFIJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BCEGHIJK: [2, 6, 0, 1, 4, 3, 5, 7],
        BCEGHIJL: [2, 6, 0, 1, 4, 3, 7, 5],
        BCEGHIKL: [2, 3, 0, 1, 5, 4, 7, 6],
        BCEGHJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BCEGIJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BCEHIJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BCFGHIJK: [4, 3, 0, 1, 6, 2, 5, 7],
        BCFGHIJL: [4, 3, 0, 1, 6, 2, 7, 5],
        BCFGHIKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BCFGHJKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BCFGIJKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BCFHIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BCGHIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BDEFGHIJ: [5, 4, 0, 1, 7, 3, 2, 6],
        BDEFGHIK: [2, 4, 0, 1, 5, 3, 6, 7],
        BDEFGHIL: [2, 4, 0, 1, 5, 3, 7, 6],
        BDEFGHJK: [5, 4, 0, 1, 6, 3, 2, 7],
        BDEFGHJL: [5, 4, 0, 1, 6, 3, 7, 2],
        BDEFGHKL: [2, 4, 0, 1, 5, 3, 7, 6],
        BDEFGIJK: [2, 4, 0, 1, 6, 3, 5, 7],
        BDEFGIJL: [2, 4, 0, 1, 6, 3, 7, 5],
        BDEFGIKL: [2, 4, 0, 1, 5, 3, 7, 6],
        BDEFGJKL: [2, 4, 0, 1, 5, 3, 7, 6],
        BDEFHIJK: [2, 6, 0, 1, 4, 3, 5, 7],
        BDEFHIJL: [2, 6, 0, 1, 4, 3, 7, 5],
        BDEFHIKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BDEFHJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BDEFIJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BDEGHIJK: [2, 6, 0, 1, 4, 3, 5, 7],
        BDEGHIJL: [2, 6, 0, 1, 4, 3, 7, 5],
        BDEGHIKL: [2, 3, 0, 1, 5, 4, 7, 6],
        BDEGHJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BDEGIJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BDEHIJKL: [2, 5, 0, 1, 4, 3, 7, 6],
        BDFGHIJK: [4, 3, 0, 1, 6, 2, 5, 7],
        BDFGHIJL: [4, 3, 0, 1, 6, 2, 7, 5],
        BDFGHIKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BDFGHJKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BDFGIJKL: [4, 3, 0, 1, 5, 2, 7, 6],
        BDFHIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BDGHIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        BEFGHIJK: [1, 6, 0, 2, 4, 3, 5, 7],
        BEFGHIJL: [1, 6, 0, 2, 4, 3, 7, 5],
        BEFGHIKL: [1, 3, 0, 2, 5, 4, 7, 6],
        BEFGHJKL: [1, 5, 0, 2, 4, 3, 7, 6],
        BEFGIJKL: [1, 5, 0, 2, 4, 3, 7, 6],
        BEFHIJKL: [1, 5, 0, 2, 4, 3, 7, 6],
        BEGHIJKL: [1, 5, 4, 0, 3, 2, 7, 6],
        BFGHIJKL: [3, 5, 0, 1, 4, 2, 7, 6],
        CDEFGHIJ: [0, 4, 7, 1, 5, 3, 2, 6],
        CDEFGHIK: [0, 4, 2, 1, 5, 3, 6, 7],
        CDEFGHIL: [0, 4, 2, 1, 5, 3, 7, 6],
        CDEFGHJK: [0, 4, 6, 1, 5, 3, 2, 7],
        CDEFGHJL: [0, 4, 6, 1, 5, 3, 7, 2],
        CDEFGHKL: [0, 4, 2, 1, 5, 3, 7, 6],
        CDEFGIJK: [0, 4, 2, 1, 6, 3, 5, 7],
        CDEFGIJL: [0, 4, 2, 1, 6, 3, 7, 5],
        CDEFGIKL: [0, 4, 2, 1, 5, 3, 7, 6],
        CDEFGJKL: [0, 4, 2, 1, 5, 3, 7, 6],
        CDEFHIJK: [0, 6, 2, 1, 4, 3, 5, 7],
        CDEFHIJL: [0, 6, 2, 1, 4, 3, 7, 5],
        CDEFHIKL: [0, 2, 5, 1, 4, 3, 7, 6],
        CDEFHJKL: [0, 5, 2, 1, 4, 3, 7, 6],
        CDEFIJKL: [0, 5, 2, 1, 4, 3, 7, 6],
        CDEGHIJK: [2, 3, 6, 0, 4, 1, 5, 7],
        CDEGHIJL: [2, 3, 6, 0, 4, 1, 7, 5],
        CDEGHIKL: [2, 3, 5, 0, 4, 1, 7, 6],
        CDEGHJKL: [2, 3, 5, 0, 4, 1, 7, 6],
        CDEGIJKL: [2, 3, 4, 0, 5, 1, 7, 6],
        CDEHIJKL: [2, 5, 4, 0, 3, 1, 7, 6],
        CDFGHIJK: [0, 3, 6, 1, 4, 2, 5, 7],
        CDFGHIJL: [0, 3, 6, 1, 4, 2, 7, 5],
        CDFGHIKL: [0, 3, 5, 1, 4, 2, 7, 6],
        CDFGHJKL: [0, 3, 5, 1, 4, 2, 7, 6],
        CDFGIJKL: [0, 3, 4, 1, 5, 2, 7, 6],
        CDFHIJKL: [0, 5, 4, 1, 3, 2, 7, 6],
        CDGHIJKL: [3, 2, 4, 0, 5, 1, 7, 6],
        CEFGHIJK: [1, 3, 6, 0, 4, 2, 5, 7],
        CEFGHIJL: [1, 3, 6, 0, 4, 2, 7, 5],
        CEFGHIKL: [1, 3, 5, 0, 4, 2, 7, 6],
        CEFGHJKL: [1, 3, 5, 0, 4, 2, 7, 6],
        CEFGIJKL: [1, 3, 4, 0, 5, 2, 7, 6],
        CEFHIJKL: [1, 5, 4, 0, 3, 2, 7, 6],
        CEGHIJKL: [1, 5, 4, 0, 3, 2, 7, 6],
        CFGHIJKL: [3, 2, 4, 0, 5, 1, 7, 6],
        DEFGHIJK: [1, 3, 6, 0, 4, 2, 5, 7],
        DEFGHIJL: [1, 3, 6, 0, 4, 2, 7, 5],
        DEFGHIKL: [1, 3, 5, 0, 4, 2, 7, 6],
        DEFGHJKL: [1, 3, 5, 0, 4, 2, 7, 6],
        DEFGIJKL: [1, 3, 4, 0, 5, 2, 7, 6],
        DEFHIJKL: [1, 5, 4, 0, 3, 2, 7, 6],
        DEGHIJKL: [1, 5, 4, 0, 3, 2, 7, 6],
        DFGHIJKL: [3, 2, 4, 0, 5, 1, 7, 6],
        EFGHIJKL: [0, 5, 4, 1, 3, 2, 7, 6],
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 8, "roundOf32").sort(
        (a, b) => a.group.charCodeAt() - b.group.charCodeAt(),
      );
      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        "",
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];
      knockouts.push([
        getTeamFromStandings("E", 1),
        thirdPlacedTeams[scenarioIndices[3]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("I", 1),
        thirdPlacedTeams[scenarioIndices[5]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("B", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        getTeamFromStandings("C", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("K", 2),
        getTeamFromStandings("L", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("H", 1),
        getTeamFromStandings("J", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        thirdPlacedTeams[scenarioIndices[2]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("G", 1),
        thirdPlacedTeams[scenarioIndices[4]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        getTeamFromStandings("F", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("E", 2),
        getTeamFromStandings("I", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        thirdPlacedTeams[scenarioIndices[0]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("L", 1),
        thirdPlacedTeams[scenarioIndices[7]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("J", 1),
        getTeamFromStandings("H", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("D", 2),
        getTeamFromStandings("G", 2),
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        thirdPlacedTeams[scenarioIndices[1]].team,
      ]);
      knockouts.push([
        getTeamFromStandings("K", 1),
        thirdPlacedTeams[scenarioIndices[6]].team,
      ]);

      return knockouts;
    }
    case "CLA": {
      const finals = [];

      let finalsTeams = Object.keys(simStandings).reduce((acc, group) => {
        addStats(group, getTeamFromStandings(group, 3), "relegated");

        const finalQualifier = getTeamFromStandings(group, 1);
        addStats(group, finalQualifier, "finals");
        acc.push(finalQualifier);
        return acc;
      }, []);

      const removeTeam = (pot, team) => pot.filter((t) => t !== team);

      while (finalsTeams.length) {
        const team1 = drawTeam(finalsTeams);
        finalsTeams = removeTeam(finalsTeams, team1);

        const team2 = drawTeam(finalsTeams);
        finalsTeams = removeTeam(finalsTeams, team2);

        finals.push([team1, team2]);
      }

      return finals;
    }
    case "CLB": {
      Object.keys(simStandings).forEach((group) => {
        const addTeamResult = (rank, stat) => {
          addStats(group, getTeamFromStandings(group, rank), stat);
        };
        addTeamResult(1, "promoted");
        addTeamResult(4, "relegated");
      });
      break;
    }
    case "CLC": {
      Object.keys(simStandings).forEach((group) => {
        addStats(group, getTeamFromStandings(group, 1), "promoted");
      });
      break;
    }
    default:
      break;
  }
  return null;
};

const simulateMatch = ({ location, teams, isPenaltyShootout, fixtureIndex }) => {
  const [team1Rating, team2Rating] = teams.map((team) => {
    return simRatings[team].rating + (team === location ? 100 : 0);
  });

  const [favorite, underdog] =
    team1Rating >= team2Rating ? teams : [...teams].reverse();

  const ratingDifference = Math.abs(team1Rating - team2Rating);
  let result = simulateResult(ratingDifference);

  if (!isPenaltyShootout) {
    const margin = Math.abs(result);
    const lowerScore = getLowerScore(margin);
    const higherScore = margin + lowerScore;

    let favoriteGoals, underdogGoals;
    if (result < 0) {
      favoriteGoals = lowerScore;
      underdogGoals = higherScore;
    } else {
      favoriteGoals = higherScore;
      underdogGoals = lowerScore;
    }

    simResults.push({
      team1: favorite,
      team2: underdog,
      goalDifference: result,
      score1: favoriteGoals,
      score2: underdogGoals,
    });

    if (fixtureIndex !== undefined && fixtureScoreCounts) {
      const team1Goals = favorite === teams[0] ? favoriteGoals : underdogGoals;
      const team2Goals = favorite === teams[0] ? underdogGoals : favoriteGoals;
      const scoreKey = `${team1Goals}-${team2Goals}`;
      const marginKey = team1Goals - team2Goals;

      if (!fixtureScoreCounts[fixtureIndex].scores) {
        fixtureScoreCounts[fixtureIndex].scores = {};
        fixtureScoreCounts[fixtureIndex].margins = {};
      }
      fixtureScoreCounts[fixtureIndex].scores[scoreKey] =
        (fixtureScoreCounts[fixtureIndex].scores[scoreKey] || 0) + 1;
      fixtureScoreCounts[fixtureIndex].margins[marginKey] =
        (fixtureScoreCounts[fixtureIndex].margins[marginKey] || 0) + 1;
    }

    updateStandings(simStandings, favorite, favoriteGoals, underdogGoals);
    updateStandings(simStandings, underdog, underdogGoals, favoriteGoals);
  }

  if (isPenaltyShootout && !result) {
    // Extra time
    result = Math.round(simulateResult(ratingDifference * 0.4) / 2.5);
  }

  const goalDifference = Math.abs(result);
  let kAdj = 1;
  if (goalDifference === 2) {
    kAdj = 1.5;
  } else if (goalDifference >= 3) {
    kAdj = 1.75 + (goalDifference - 3) / 8;
  }
  const k = getWeight(tournament) * kAdj;

  let w = 0.5;
  let winner;
  if (result < 0) {
    w = 0;
    winner = underdog;
  } else if (result > 0) {
    w = 1;
    winner = favorite;
  }

  const we = 1 / (Math.pow(10, -ratingDifference / 400) + 1);

  const ratingChange = Math.round(k * (w - we));
  updateRating(favorite, ratingChange);
  updateRating(underdog, -ratingChange);

  if (isPenaltyShootout && !winner) {
    const penaltyShootoutResult = Math.random();
    const penaltyWe = 0.5 + (we - 0.5) / 4;
    winner = penaltyShootoutResult <= penaltyWe ? favorite : underdog;
  }

  return winner;
};

let locationsCountEC = 0;
const locationsEC = [
  "ES",
  "EN",
  "RO",
  "DK",
  "SQ",
  "EN",
  "HU",
  "NL",
  "DE",
  "RU",
  "IT",
  "AZ",
  "EN",
  "EN",
  "EN",
];

let locationsCountWC = 0;
const locationsWC = [
  "US",
  "US",
  "US",
  "MX",
  "CA",
  "US",
  "US",
  "US",
  "US",
  "US",
  "MX",
  "US",
  "US",
  "US",
  "CA",
  "US",
  "US",
  "US",
  "US",
  "US",
  "US",
  "MX",
  "US",
  "CA",
  "US",
  "US",
  "US",
  "US",
  "US",
  "US",
  "US",
];

let knockoutResults = [];

const findActualWinner = ([team1, team2]) => {
  const actualMatch = knockoutResults.find(
    (match) =>
      (match.team1 === team1 && match.team2 === team2) ||
      (match.team1 === team2 && match.team2 === team1),
  );
  if (actualMatch) {
    return actualMatch.goalDifference > 0
      ? actualMatch.team1
      : actualMatch.team2;
  }
  return null;
};

const simulateRound = (location, stat) => (acc, teams, idx) => {
  let matchLocation = location;
  if (tournament === "EC") {
    matchLocation = locationsEC[locationsCountEC % 15];
    locationsCountEC++;
  }
  if (tournament === "WC") {
    matchLocation = locationsWC[locationsCountWC++ % 31];
  }

  const winner =
    findActualWinner(teams) ||
    simulateMatch({
      location: matchLocation,
      teams,
      isPenaltyShootout: true,
    });

  if (stat) {
    addStats(null, winner, stat);
  }

  if (idx % 2 === 0) {
    acc.push([winner]);
  } else {
    const matchup = acc.pop();
    matchup.push(winner);
    acc.push(matchup);
  }

  return acc;
};

const simulateKnockouts = (knockouts, stats) => {
  let round = [...knockouts];
  const roundStats = [...stats];
  const location = locations[tournament];

  do {
    const roundStat = roundStats.shift();
    round = round.reduce(simulateRound(location, roundStat), []);
  } while (round.length > 1);

  round.reduce(simulateRound(location, roundStats[0]), []);
};

exports.runSimulation = async () => {
  ({ fixtures, nationsLeagueStandings, results, standings, teamRatings } =
    await init(tournament));

  knockoutResults = results.filter((match) =>
    match.date.isSameOrAfter(getKnockoutsStageDate(tournament)),
  );
  for (let i = 0; i < knockoutResults.length; i += 1) {
    const { date, team1, team2, goalDifference } = knockoutResults[i];
    if (!goalDifference) {
      let newGoalDifference;

      const searchBase = [
        ...fixtures,
        ...knockoutResults.map((match) => ({
          teams: [match.team1, match.team2],
          date: match.date,
        })),
      ].filter((fixture) => fixture.date.isAfter(date));

      const fixture1 = searchBase.find((fixture) =>
        fixture.teams.includes(team1),
      );
      const fixture2 = searchBase.find((fixture) =>
        fixture.teams.includes(team2),
      );

      if (!fixture1 !== !fixture2) {
        if (fixture1) {
          newGoalDifference = 1;
        } else {
          newGoalDifference = -1;
        }
      } else {
        const winner = await askQuestion(
          `Enter the winner:\n1) ${team1}\n2) ${team2}\n`,
        );
        switch (winner) {
          case "1":
            newGoalDifference = 1;
            break;
          case "2":
            newGoalDifference = -1;
            break;
          default:
            throw new Error("Invalid input");
        }
      }
      knockoutResults[i].goalDifference = newGoalDifference;
    }
  }

  stats = Object.entries(standings).reduce((acc, [team, { group }]) => {
    if (!acc[group]) {
      acc[group] = {};
    }
    acc[group][team] = {
      ...evaluatedStats[tournament],
    };
    return acc;
  }, {});

  groupFixtures = fixtures.filter(({ isKnockout }) => !isKnockout);
  if (calculateScoreBreakdowns) {
    fixtureScoreCounts = groupFixtures.map(() => ({}));
  } else {
    fixtureScoreCounts = undefined;
  }

  for (let sim = 0; sim < simulations; sim++) {
    simResults.splice(0);
    resetRatings();
    resetStandings();

    groupFixtures.forEach((fixture, index) => {
      simulateMatch({ ...fixture, fixtureIndex: index });
    });

    const playoffs = updateStats(tournament);

    switch (tournament) {
      case "EQ": {
        Object.values(playoffs).forEach(([team1, team2, team3, team4]) => {
          const winner1 = simulateMatch({
            location: team1,
            teams: [team1, team4],
            isPenaltyShootout: true,
          });

          const winner2 = simulateMatch({
            location: team2,
            teams: [team2, team3],
            isPenaltyShootout: true,
          });

          const finalHomeDraw = Math.random();
          const playoffFinal =
            finalHomeDraw <= 0.5 ? [winner1, winner2] : [winner2, winner1];

          const playoffWinner = simulateMatch({
            location: playoffFinal[0],
            teams: playoffFinal,
            isPenaltyShootout: true,
          });

          addStats(null, playoffWinner, "totalQualify", "qualifyFromPlayoffs");
        });
        break;
      }
      case "CA":
        simulateKnockouts(playoffs, ["semifinals", "final", "champions"]);
        break;
      case "AC":
      case "AR":
      case "EC":
        simulateKnockouts(playoffs, [
          "quarterfinals",
          "semifinals",
          "final",
          "champions",
        ]);
        break;
      case "WC":
        simulateKnockouts(playoffs, [
          "roundOf16",
          "quarterfinals",
          "semifinals",
          "final",
          "champions",
        ]);
        break;
      case "ARC":
      case "CCH":
        simulateKnockouts(playoffs, ["semifinals", "final", "champions"]);
        break;
      case "CLA":
        simulateKnockouts(playoffs, [null, "champions"]);
        break;
      default:
        break;
    }
  }

  printStats(); // TODO: output to ./data
};
