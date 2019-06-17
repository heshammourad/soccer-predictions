const axios = require("axios");
const fs = require("fs");

const { dataPath } = require("./configuration");

const dataFiles = {
  EQ: "2020_European_Championship_qualifying_",
  nationsLeagueStandings: "nations_league_standings",
  ratings: "World",
  teamRatings: "team_ratings",
  teamNames: "teams.csv"
};

exports.fetchData = async filename => {
  const timestamp = Date.now();
  const url = `http://eloratings.net/${filename}.tsv?_=${timestamp}`;

  const { data } = await axios.get(url);
  return data;
};

exports.readFile = filename =>
  fs.readFileSync(`${dataPath}${filename}`, "latin1");

exports.writeFile = (filename, data) =>
  fs.writeFileSync(`${dataPath}${filename}`, JSON.stringify(data), {
    encoding: "latin1"
  });

exports.getFileStats = filename => {
  try {
    return fs.statSync(`${dataPath}${filename}`);
  } catch (e) {
    return {};
  }
};

module.exports = {
  ...module.exports,
  dataFiles
};
