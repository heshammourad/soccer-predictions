const partition = require('lodash.partition');
const sampleSize = require('lodash.samplesize');
const { simulations, tournament } = require('./configuration');
const { getKnockoutsStageDate } = require('./data');
const { init } = require('./init');
const { getLowerScore, getWeight, simulateResult } = require('./simulation');
const { askQuestion, updateStandings } = require('./utils');

const locations = {
  AR: 'EG',
  ARC: 'QA',
  CA: 'BR',
  CCH: 'US',
  CLA: 'XX',
  EC: 'EN',
  WC: 'QA'
};

let fixtures;
let nationsLeagueStandings;
let results;
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

const getTeamRank = (team) =>
  getNationsLeagueRank().findIndex((t) => t === team);

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
  // HARD-CODED FOR EC2021
  if (a.team === 'DE' && b.team === 'PT') {
    return -1;
  } else if (a.team === 'PT' && b.team === 'DE') {
    return 1;
  }

  if (a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  if (a.goalsFor !== b.goalsFor) {
    return b.goalsFor - a.goalsFor;
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
        ...values
      });
      return acc;
    },
    {}
  );
  return standingsArray;
};

const sortStandings = () => {
  simStandings = convertStandingsToArray(simStandings);

  Object.values(simStandings).forEach((teams) => {
    teams.sort(sortFunction);
  });
};

const getTeamFromStandings = (group, rank) =>
  simStandings[group][rank - 1].team;

const evaluatedStats = {
  EQ: {
    totalQualify: 0,
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
  ARC: {
    first: 0,
    second: 0,
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

const sortStats = (t) => ([teamA, totalsA], [teamB, totalsB]) => {
  const order = [];

  switch (t) {
    case 'EQ': {
      order.push(
        'totalQualify',
        'qualifyFromGroup',
        'qualifyFromPlayoffs',
        'qualifyToPlayoffs'
      );
      break;
    }
    case 'CA':
      order.push(
        'champions',
        'final',
        'semifinals',
        'quarterfinals',
        'first',
        'second',
        'third',
        'fourth'
      );
      break;
    case 'AR':
    case 'EC':
      order.push(
        'champions',
        'final',
        'semifinals',
        'quarterfinals',
        'roundOf16',
        'first',
        'second',
        'third'
      );
      break;
    case 'ARC':
    case 'CCH':
      order.push(
        'champions',
        'final',
        'semifinals',
        'quarterfinals',
        'first',
        'second'
      );
      break;
    case 'CLA':
      order.push('champions', 'finals', '!relegated');
      break;
    case 'CLB':
      order.push('promoted', '!relegated');
      break;
    case 'CLC':
      order.push('promoted');
      break;
    case 'WC':
      order.push('champions', 'final', 'semifinals', 'quaterfinals', 'roundOf16', 'first', 'second');
    default:
      break;
  }

  for (let stat of order) {
    if (stat.startsWith('!')) {
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
        const [, { name }] = Object.entries(teamRatings).find(
          ([code]) => code === team
        );
        tAcc += `${name}`;

        const valuePrint = Object.values(totals).reduce((vAcc, total) => {
          const percentage = Math.round((total / simulations) * 100);
          vAcc += `,${percentage}%`;

          return vAcc;
        }, '');

        tAcc += `${valuePrint}\n`;

        return tAcc;
      }, '');
    return `${acc}`;
  }, '');

  console.log(statPrint);
};

const addStat = (team, ...statList) => {
  statList.forEach((stat) => {
    team[stat]++;
  });
};

const addStats = (group, team, ...statList) => {
  if (group) {
    addStat(stats[group][team], ...statList);
  } else {
    const group = Object.values(stats).find((group) =>
      Object.keys(group).includes(team)
    );
    addStat(group[team], ...statList);
  }
};

const rankStatNames = ['first', 'second', 'third', 'fourth'];

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

const drawTeam = (pot) => pot[Math.floor(Math.random() * pot.length)];

const updateStats = (stage) => {
  sortStandings();

  switch (stage) {
    case 'ARC': {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, 'quarterfinals');

      knockouts.push([
        getTeamFromStandings('B', 1),
        getTeamFromStandings('A', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('D', 1),
        getTeamFromStandings('C', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('A', 1),
        getTeamFromStandings('B', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('C', 1),
        getTeamFromStandings('D', 2)
      ]);

      return knockouts;
    }
    case 'EQ': {
      const qualifiedTeams = [];

      Object.entries(simStandings).forEach(([group, [qual1, qual2]]) => {
        const stats = ['totalQualify', 'qualifyFromGroup'];

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
          rest: [...leagueTeams.rest, ...teams]
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
        for (let i = 0; i < rest.length && selectedTeamsFromLeague.teams.length < 4; i += 1) {
          const team = rest[i];
          if (isQualified(team)) {
            continue;
          }
          playoffTeams.push(team);
          selectedTeamsFromLeague.teams.push(team);
        }
      });

      const bestGroupWinnerD = nationsLeagueStandings.D.groupWinners[0];
      const transitionLetter = (letter, increment = true) => String.fromCharCode(letter.charCodeAt(0) + (increment ? 1 : -1));
      leagues.forEach((league) => {
        const { groupWinnerSelected, teams } = selectedTeamsFromLeagues[league];
        let teamsToSelect = 4 - teams.length;
        while (teamsToSelect > 0) {
          if (!isQualified(bestGroupWinnerD)) {
            playoffTeams.push(bestGroupWinnerD);
            selectedTeamsFromLeagues.D = { teams: [bestGroupWinnerD] };
            teamsToSelect--;
          }
          for (let group = groupWinnerSelected ? transitionLetter(league) : 'A'; group <= 'D'; group = transitionLetter(group)) {
            const availableTeams = nationsLeagueStandings[group].rest.filter((team) => !isQualified(team));
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
        addStats(null, team, 'qualifyToPlayoffs');
      });

      const drawnTeams = [];
      const draws = leagues.reduce((acc, cur) => {
        const { teams } = selectedTeamsFromLeagues[cur];
        if (teams.length === 4) {
          acc[cur] = teams;
          drawnTeams.push(...teams);
        } else if (teams.length > 4) {
          const pathTeams = [];
          if (Object.keys(selectedTeamsFromLeagues).some((league) => league < cur && selectedTeamsFromLeagues[league].teams.length)) {
            const [groupWinners, rest] = partition(teams, (team) => nationsLeagueStandings[cur].groupWinners.includes(team));
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
          const findLeague = (team) => Object.keys(selectedTeamsFromLeagues).find((league) => selectedTeamsFromLeagues[league].teams.includes(team));
          const pathTeams = playoffTeams.filter((team) => !drawnTeams.includes(team));
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
    case 'CA': {
      getBestTeamsOfRank(5, 0, 'quarterfinals');

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings('A', 1),
        getTeamFromStandings('B', 4)
      ]);
      knockouts.push([
        getTeamFromStandings('A', 2),
        getTeamFromStandings('B', 3)
      ]);
      knockouts.push([
        getTeamFromStandings('B', 1),
        getTeamFromStandings('A', 4)
      ]);
      knockouts.push([
        getTeamFromStandings('B', 2),
        getTeamFromStandings('A', 3)
      ]);

      return knockouts;
    }
    case 'EC': {
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
        CDEF: [3, 2, 1, 0]
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, 'roundOf16').sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        }
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        ''
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings('B', 1),
        thirdPlacedTeams[scenarioIndices[0]].team
      ]);
      knockouts.push([
        getTeamFromStandings('A', 1),
        getTeamFromStandings('C', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('F', 1),
        thirdPlacedTeams[scenarioIndices[3]].team
      ]);
      knockouts.push([
        getTeamFromStandings('D', 2),
        getTeamFromStandings('E', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('E', 1),
        thirdPlacedTeams[scenarioIndices[2]].team
      ]);
      knockouts.push([
        getTeamFromStandings('D', 1),
        getTeamFromStandings('F', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('C', 1),
        thirdPlacedTeams[scenarioIndices[1]].team
      ]);
      knockouts.push([
        getTeamFromStandings('A', 2),
        getTeamFromStandings('B', 2)
      ]);

      return knockouts;
    }
    case 'AR': {
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

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, 'roundOf16').sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        }
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, { group }) => acc + group,
        ''
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings('A', 2),
        getTeamFromStandings('C', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('D', 1),
        thirdPlacedTeams[scenarioIndices[3]].team
      ]);
      knockouts.push([
        getTeamFromStandings('B', 1),
        thirdPlacedTeams[scenarioIndices[1]].team
      ]);
      knockouts.push([
        getTeamFromStandings('F', 1),
        getTeamFromStandings('E', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('E', 1),
        getTeamFromStandings('D', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('C', 1),
        thirdPlacedTeams[scenarioIndices[2]].team
      ]);
      knockouts.push([
        getTeamFromStandings('B', 2),
        getTeamFromStandings('F', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('A', 1),
        thirdPlacedTeams[scenarioIndices[0]].team
      ]);

      return knockouts;
    }
    case 'CCH': {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, 'quarterfinals');

      knockouts.push([
        getTeamFromStandings('D', 1),
        getTeamFromStandings('A', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('B', 1),
        getTeamFromStandings('C', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('A', 1),
        getTeamFromStandings('D', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('C', 1),
        getTeamFromStandings('B', 2)
      ]);

      return knockouts;
    }
    case 'WC': {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, 'roundOf16');

      knockouts.push([
        getTeamFromStandings('A', 1),
        getTeamFromStandings('B', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('C', 1),
        getTeamFromStandings('D', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('E', 1),
        getTeamFromStandings('F', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('G', 1),
        getTeamFromStandings('H', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('B', 1),
        getTeamFromStandings('A', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('D', 1),
        getTeamFromStandings('C', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('F', 1),
        getTeamFromStandings('E', 2)
      ]);
      knockouts.push([
        getTeamFromStandings('H', 1),
        getTeamFromStandings('G', 2)
      ]);

      return knockouts;
    }
    case 'CLA': {
      const finals = [];

      let finalsTeams = Object.keys(simStandings).reduce((acc, group) => {
        addStats(group, getTeamFromStandings(group, 3), 'relegated');

        const finalQualifier = getTeamFromStandings(group, 1);
        addStats(group, finalQualifier, 'finals');
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
    case 'CLB': {
      Object.keys(simStandings).forEach((group) => {
        const addTeamResult = (rank, stat) => {
          addStats(group, getTeamFromStandings(group, rank), stat);
        };
        addTeamResult(1, 'promoted');
        addTeamResult(4, 'relegated');
      });
      break;
    }
    case 'CLC': {
      Object.keys(simStandings).forEach((group) => {
        addStats(group, getTeamFromStandings(group, 1), 'promoted');
      });
      break;
    }
    default:
      break;
  }
  return null;
};

const simResults = [];

const simulateMatch = ({ location, teams, isPenaltyShootout }) => {
  const [team1Rating, team2Rating] = teams.map(
    (team) => simRatings[team].rating + (team === location ? 100 : 0)
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
  'ES',
  'EN',
  'RO',
  'DK',
  'SQ',
  'EN',
  'HU',
  'NL',
  'DE',
  'RU',
  'IT',
  'AZ',
  'EN',
  'EN',
  'EN'
];

let knockoutResults = [];

const findActualWinner = ([team1, team2]) => {
  const actualMatch = knockoutResults.find(
    (match) =>
      (match.team1 === team1 && match.team2 === team2) ||
      (match.team1 === team2 && match.team2 === team1)
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
  if (tournament === 'EC') {
    matchLocation = locationsEC[locationsCountEC % 15];
    locationsCountEC++;
  }

  const winner =
    findActualWinner(teams) ||
    simulateMatch({
      location: matchLocation,
      teams,
      isPenaltyShootout: true
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
  ({
    fixtures,
    nationsLeagueStandings,
    results,
    standings,
    teamRatings
  } = await init(tournament));

  // knockoutResults = results.filter((match) =>
  //   match.date.isSameOrAfter(getKnockoutsStageDate(tournament))
  // );
  for (let i = 0; i < knockoutResults.length; i += 1) {
    const { date, team1, team2, goalDifference } = knockoutResults[i];
    if (!goalDifference) {
      let newGoalDifference;

      const searchBase = [
        ...fixtures,
        ...knockoutResults.map((match) => ({
          teams: [match.team1, match.team2],
          date: match.date
        }))
      ].filter((fixture) => fixture.date.isAfter(date));

      const fixture1 = searchBase.find((fixture) =>
        fixture.teams.includes(team1)
      );
      const fixture2 = searchBase.find((fixture) =>
        fixture.teams.includes(team2)
      );

      if (!fixture1 !== !fixture2) {
        if (fixture1) {
          newGoalDifference = 1;
        } else {
          newGoalDifference = -1;
        }
      } else {
        const winner = await askQuestion(
          `Enter the winner:\n1) ${team1}\n2) ${team2}\n`
        );
        switch (winner) {
          case '1':
            newGoalDifference = 1;
            break;
          case '2':
            newGoalDifference = -1;
            break;
          default:
            throw new Error('Invalid input');
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
      ...evaluatedStats[tournament]
    };
    return acc;
  }, {});

  for (let sim = 0; sim < simulations; sim++) {
    simResults.splice(0);
    resetRatings();
    resetStandings();

    fixtures
      .filter(({ isKnockout }) => !isKnockout)
      .forEach((fixture) => {
        simulateMatch({ ...fixture });
      });

    const playoffs = updateStats(tournament);

    switch (tournament) {
      case 'EQ': {
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

          addStats(null, playoffWinner, 'totalQualify', 'qualifyFromPlayoffs');
        });
        break;
      }
      case 'CA':
        simulateKnockouts(playoffs, ['semifinals', 'final', 'champions']);
        break;
      case 'AR':
      case 'EC':
      case 'WC':
        simulateKnockouts(playoffs, [
          'quarterfinals',
          'semifinals',
          'final',
          'champions'
        ]);
        break;
      case 'ARC':
      case 'CCH':
        simulateKnockouts(playoffs, ['semifinals', 'final', 'champions']);
        break;
      case 'CLA':
        simulateKnockouts(playoffs, [null, 'champions']);
        break;
      default:
        break;
    }
  }

  printStats(); // TODO: output to ./data
};
