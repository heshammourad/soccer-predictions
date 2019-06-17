const axios = require("axios");
const fs = require("fs");

const { dataPath } = require("./configuration");

const dataFiles = {
  ratings: "World",
  teamRatings: "team_ratings",
  teamNames: "teams.csv"
};

exports.fetchData = async key => {
  const datafile = dataFiles[key];
  const timestamp = Date.now();

  const { data } = await axios.get(
    `http://eloratings.net/${datafile}.tsv?_=${timestamp}`
  );
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
