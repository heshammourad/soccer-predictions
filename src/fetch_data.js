const axios = require('axios');
const fs = require('fs');

const datafiles = {
  ratings: 'World',
}

const readFile = (filename) => fs.readFileSync(`./data/${filename}.csv`, 'latin1');

const loadTeams = () => {
  const data = readFile('teams').toString();
  return data.split('\r\n').reduce((acc, cur) => {
    if (cur) {
      const [code, name] = cur.split(',');
      acc[code] = name;
    }
    return acc;
  }, {});
};

const fetchData = key => {
  const datafile = datafiles[key];
  const timestamp = Date.now();
  axios.get(`http://eloratings.net/${datafile}.tsv?_=${timestamp}`).then(({ data }) => {
    const teamsData = data.split('\n');
    const teams = teamsData.map(team => {
      const teamData = team.split('\t');

      const code = teamData[2];
      const rating = teamData[3];

      return {
        [code]: { rating }
      };
    });
    console.log(teams);
  });
};

console.log(loadTeams());