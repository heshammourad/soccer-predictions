const moment = require('moment');

const { lineBreak } = require('./configuration');
const {
  getKnockoutsStageDate,
  dataFiles,
  fetchData,
  readFile
} = require('./data');
const { updateStandings } = require('./utils');

const loadFixtures = async (tournamentCode) => {
  const fixturesData = await fetchData(
    `${dataFiles[tournamentCode]}fixtures`,
    `${tournamentCode}/fixtures`
  );

  const fixtures = fixturesData.split('\\n').reduce((acc, fixtureData) => {
    const fields = fixtureData.split('\\t');

    const fixtureTournament = fields[5];
    if (fixtureTournament === tournamentCode) {
      const fixtureDate = moment(fields.slice(0, 3).join('-'), 'YYYY-MM-DD');
      acc.push({
        teams: [fields[3], fields[4]],
        location: fields[6],
        date: fixtureDate,
        isKnockout: fixtureDate.isSameOrAfter(
          getKnockoutsStageDate(tournamentCode)
        )
      });
    }
    return acc;
  }, []);

  return fixtures;
};

const loadStandings = async (tournamentCode) => {
  const groups = JSON.parse(readFile(`${tournamentCode}/groups`));
  const standings = Object.entries(groups).reduce((acc, [group, teams]) => {
    const groupTeams = teams.reduce((tAcc, team) => {
      tAcc[team] = {
        goalsFor: 0,
        goalDifference: 0,
        group,
        points: 0
      };
      return tAcc;
    }, {});
    return { ...acc, ...groupTeams };
  }, {});

  const resultsData = await fetchData(
    `${dataFiles[tournamentCode]}latest`,
    `${tournamentCode}/results`
  );

  const results = resultsData.split('\\n').reduce((acc, line) => {
    const fields = line.split('\\t');

    const resultTournament = fields[7];
    if (resultTournament === tournamentCode) {
      const date = moment(fields.slice(0, 3).join(''), 'YYYY-MM-DD');
      const team1 = fields[3];
      const team2 = fields[4];
      const score1 = fields[5];
      const score2 = fields[6];

      const goalDifference = score1 - score2;

      if (date.isBefore(getKnockoutsStageDate(tournamentCode))) {
        updateStandings(standings, team1, score1, score2);
        updateStandings(standings, team2, score2, score1);
      }

      acc.push({ date, team1, team2, goalDifference });
    }
    return acc;
  }, []);

  return { results, standings };
};

const loadTeams = async () => {
  const ratings = await fetchData(dataFiles.ratings, dataFiles.teamRatings);

  const ratingsData = ratings.split('\\n');
  const teamRatings = ratingsData.reduce((acc, teamData) => {
    const teamDataFields = teamData.split('\\t');

    const code = teamDataFields[2];
    const rating = parseInt(teamDataFields[3], 10);

    acc[code] = rating;
    return acc;
  }, {});

  const teamsData = readFile(dataFiles.teamNames).toString().split(lineBreak);
  const teamNames = teamsData.reduce((acc, teamData) => {
    if (teamData) {
      const [code, name] = teamData.split(',');
      acc[code] = name;
    }
    return acc;
  }, {});

  return Object.entries(teamRatings).reduce((acc, [code, rating]) => {
    acc[code] = {
      name: teamNames[code],
      rating
    };
    return acc;
  }, {});
};

exports.init = async (tournamentCode) => {
  const [fixtures, { results, standings }, teamRatings] = await Promise.all([
    loadFixtures(tournamentCode),
    loadStandings(tournamentCode),
    loadTeams()
  ]);

  let nationsLeagueStandings;
  if (tournamentCode === 'EQ') {
    nationsLeagueStandings = JSON.parse(
      readFile(dataFiles.nationsLeagueStandings)
    );
  }

  return { fixtures, nationsLeagueStandings, results, standings, teamRatings };
};
