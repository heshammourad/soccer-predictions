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
