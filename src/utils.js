const readline = require('readline');

exports.updateStandings = (standings, team, goalsFor, goalsAgainst) => {
  let points = 0;
  const goalDifference = goalsFor - goalsAgainst;
  if (goalDifference > 0) {
    points = 3;
  } else if (goalDifference === 0) {
    points = 1;
  }

  standings[team].points += points;
  standings[team].goalDifference += goalDifference;
  standings[team].goalsFor += parseInt(goalsFor, 10);
};

exports.askQuestion = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
};
