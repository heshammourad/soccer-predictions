const { simulations, tournament } = require("./configuration");
const { init } = require("./init");
const { getProbabilities, simulateResult } = require("./simulation");
const { updateStandings } = require("./utils");

let fixtures;
let nationsLeagueStandings;
let standings;
let teamRatings;

let simRatings;

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
  simStandings = Object.entries(standings[tournament]).reduce(
    (acc, [group, teams]) => {
      acc[group] = teams.map(team => ({
        points: 0,
        goalDifference: 0,
        ...team
      }));
      return acc;
    },
    {}
  );
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

const sortStandings = () => {
  Object.values(simStandings).forEach(teams => {
    teams.sort(sortFunction);
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
  }
};

const stats = Object.entries(standings[tournament]).reduce(
  (acc, [group, teams]) => {
    acc[group] = teams.reduce((teamAcc, { team }) => {
      teamAcc[team] = {
        ...evaluatedStats[tournament]
      };
      return teamAcc;
    }, {});
    return acc;
  },
  {}
);

const printStats = () => {
  const statPrint = Object.entries(stats).reduce((acc, [group, teams]) => {
    acc += `Group ${group}:\n`;
    acc += Object.entries(teams).reduce((tAcc, [team, totals]) => {
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
    return `${acc}\n`;
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

const rankStatNames = ["first", "second", "third"];

const getBestTeamsOfRank = (rank, teamCount, automaticStat) => {
  const rankIndex = rank - 1;
  return Object.entries(simStandings)
    .reduce((acc, [group, teams]) => {
      teams.forEach((team, index) => {
        const teamCode = team.team;
        const stat = rankStatNames[index];
        if (index < rankIndex) {
          addStats(group, teamCode, stat, automaticStat);
        } else if (index === rankIndex) {
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
};

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
      const drawTeam = pot => pot[Math.floor(Math.random() * pot.length)];

      const draws = Object.entries(paths).reduce(
        (acc, [league, { groupWinners, rest }], idx, src) => {
          const drawTeams = [...groupWinners];

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
      const thirdPlacedTeams = getBestTeamsOfRank(3, 2, "quarterfinals").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return bGroup - aGroup;
        }
      );

      thirdPlacedTeams.forEach(({ group, team }) => {
        addStats(group, team, "quarterfinals");
      });

      const knockouts = [];

      knockouts.push([getTeamFromStandings("A", 1), thirdPlacedTeams[0].team]);
      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("B", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("C", 2)
      ]);
      knockouts.push([getTeamFromStandings("C", 1), thirdPlacedTeams[1].team]);

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
    default:
      break;
  }
  return null;
};

const simulateMatch = ({ location, teams, isPenaltyShootout }) => {
  const [team1Rating, team2Rating] = teams.map(
    team => simRatings[team].rating + (team === location ? 100 : 0)
  );

  const [favorite, underdog] =
    team1Rating >= team2Rating ? teams : [...teams].reverse();

  const result = simulateResult(ratingDifference);

  if (!isPenaltyShootout) {
    updateStandings(simStandings, favorite, result);
    updateStandings(simStandings, underdog, -result);
  }

  let kAdj = 1;
  if (goalDifference === 2) {
    kAdj = 1.5;
  } else if (goalDifference >= 3) {
    kAdj = 1.75 + (goalDifference - 3) / 8;
  }
  const k = 40 * kAdj;

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
    winner = penaltyShootoutResult <= we ? favorite : underdog;
  }

  return winner;
};

const simulateRound = (location, stat) => (acc, teams, idx) => {
  const winner = simulateMatch({
    location,
    teams,
    isPenaltyShootout: true
  });

  addStats(null, winner, stat);

  if (idx % 2 === 0) {
    acc.push([winner]);
  } else {
    const matchup = acc.pop();
    matchup.push(winner);
    acc.push(matchup);
  }

  return acc;
};

const simulateKnockouts = (knockouts, stats, location) => {
  let round = [...knockouts];
  const roundStats = [...stats];

  do {
    const roundStat = roundStats.shift();
    round = round.reduce(simulateRound(location, roundStat), []);
  } while (round.length > 1);

  round.reduce(simulateRound(location, roundStats[0]), []);
};

exports.runSimulation = async () => {
  ({ fixtures, nationsLeagueStandings, standings, teamRatings } = await init());

  for (let sim = 0; sim < simulations; sim++) {
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
        simulateKnockouts(playoffs, ["semifinals", "final", "champions"], "BR");
        break;
      case "AR":
        simulateKnockouts(
          playoffs,
          ["quarterfinals", "semifinals", "final", "champions"],
          "EG"
        );
        break;
      case "CCH":
        simulateKnockouts(playoffs, ["semifinals", "final", "champions", "US"]);
        break;
      default:
        break;
    }
  }

  printStats();
};
