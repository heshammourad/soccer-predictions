const { lineBreak } = require("./configuration");
const { dataFiles, fetchData, readFile, writeFile } = require("./data");
const { isFileCacheExpired, updateStandings } = require("./utils");

const loadFixtures = async tournamentCode => {
  const fixturesFile = `${tournamentCode}/fixtures`;
  if (!isFileCacheExpired(fixturesFile)) {
    return JSON.parse(readFile(fixturesFile));
  }

  const fixturesData = await fetchData(`${dataFiles[tournamentCode]}fixtures`);
  const fixtures = fixturesData.split("\n").reduce((acc, fixtureData) => {
    const fields = fixtureData.split("\t");

    const fixtureTournament = fields[5];
    if (fixtureTournament === tournamentCode) {
      acc.push({
        teams: [fields[3], fields[4]],
        location: fields[6]
      });
    }
    return acc;
  }, []);

  writeFile(fixturesFile, fixtures);

  return fixtures;
};

const loadStandings = async tournamentCode => {
  const standingsFile = `${tournamentCode}/standings`;
  if (!isFileCacheExpired(standingsFile)) {
    return JSON.parse(readFile(standingsFile));
  }

  const groups = JSON.parse(readFile(`${tournamentCode}/groups`));
  const standings = Object.entries(groups).reduce((acc, [group, teams]) => {
    const groupTeams = teams.reduce((tAcc, team) => {
      tAcc[team] = {
        goalDifference: 0,
        group,
        points: 0
      };
      return tAcc;
    }, {});
    return { ...acc, ...groupTeams };
  }, {});

  const resultsData = await fetchData(`${dataFiles[tournamentCode]}latest`);
  resultsData.split("\n").forEach(line => {
    const fields = line.split("\t");

    const resultTournament = fields[7];
    if (resultTournament === tournamentCode) {
      const team1 = fields[3];
      const team2 = fields[4];
      const score1 = fields[5];
      const score2 = fields[6];

      const goalDifference = score1 - score2;

      updateStandings(standings, team1, goalDifference);
      updateStandings(standings, team2, -goalDifference);
    }
  });

  writeFile(standingsFile, standings);

  return standings;
};

const loadTeams = async () => {
  if (!isFileCacheExpired(dataFiles.teamRatings)) {
    return JSON.parse(readFile(dataFiles.teamRatings));
  }

  const ratings = await fetchData(dataFiles.ratings);
  const ratingsData = ratings.split("\n");
  const teamRatings = ratingsData.reduce((acc, teamData) => {
    const teamDataFields = teamData.split("\t");

    const code = teamDataFields[2];
    const rating = parseInt(teamDataFields[3], 10);

    acc[code] = rating;
    return acc;
  }, {});

  const teamsData = readFile(dataFiles.teamNames)
    .toString()
    .split(lineBreak);
  const teamNames = teamsData.reduce((acc, teamData) => {
    if (teamData) {
      const [code, name] = teamData.split(",");
      acc[code] = name;
    }
    return acc;
  }, {});

  const teams = Object.entries(teamRatings).reduce((acc, [code, rating]) => {
    acc[code] = {
      name: teamNames[code],
      rating
    };
    return acc;
  }, {});

  writeFile(dataFiles.teamRatings, teams);

  return teams;
};

exports.init = async tournamentCode => {
  const fixtures = await loadFixtures(tournamentCode);
  const standings = await loadStandings(tournamentCode);
  const teamRatings = await loadTeams();
  const nationsLeagueStandings = JSON.parse(
    readFile(dataFiles.nationsLeagueStandings)
  );

  return { fixtures, nationsLeagueStandings, standings, teamRatings };
};
