const moment = require("moment");

const {
  dataFiles,
  fetchData,
  getFileStats,
  readFile,
  writeFile
} = require("./data");

const loadTeams = async () => {
  const { mtime } = getFileStats(dataFiles.teamRatings);

  if (mtime && moment(mtime).isSameOrAfter(moment().subtract(1, "day"))) {
    console.log("returning saved data");
    return JSON.parse(readFile(dataFiles.teamRatings));
  }
  
  const ratings = await fetchData("ratings");
  const ratingsData = ratings.split("\n");
  const teamRatings = ratingsData.reduce((acc, teamData) => {
    const teamDataFields = teamData.split("\t");

    const code = teamDataFields[2];
    const rating = teamDataFields[3];

    acc[code] = rating;
    return acc;
  }, {});

  const teamsData = readFile(dataFiles.teamNames)
    .toString()
    .split("\r\n");
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

loadTeams().then(response => console.log(response));
