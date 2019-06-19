const axios = require("axios");
const fs = require("fs");
const moment = require("moment");

const { cacheFileDuration, dataPath } = require("./configuration");

const dataFiles = {
  AR: "2019_African_Nations_Cup_",
  CA: "2019_Copa_America_",
  EQ: "2020_European_Championship_qualifying_",
  nationsLeagueStandings: "nations_league_standings",
  ratings: "World",
  teamRatings: "team_ratings",
  teamNames: "teams.csv"
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

exports.fetchData = async (pathname, cacheFile) => {
  if (this.isFileCacheExpired(cacheFile)) {
    const timestamp = Date.now();
    const url = `http://eloratings.net/${pathname}.tsv?_=${timestamp}`;

    const { data } = await axios.get(url);
    this.writeFile(cacheFile, data);
  }

  return this.readFile(cacheFile);
};

exports.isFileCacheExpired = filename => {
  const { mtime } = this.getFileStats(filename);
  if (!mtime) {
    return true;
  }

  return moment(mtime).isBefore(moment().subtract(...cacheFileDuration));
};

module.exports = {
  ...module.exports,
  dataFiles
};
