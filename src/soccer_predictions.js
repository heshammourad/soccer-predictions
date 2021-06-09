const groupBy = require("lodash.groupby");

const { simulations, tournament } = require("./configuration");
const { getKnockoutsStageDate } = require('./data');
const { init } = require("./init");
const { getWeight, simulateResult } = require("./simulation");
const { updateStandings } = require("./utils");

const locations = {
  AR: "EG",
  CA: "BR",
  CCH: "US",
  CLA: "XX",
  EC: "EN",
  WC: "RU"
};

let fixtures;
let nationsLeagueStandings;
let results;
let standings;
let teamRatings;

let simRatings;

const findResults = teams => {
  const result = results.find(({ date, team1, team2 }) => 
    teams.includes(team1) && teams.includes(team2) && date.isAfterOrEqual(getKnockoutsStageDate(tournament))
  );
  if (result) {
    return goalDifference;
  }
  return null;
}

const resetRatings = () => {
  simRatings = Object.entries(teamRatings).reduce((acc, [team, info]) => {
    acc[team] = {
      ...info
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
    []
  );

const getTeamRank = team => getNationsLeagueRank().findIndex(t => t === team);

let simStandings;

const resetStandings = () => {
  simStandings = Object.entries(standings).reduce((acc, [team, teamInfo]) => {
    acc[team] = {
      ...teamInfo
    };
    return acc;
  }, {});
};

const sortFunction = (a, b) => {
  if (a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  return Math.random() - 0.5;
};

const convertStandingsToArray = standingsToConvert => {
  const standingsArray = Object.entries(standingsToConvert).reduce(
    (acc, [team, { group, ...values }]) => {
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push({
        team,
        ...values});
      return acc;
    },
    {}
  );
  return standingsArray;
};

const arTiebreaker = (teams, criteria, tiedTeamCount) => {
  const goalDifferenceKeySort = (a, b) => {
    const aKey = parseInt(a[0], 10);
    const bKey = parseInt(b[0], 10);

    return bKey - aKey;
  };

  switch (criteria) {
    case "points": {
      const ranks = groupBy(teams, criteria);

      return Object.values(ranks).reduceRight((acc, rankTeams) => {
        if (rankTeams.length === 1) {
          acc.push(rankTeams[0]);
        } else {
          const tiebreakStandings = rankTeams.reduce((tAcc, { team }) => {
            tAcc[team] = {
              goalDifference: 0,
              group: "tiebreaker",
              points: 0
            };
            return tAcc;
          }, {});

          const isTeamInTiebreaker = team =>
            Object.keys(tiebreakStandings).find(
              tiebreakTeam => tiebreakTeam === team
            );

          const allResults = [...results, ...simResults];
          allResults.forEach(({ team1, team2, goalDifference }) => {
            if (isTeamInTiebreaker(team1) && isTeamInTiebreaker(team2)) {
              updateStandings(tiebreakStandings, team1, goalDifference);
              updateStandings(tiebreakStandings, team2, goalDifference);
            }
          });

          const tiebreakTeams = convertStandingsToArray(
            tiebreakStandings
          ).tiebreaker.map(tiebreakTeam => {
            console.log("rankTeams", rankTeams);
            console.log("tiebreakTeam", tiebreakTeam);
            const { goalDifference, points } = rankTeams.find(
              rankTeam => rankTeam.team === tiebreakTeam.team
            );
            return {
              ...tiebreakTeam,
              overallPoints: points,
              overallGoalDifference: goalDifference
            };
          });

          acc.push(...arTiebreaker(tiebreakTeams, "h2hPoints"));
        }

        return acc;
      }, []);
    }
    case "h2hPoints": {
      const ranks = groupBy(teams, "points");

      return Object.values(ranks).reduceRight((acc, rankTeams) => {
        if (rankTeams.length === 1) {
          acc.push(rankTeams[0]);
        } else {
          acc.push(...arTiebreaker(rankTeams, "h2hGoalDifference"));
        }

        return acc;
      }, []);
    }
    case "h2hGoalDifference": {
      const ranks = Object.entries(groupBy(teams, "goalDifference")).sort(
        goalDifferenceKeySort
      );

      return Object.values(ranks).reduce((acc, rankTeams) => {
        if (rankTeams.length === 1) {
          acc.push(rankTeams[0]);
        } else if (rankTeams.length === tiedTeamCount) {
          acc.push(...arTiebreaker(rankTeams, "overallGoalDifference"));
        } else {
          acc.push(...arTiebreaker(rankTeams, "points"));
        }
      }, []);
    }
    case "overallGoalDifference": {
      const ranks = Object.entries(groupBy(teams, criteria)).sort(
        goalDifferenceKeySort
      );

      return Object.values(ranks).reduce((acc, rankTeams) => {
        if (rankTeams.length === 1) {
          acc.push(rankTeams[0]);
        } else {
          acc.push(...arTiebreaker(rankTeams));
        }
      }, []);
    }
    default: {
      const drawnTeams = [];
      const getPot = () => teams.filter(team => !drawnTeams.includes(team));

      let pot = getPot();

      while (pot.length) {
        const drawnTeam = drawTeam(pot);

        drawnTeams.push(drawnTeam);
        pot = getPot();
      }

      return drawnTeams;
    }
  }
};

const sortStandings = () => {
  simStandings = convertStandingsToArray(simStandings);

  Object.values(simStandings).forEach(teams => {
    teams.sort(sortFunction);
    if (tournament === "AR") {
      // teams = arTiebreaker(teams, "points");
    }
  });
};

const getTeamFromStandings = (group, rank) =>
  simStandings[group][rank - 1].team;

const printStandings = () => {
  Object.entries(simStandings).forEach(([group, teams]) => {
    console.log(`Group ${group}:\n`);

    teams.forEach(({ team, points, goalDifference }) => {
      console.log(team, "\t", goalDifference, "\t", points);
    });

    console.log();
  });
};

const evaluatedStats = {
  EQ: {
    qualifyFromGroup: 0,
    qualifyToPlayoffs: 0,
    qualifyFromPlayoffs: 0
  },
  CA: {
    first: 0,
    second: 0,
    third: 0,
    fourth: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  },
  AR: {
    first: 0,
    second: 0,
    third: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  },
  CCH: {
    first: 0,
    second: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  },
  CLA: {
    finals: 0,
    champions: 0,
    relegated: 0
  },
  CLB: {
    promoted: 0,
    relegated: 0
  },
  CLC: {
    promoted: 0
  },
  EC: {
    first: 0,
    second: 0,
    third: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  },
  WC: {
    first: 0,
    second: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  }
};

const sortStats = t => ([teamA, totalsA], [teamB, totalsB]) => {
  const order = [];

  switch (t) {
    case "EQ": {
      const getTotalQualify = team =>
        team.qualifyFromGroup + team.qualifyFromPlayoffs;

      const aTotal = getTotalQualify(totalsA);
      const bTotal = getTotalQualify(totalsB);
      if (aTotal !== bTotal) {
        return bTotal - aTotal;
      }

      order.push(
        "qualifyFromGroup",
        "qualifyFromPlayoffs",
        "qualifyToPlayoffs"
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
        "fourth"
      );
      break;
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
        "third"
      );
      break;
    case "CCH":
      order.push(
        "champions",
        "final",
        "semifinals",
        "quarterfinals",
        "first",
        "second"
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

const printStats = () => {
  const statPrint = Object.entries(stats).reduce((acc, [group, teams]) => {
    acc += `Group ${group}:\n`;

    acc += Object.entries(teams)
      .sort(sortStats(tournament))
      .reduce((tAcc, [team, totals]) => {
        const [c, { name }] = Object.entries(teamRatings).find(
          ([code]) => code === team
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
};

const addStat = (team, ...statList) => {
  statList.forEach(stat => {
    team[stat]++;
  });
};

const addStats = (group, team, ...statList) => {
  if (group) {
    addStat(stats[group][team], ...statList);
  } else {
    const group = Object.values(stats).find(group =>
      Object.keys(group).includes(team)
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
            group
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

const drawTeam = pot => pot[Math.floor(Math.random() * pot.length)];

const updateStats = stage => {
  sortStandings();

  switch (stage) {
    case "EQ": {
      const qualifiedTeams = [];

      Object.entries(simStandings).forEach(([group, [qual1, qual2]]) => {
        const stat = "qualifyFromGroup";

        const q1 = qual1.team;
        const q2 = qual2.team;

        addStats(group, q1, stat);
        addStats(group, q2, stat);

        qualifiedTeams.push(q1, q2);
      });

      const playoffTeams = [];

      const isQualified = team =>
        qualifiedTeams.includes(team) || playoffTeams.includes(team);

      const addTeamsToLeague = (obj, league, teams) => {
        const leagueTeams = obj[league];

        obj[league] = {
          ...leagueTeams,
          rest: [...leagueTeams.rest, ...teams]
        };
      };

      const paths = Object.entries(nationsLeagueStandings).reduce(
        (acc, [league, { groupWinners, rest }], idx, src) => {
          const selectedGroupWinners = groupWinners.filter(
            gw => !isQualified(gw)
          );

          const groupWinnerCount = selectedGroupWinners.length;

          const selectedLeagueTeams = rest.reduce((tAcc, team) => {
            if (tAcc.length + groupWinnerCount === 4 || isQualified(team)) {
              return tAcc;
            }

            tAcc.push(team);
            return tAcc;
          }, []);

          playoffTeams.push(...selectedGroupWinners, ...selectedLeagueTeams);

          let teamsLeftToPick =
            4 - (groupWinnerCount + selectedLeagueTeams.length);

          if (groupWinnerCount && teamsLeftToPick) {
            for (let i = idx - 1; i >= 0; i--) {
              const [league, { rest }] = src[i];

              const selectedRemainingTeams = rest
                .filter(team => !isQualified(team))
                .slice(0, teamsLeftToPick);

              addTeamsToLeague(acc, league, selectedRemainingTeams);
              playoffTeams.push(...selectedRemainingTeams);

              teamsLeftToPick -= selectedRemainingTeams.length;
              if (!teamsLeftToPick) {
                break;
              }
            }
          }

          acc[league] = {
            groupWinners: selectedGroupWinners,
            rest: selectedLeagueTeams
          };
          return acc;
        },
        {}
      );

      let teamsLeftToPick = 16 - playoffTeams.length;

      if (teamsLeftToPick) {
        for (let [league, { rest }] of [
          ...Object.entries(nationsLeagueStandings)
        ].reverse()) {
          const selectedRemainingTeams = rest
            .filter(team => !isQualified(team))
            .slice(0, teamsLeftToPick);

          addTeamsToLeague(paths, league, selectedRemainingTeams);
          playoffTeams.push(...selectedRemainingTeams);

          teamsLeftToPick -= selectedRemainingTeams.length;
          if (!teamsLeftToPick) {
            break;
          }
        }
      }

      Object.values(paths).forEach(({ groupWinners, rest }) => {
        const teams = [...groupWinners, ...rest];
        teams.forEach(team => {
          addStats(null, team, "qualifyToPlayoffs");
        });
      });

      const selectedTeams = [];

      const getPot = teams =>
        teams.filter(team => !selectedTeams.includes(team));

      const draws = Object.entries(paths).reduce(
        (acc, [league, { groupWinners, rest }], idx, src) => {
          if (acc[league]) {
            return acc;
          }

          const drawTeams = [...groupWinners];

          if (!drawTeams.length) {
            const teamsAvailable = src.reduce(
              (tAcc, cur, tIdx) => {
                const r = getPot(cur[1].rest);
                if (tIdx > idx) {
                  tAcc[1].push(...getPot(cur[1].groupWinners), ...r);
                } else {
                  tAcc[0].push(...r);
                }
                return tAcc;
              },
              [[], []]
            );

            if (teamsAvailable[0].length < 4) {
              const allTeams = [].concat(...teamsAvailable).sort(sortFunction);
              const draw1 = [];
              const draw2 = [];

              while (allTeams.length) {
                const pot = allTeams.splice(0, 2);
                if (Math.random() > 0.5) {
                  pot.reverse();
                }
                draw1.push(pot.pop());
                draw2.push(pot.pop());
              }

              acc[league] = draw1;
              acc[src[idx + 1][0]] = draw2;
              return acc;
            }
          }

          const teamsLeftToDraw = () => 4 - drawTeams.length;
          if (teamsLeftToDraw) {
            let pot = getPot(rest);
            const potTeamCount = pot.length;
            if (teamsLeftToDraw() >= potTeamCount) {
              drawTeams.push(...pot);
              selectedTeams.push(...pot);
            } else {
              while (teamsLeftToDraw()) {
                const draw = drawTeam(pot);

                drawTeams.push(draw);
                selectedTeams.push(draw);

                pot = getPot(pot);
              }
            }
          }

          for (let i = idx - 1; teamsLeftToDraw() && i >= 0; i--) {
            const teams = src[i][1].rest;
            let pot = getPot(teams);

            while (teamsLeftToDraw() && pot.length) {
              const draw = drawTeam(pot);

              drawTeams.push(draw);
              selectedTeams.push(draw);
              pot = getPot(teams);
            }
          }

          drawTeams.sort((a, b) => {
            const aIndex = getTeamRank(a);
            const bIndex = getTeamRank(b);

            return aIndex - bIndex;
          });

          acc[league] = drawTeams;

          return acc;
        },
        {}
      );

      return draws;
    }
    case "CA": {
      getBestTeamsOfRank(5, 0, "quarterfinals");
      
      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("B", 4)
      ]);
      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("B", 3)
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("A", 4)
      ]);
      knockouts.push([
        getTeamFromStandings("B", 2),
        getTeamFromStandings("A", 3)
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
        }
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        ""
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
        CDEF: [0, 1, 3, 2]
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, "roundOf16").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        }
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        ""
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("C", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        thirdPlacedTeams[scenarioIndices[3]].team
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        thirdPlacedTeams[scenarioIndices[1]].team
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        getTeamFromStandings("E", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("E", 1),
        getTeamFromStandings("D", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        thirdPlacedTeams[scenarioIndices[2]].team
      ]);
      knockouts.push([
        getTeamFromStandings("B", 2),
        getTeamFromStandings("F", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        thirdPlacedTeams[scenarioIndices[0]].team
      ]);

      return knockouts;
    }
    case "CCH": {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, "quarterfinals");

      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("A", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("B", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        getTeamFromStandings("D", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        getTeamFromStandings("C", 2)
      ]);

      return knockouts;
    }
    case "WC": {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, "roundOf16");

      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("B", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        getTeamFromStandings("D", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("E", 1),
        getTeamFromStandings("F", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("G", 1),
        getTeamFromStandings("H", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("A", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        getTeamFromStandings("C", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        getTeamFromStandings("E", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("H", 1),
        getTeamFromStandings("G", 2)
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

      const removeTeam = (pot, team) => pot.filter(t => t !== team);

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
      Object.keys(simStandings).forEach(group => {
        const addTeamResult = (rank, stat) => {
          addStats(group, getTeamFromStandings(group, rank), stat);
        };
        addTeamResult(1, "promoted");
        addTeamResult(4, "relegated");
      });
    }
    case "CLC": {
      Object.keys(simStandings).forEach(group => {
        addStats(group, getTeamFromStandings(group, 1), "promoted");
      });
    }
    default:
      break;
  }
  return null;
};

const simResults = [];

const simulateMatch = ({ location, teams, isPenaltyShootout }) => {
  const [team1Rating, team2Rating] = teams.map(
    team => simRatings[team].rating + (team === location ? 100 : 0)
  );

  const [favorite, underdog] =
    team1Rating >= team2Rating ? teams : [...teams].reverse();

  const ratingDifference = Math.abs(team1Rating - team2Rating);
  let result = simulateResult(ratingDifference);

  if (!isPenaltyShootout) {
    simResults.push({
      team1: favorite,
      team2: underdog,
      goalDifference: result
    });
    updateStandings(simStandings, favorite, result);
    updateStandings(simStandings, underdog, -result);
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
const locationsEC = ["ES", "EN", "RO", "DK", "SQ", "EN", "HU", "NL", "DE", "RU", "IT", "AZ", "EN", "EN", "EN"];

const simulateRound = (location, stat) => (acc, teams, idx) => {
  const winner = simulateMatch({
    location: locationsEC[locationsCountEC % 15],
    teams,
    isPenaltyShootout: true
  });
  locationsCountEC++;

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
  ({
    fixtures,
    nationsLeagueStandings,
    results,
    standings,
    teamRatings
  } = await init(tournament));

  stats = Object.entries(standings).reduce((acc, [team, { group }]) => {
    if (!acc[group]) {
      acc[group] = {};
    }
    acc[group][team] = {
      ...evaluatedStats[tournament]
    };
    return acc;
  }, {});

  for (let sim = 0; sim < simulations; sim++) {
    simResults.splice(0);
    resetRatings();
    resetStandings();

    fixtures.forEach(fixture => {
      simulateMatch({ ...fixture });
    });

    const playoffs = updateStats(tournament);

    switch (tournament) {
      case "EQ": {
        Object.values(playoffs).forEach(([team1, team2, team3, team4]) => {
          const winner1 = simulateMatch({
            location: team1,
            teams: [team1, team4],
            isPenaltyShootout: true
          });

          const winner2 = simulateMatch({
            location: team2,
            teams: [team2, team3],
            isPenaltyShootout: true
          });

          const finalHomeDraw = Math.random();
          const playoffFinal =
            finalHomeDraw <= 0.5 ? [winner1, winner2] : [winner2, winner1];

          const playoffWinner = simulateMatch({
            location: playoffFinal[0],
            teams: playoffFinal,
            isPenaltyShootout: true
          });

          addStats(null, playoffWinner, "qualifyFromPlayoffs");
        });
        break;
      }
      case "CA":
        simulateKnockouts(playoffs, ["semifinals", "final", "champions"]);
        break;
      case "AR":
      case "EC":
      case "WC":
        simulateKnockouts(playoffs, [
          "quarterfinals",
          "semifinals",
          "final",
          "champions"
        ]);
        break;
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
