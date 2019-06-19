exports.updateStandings = (standings, team, goalDifference) => {
  let points = 0;
  if (goalDifference > 0) {
    points = 3;
  } else if (goalDifference === 0) {
    points = 1;
  }

  standings[team].points += points;
  standings[team].goalDifference += goalDifference;
};
