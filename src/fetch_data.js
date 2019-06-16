const axios = require('axios');
const fs = require('fs');

const datafiles = {
  ratings: 'World',
}

const fetchData = async key => {
  const datafile = datafiles[key];
  const timestamp = Date.now();

  const { data } = await axios.get(`http://eloratings.net/${datafile}.tsv?_=${timestamp}`);
  return data;
};

const readFile = (filename) => fs.readFileSync(`./data/${filename}.csv`, 'latin1');

const loadTeams = async () => {
  const ratings = await fetchData('ratings');
  const ratingsData = ratings.split('\n');
  const teamRatings = ratingsData.reduce((acc, teamData) => {
    const teamDataFields = teamData.split('\t');

    const code = teamDataFields[2];
    const rating = teamDataFields[3];

    acc[code] = rating;
    return acc;
  }, {});

  const teamsData = readFile('teams').toString().split('\r\n');
  const teams = teamsData.reduce((acc, teamData) => {
    if (teamData) {
      const [code, name] = teamData.split(',');
      acc[code] = name;
    }
    return acc;
  }, {});

  return Object.entries(teamRatings).reduce((acc, [code, rating]) => {
    acc[code] = {
      name: teams[code],
      rating,
    }
    return acc;
  }, {});
};

loadTeams().then(response => console.log(response));
