const moment = require("moment");

const { cacheFileDuration } = require("./configuration");
const { getFileStats } = require("./data");

exports.isFileCacheExpired = filename => {
  const { mtime } = getFileStats(filename);
  if (!mtime) {
    return true;
  }

  return moment(mtime).isBefore(moment().subtract(...cacheFileDuration));
};

exports.updateStandings = (standings, team, goalDifference) => {
  let points = 0;
  if (goalDifference > 0) {
    points = 3;
  } else if (goalDifference === 0) {
    points = 1;
  }

  standings[team].points += points;
  standings[team].goalDifference += goalDifference;
}