const axios = require('axios');
const fs = require('fs');
const moment = require('moment');

const { cacheFileDuration, dataPath, forceReload } = require('./configuration');

const dataFiles = {
  AC: '2024_Asian_Cup_',
  AR: '2024_African_Nations_Cup_',
  ARC: '2021_Arab_Nations_Cup_',
  CA: '2021_Copa_America_',
  CCH: '2023_CONCACAF_Championship_',
  CLA: '2019_CONCACAF_Nations_League_A_',
  CLB: '2019_CONCACAF_Nations_League_B_',
  CLC: '2019_CONCACAF_Nations_League_C_',
  EC: '2021_European_Championship_',
  EQ: '2024_European_Championship_qualifying_',
  WC: '2022_World_Cup_',
  nationsLeagueStandings: 'EQ/nations_league_standings',
  ratings: 'World',
  teamRatings: 'team_ratings',
  teamNames: 'teams.csv'
};

const knockoutStageDates = {
  AC: moment('2024-01-28'),
  AR: moment('2024-01-25'),
  ARC: moment('2021-12-10'),
  CA: moment('2021-07-02'),
  CCH: moment('2023-07-08'),
  EC: moment('2021-06-26'),
  WC: moment('2022-12-03')
};

exports.getKnockoutsStageDate = (tournament) => knockoutStageDates[tournament];

exports.readFile = (filename) =>
  fs.readFileSync(`${dataPath}${filename}`, 'latin1');

exports.writeFile = (filename, data) =>
  fs.writeFileSync(`${dataPath}${filename}`, JSON.stringify(data), {
    encoding: 'latin1'
  });

exports.getFileStats = (filename) => {
  try {
    return fs.statSync(`${dataPath}${filename}`);
  } catch (e) {
    return {};
  }
};

exports.fetchData = async (pathname, cacheFile) => {
  if (forceReload || this.isFileCacheExpired(cacheFile)) {
    const timestamp = Date.now();
    const url = `http://eloratings.net/${pathname}.tsv?_=${timestamp}`;

    const { data } = await axios.get(url);
    this.writeFile(cacheFile, data);
  }

  return this.readFile(cacheFile);
};

exports.isFileCacheExpired = (filename) => {
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
