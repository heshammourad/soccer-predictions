const moment = require("moment");

const { lineBreak } = require("./configuration");
const {
  getKnockoutsStageDate,
  dataFiles,
  fetchData,
  readFile,
} = require("./data");
const { updateStandings } = require("./utils");

const loadFixtures = async (tournamentCode) => {
  const fixturesData = await fetchData(
    `${dataFiles[tournamentCode]}fixtures`,
    `${tournamentCode}/fixtures`,
  );

  const fixtures = fixturesData.split("\\n").reduce((acc, fixtureData) => {
    const fields = fixtureData.split("\\t");

    const fixtureTournament = fields[5];
    if (fixtureTournament === tournamentCode) {
      const fixtureDate = moment(fields.slice(0, 3).join("-"), "YYYY-MM-DD");
      acc.push({
        teams: [fields[3], fields[4]],
        location: fields[6],
        date: fixtureDate,
        isKnockout:
          tournamentCode !== "EQ" &&
          fixtureDate.isSameOrAfter(getKnockoutsStageDate(tournamentCode)),
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
        points: 0,
      };
      return tAcc;
    }, {});
    return { ...acc, ...groupTeams };
  }, {});

  const resultsData = await fetchData(
    `${dataFiles[tournamentCode]}latest`,
    `${tournamentCode}/results`,
  );

  const results = resultsData.split("\\n").reduce((acc, line) => {
    const fields = line.split("\\t");

    const resultTournament = fields[7];
    if (resultTournament === tournamentCode) {
      const date = moment(fields.slice(0, 3).join(""), "YYYY-MM-DD");
      const team1 = fields[3];
      const team2 = fields[4];
      const score1 = fields[5];
      const score2 = fields[6];

      const goalDifference = score1 - score2;

      if (date.isBefore(getKnockoutsStageDate(tournamentCode))) {
        updateStandings(standings, team1, score1, score2);
        updateStandings(standings, team2, score2, score1);
      }

      acc.push({
        date,
        team1,
        team2,
        goalDifference,
        score1: parseInt(score1, 10) || 0,
        score2: parseInt(score2, 10) || 0,
        location: fields[8],
        ratingChange: parseInt(fields[9], 10) || 0,
      });
    }
    return acc;
  }, []);

  return { results, standings };
};

const loadTeams = async () => {
  const ratings = await fetchData(dataFiles.ratings, dataFiles.teamRatings);

  const ratingsData = ratings.split("\\n");
  const teamRatings = ratingsData.reduce((acc, teamData) => {
    const teamDataFields = teamData.split("\\t");

    const code = teamDataFields[2];
    const rating = parseInt(teamDataFields[3], 10);

    acc[code] = rating;
    return acc;
  }, {});

  const teamsData = readFile(dataFiles.teamNames, "utf8").toString().split(lineBreak);
  const teamNames = teamsData.reduce((acc, teamData) => {
    if (teamData) {
      const [code, name] = teamData.split(",");
      acc[code] = name;
    }
    return acc;
  }, {});

  return Object.entries(teamRatings).reduce((acc, [code, rating]) => {
    acc[code] = {
      name: teamNames[code],
      rating,
    };
    return acc;
  }, {});
};

exports.init = async (tournamentCode, cutoffDate = null) => {
  const [fixtures, { results: allResults, standings: allStandings }, teamRatings] = await Promise.all([
    loadFixtures(tournamentCode),
    loadStandings(tournamentCode),
    loadTeams(),
  ]);

  let results = allResults;
  let standings = allStandings;

  if (cutoffDate) {
    const cutoff = moment(cutoffDate, "YYYY-MM-DD");

    // 1. Rebuild standings up to cutoff date
    const groups = JSON.parse(readFile(`${tournamentCode}/groups`));
    standings = Object.entries(groups).reduce((acc, [group, teams]) => {
      const groupTeams = teams.reduce((tAcc, team) => {
        tAcc[team] = {
          goalsFor: 0,
          goalDifference: 0,
          group,
          points: 0,
        };
        return tAcc;
      }, {});
      return { ...acc, ...groupTeams };
    }, {});

    results = [];
    const postCutoffResults = [];

    allResults.forEach((match) => {
      if (match.date.isSameOrBefore(cutoff)) {
        results.push(match);
        if (match.date.isBefore(getKnockoutsStageDate(tournamentCode))) {
          updateStandings(standings, match.team1, match.score1, match.score2);
          updateStandings(standings, match.team2, match.score2, match.score1);
        }
      } else {
        postCutoffResults.push(match);
      }
    });

    // 2. Adjust teamRatings to reverse ELO changes of post-cutoff matches
    postCutoffResults.forEach((match) => {
      const ratingChange = match.ratingChange;
      if (ratingChange) {
        if (teamRatings[match.team1]) {
          teamRatings[match.team1].rating -= ratingChange;
        }
        if (teamRatings[match.team2]) {
          teamRatings[match.team2].rating += ratingChange;
        }
      }
    });

    // 3. Reschedule post-cutoff group stage matches as fixtures to be simulated
    postCutoffResults.forEach((match) => {
      if (match.date.isBefore(getKnockoutsStageDate(tournamentCode))) {
        fixtures.push({
          teams: [match.team1, match.team2],
          location: match.location || "XX",
          date: match.date,
          isKnockout: false,
        });
      }
    });

    // 4. Sort fixtures chronologically
    fixtures.sort((a, b) => a.date.diff(b.date));
  }

  let nationsLeagueStandings;
  if (tournamentCode === "EQ") {
    nationsLeagueStandings = JSON.parse(
      readFile(dataFiles.nationsLeagueStandings),
    );
  }

  return { fixtures, nationsLeagueStandings, results, standings, teamRatings };
};
