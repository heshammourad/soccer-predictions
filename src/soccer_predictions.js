const { simulations, tournament } = require("./configuration");
const { getProbabilities } = require("./constants");

const currentRatings = {
  // UEFA Euro 2020 Qualification
  AD: {
    name: "Andorra",
    rating: 1063
  },
  AL: {
    name: "Albania",
    rating: 1494
  },
  AM: {
    name: "Armenia",
    rating: 1428
  },
  AT: {
    name: "Austria",
    rating: 1710
  },
  AZ: {
    name: "Azerbaijan",
    rating: 1378
  },
  BA: {
    name: "Bosnia and Herzegovina",
    rating: 1751
  },
  BE: {
    name: "Belgium",
    rating: 2045
  },
  BG: {
    name: "Bulgaria",
    rating: 1610
  },
  BY: {
    name: "Belarus",
    rating: 1517
  },
  CH: {
    name: "Switzerland",
    rating: 1898
  },
  CY: {
    name: "Cyprus",
    rating: 1408
  },
  CZ: {
    name: "Czechia",
    rating: 1725
  },
  DE: {
    name: "Germany",
    rating: 1968
  },
  DK: {
    name: "Denmark",
    rating: 1885
  },
  EE: {
    name: "Estonia",
    rating: 1463
  },
  EI: {
    name: "Northern Ireland",
    rating: 1661
  },
  EN: {
    name: "England",
    rating: 1943
  },
  ES: {
    name: "Spain",
    rating: 2017
  },
  FI: {
    name: "Finland",
    rating: 1674
  },
  FO: {
    name: "Faroe Islands",
    rating: 1233
  },
  FR: {
    name: "France",
    rating: 2050
  },
  GE: {
    name: "Georgia",
    rating: 1533
  },
  GI: {
    name: "Gibraltar",
    rating: 1095
  },
  GR: {
    name: "Greece",
    rating: 1608
  },
  HR: {
    name: "Croatia",
    rating: 1903
  },
  HU: {
    name: "Hungary",
    rating: 1649
  },
  IE: {
    name: "Ireland",
    rating: 1728
  },
  IL: {
    name: "Israel",
    rating: 1609
  },
  IS: {
    name: "Iceland",
    rating: 1673
  },
  IT: {
    name: "Italy",
    rating: 1915
  },
  KO: {
    name: "Kosovo",
    rating: 1514
  },
  KZ: {
    name: "Kazakhstan",
    rating: 1383
  },
  LI: {
    name: "Liechtenstein",
    rating: 1124
  },
  LT: {
    name: "Lithuania",
    rating: 1324
  },
  LU: {
    name: "Luxembourg",
    rating: 1357
  },
  LV: {
    name: "Latvia",
    rating: 1271
  },
  MD: {
    name: "Moldova",
    rating: 1315
  },
  ME: {
    name: "Montenegro",
    rating: 1574
  },
  MT: {
    name: "Malta",
    rating: 1196
  },
  NL: {
    name: "Netherlands",
    rating: 2000
  },
  NM: {
    name: "North Macedonia",
    rating: 1523
  },
  NO: {
    name: "Norway",
    rating: 1677
  },
  PL: {
    name: "Poland",
    rating: 1792
  },
  PT: {
    name: "Portugal",
    rating: 1960
  },
  RO: {
    name: "Romania",
    rating: 1746
  },
  RS: {
    name: "Serbia",
    rating: 1793
  },
  RU: {
    name: "Russia",
    rating: 1761
  },
  SE: {
    name: "Sweden",
    rating: 1839
  },
  SI: {
    name: "Slovenia",
    rating: 1551
  },
  SK: {
    name: "Slovakia",
    rating: 1750
  },
  SM: {
    name: "San Marino",
    rating: 832
  },
  SQ: {
    name: "Scotland",
    rating: 1669
  },
  TR: {
    name: "Turkey",
    rating: 1780
  },
  UA: {
    name: "Ukraine",
    rating: 1823
  },
  WA: {
    name: "Wales",
    rating: 1767
  },
  // Copa America
  BR: {
    name: "Brazil",
    rating: 2135
  },
  CO: {
    name: "Colombia",
    rating: 1974
  },
  UY: {
    name: "Uruguay",
    rating: 1935
  },
  AR: {
    name: "Argentina",
    rating: 1902
  },
  CL: {
    name: "Chile",
    rating: 1836
  },
  PE: {
    name: "Peru",
    rating: 1821
  },
  VE: {
    name: "Venezuela",
    rating: 1785
  },
  JP: {
    name: "Japan",
    rating: 1772
  },
  QA: {
    name: "Qatar",
    rating: 1770
  },
  EC: {
    name: "Ecuador",
    rating: 1752
  },
  PY: {
    name: "Paraguay",
    rating: 1708
  },
  BO: {
    name: "Bolivia",
    rating: 1637
  },
  // Africa Cup of Nations
  AO: {
    name: "Angola",
    rating: 1362
  },
  BI: {
    name: "Burundi",
    rating: 1361
  },
  BJ: {
    name: "Benin",
    rating: 1403
  },
  CD: {
    name: "Democratic Republic of Congo",
    rating: 1552
  },
  CI: {
    name: "Ivory Coast",
    rating: 1613
  },
  CM: {
    name: "Cameroon",
    rating: 1607
  },
  DZ: {
    name: "Algeria",
    rating: 1541
  },
  EG: {
    name: "Egypt",
    rating: 1603
  },
  GH: {
    name: "Ghana",
    rating: 1617
  },
  GN: {
    name: "Guinea",
    rating: 1453
  },
  GW: {
    name: "Guinea-Bissau",
    rating: 1294
  },
  KE: {
    name: "Kenya",
    rating: 1392
  },
  MA: {
    name: "Morocco",
    rating: 1706
  },
  MG: {
    name: "Madagascar",
    rating: 1332
  },
  ML: {
    name: "Mali",
    rating: 1529
  },
  MR: {
    name: "Mauritania",
    rating: 1344
  },
  NA: {
    name: "Namibia",
    rating: 1372
  },
  NG: {
    name: "Nigeria",
    rating: 1710
  },
  SN: {
    name: "Senegal",
    rating: 1764
  },
  TN: {
    name: "Tunisia",
    rating: 1651
  },
  TZ: {
    name: "Tanzania",
    rating: 1367
  },
  UG: {
    name: "Uganda",
    rating: 1434
  },
  ZA: {
    name: "South Africa",
    rating: 1521
  },
  ZW: {
    name: "Zimbabwe",
    rating: 1489
  },
  // CONCACAF Gold Cup
  BM: {
    name: "Bermuda",
    rating: 1230
  },
  CA: {
    name: "Canada",
    rating: 1567
  },
  CR: {
    name: "Costa Rica",
    rating: 1701
  },
  CU: {
    name: "Cuba",
    rating: 1330
  },
  CW: {
    name: "Curaçao",
    rating: 1331
  },
  GY: {
    name: "Guyana",
    rating: 1180
  },
  HN: {
    name: "Honduras",
    rating: 1600
  },
  HT: {
    name: "Haiti",
    rating: 1513
  },
  JM: {
    name: "Jamaica",
    rating: 1553
  },
  MQ: {
    name: "Martinique",
    rating: 1464
  },
  MX: {
    name: "Mexico",
    rating: 1837
  },
  NI: {
    name: "Nicaragua",
    rating: 1298
  },
  PA: {
    name: "Panama",
    rating: 1567
  },
  SV: {
    name: "El Salvador",
    rating: 1534
  },
  TT: {
    name: "Trinidad and Tobago",
    rating: 1431
  },
  US: {
    name: "United States",
    rating: 1727
  }
};

let simRatings;

const resetRatings = () => {
  simRatings = Object.entries(currentRatings).reduce((acc, [team, info]) => {
    acc[team] = {
      ...info
    };
    return acc;
  }, {});
};

const updateRating = (team, ratingChange) => {
  simRatings[team].rating = simRatings[team].rating + ratingChange;
};

const nationsLeagueStandings = {
  D: {
    groupWinners: ["GE", "NM", "KO", "BY"],
    rest: [
      "LU",
      "AM",
      "AZ",
      "KZ",
      "MD",
      "GI",
      "FO",
      "LV",
      "LI",
      "AD",
      "MT",
      "SM"
    ]
  },
  C: {
    groupWinners: ["SQ", "NO", "RS", "FI"],
    rest: ["BG", "IL", "HU", "RO", "GR", "AL", "ME", "CY", "EE", "SI", "LT"]
  },
  B: {
    groupWinners: ["BA", "UA", "DK", "SE"],
    rest: ["RU", "AT", "WA", "CZ", "SK", "TR", "IE", "EI"]
  },
  A: {
    groupWinners: ["PT", "NL", "EN", "CH"],
    rest: ["BE", "FR", "ES", "IT", "HR", "PL", "DE", "IS"]
  }
};

const nationsLeagueRank = Object.values(nationsLeagueStandings).reduceRight(
  (acc, {
    groupWinners,
    rest
  }) => {
    acc.push(...groupWinners, ...rest);
    return acc;
  },
  []
);

const getTeamRank = team => nationsLeagueRank.findIndex(t => t === team);

const currentStandings = {
  EQ: {
    A: [{
      team: "BG",
      points: 2,
      goalDifference: -1
    },
    {
      team: "CZ",
      points: 3,
      goalDifference: -4
    },
    {
      team: "EN",
      points: 6,
      goalDifference: 9
    },
    {
      team: "KO",
      points: 2,
      goalDifference: 0
    },
    {
      team: "ME",
      points: 2,
      goalDifference: -4
    }
    ],
    B: [{
      team: "LT",
      points: 1,
      goalDifference: -1
    },
    {
      team: "LU",
      points: 4,
      goalDifference: 0
    },
    {
      team: "PT",
      points: 2,
      goalDifference: 0
    },
    {
      team: "RS",
      points: 1,
      goalDifference: -5
    },
    {
      team: "UA",
      points: 7,
      goalDifference: 6
    }
    ],
    C: [{
      team: "BY",
      points: 0,
      goalDifference: -7
    },
    {
      team: "DE",
      points: 6,
      goalDifference: 3
    },
    {
      team: "EE",
      points: 0,
      goalDifference: -3
    },
    {
      team: "EI",
      points: 9,
      goalDifference: 4
    },
    {
      team: "NL",
      points: 3,
      goalDifference: 3
    }
    ],
    D: [{
      team: "CH",
      points: 4,
      goalDifference: 2
    },
    {
      team: "DK",
      points: 2,
      goalDifference: 0
    },
    {
      team: "GE",
      points: 3,
      goalDifference: 0
    },
    {
      team: "GI",
      points: 0,
      goalDifference: -4
    },
    {
      team: "IE",
      points: 7,
      goalDifference: 2
    }
    ],
    E: [{
      team: "AZ",
      points: 0,
      goalDifference: -3
    },
    {
      team: "HR",
      points: 6,
      goalDifference: 1
    },
    {
      team: "HU",
      points: 6,
      goalDifference: 1
    },
    {
      team: "SK",
      points: 3,
      goalDifference: 1
    },
    {
      team: "WA",
      points: 3,
      goalDifference: 0
    }
    ],
    F: [{
      team: "ES",
      points: 9,
      goalDifference: 6
    },
    {
      team: "FO",
      points: 0,
      goalDifference: -7
    },
    {
      team: "MT",
      points: 3,
      goalDifference: -4
    },
    {
      team: "NO",
      points: 2,
      goalDifference: -1
    },
    {
      team: "RO",
      points: 4,
      goalDifference: 2
    },
    {
      team: "SE",
      points: 7,
      goalDifference: 4
    }
    ],
    G: [{
      team: "AT",
      points: 3,
      goalDifference: -2
    },
    {
      team: "IL",
      points: 7,
      goalDifference: 5
    },
    {
      team: "LV",
      points: 0,
      goalDifference: -7
    },
    {
      team: "NM",
      points: 4,
      goalDifference: 1
    },
    {
      team: "PL",
      points: 9,
      goalDifference: 4
    },
    {
      team: "SI",
      points: 2,
      goalDifference: -1
    }
    ],
    H: [{
      team: "AD",
      points: 0,
      goalDifference: -6
    },
    {
      team: "AL",
      points: 3,
      goalDifference: 0
    },
    {
      team: "FR",
      points: 6,
      goalDifference: 5
    },
    {
      team: "IS",
      points: 6,
      goalDifference: -1
    },
    {
      team: "MD",
      points: 3,
      goalDifference: -6
    },
    {
      team: "TR",
      points: 9,
      goalDifference: 8
    }
    ],
    I: [{
      team: "BE",
      points: 9,
      goalDifference: 7
    },
    {
      team: "CY",
      points: 3,
      goalDifference: 2
    },
    {
      team: "KZ",
      points: 3,
      goalDifference: -4
    },
    {
      team: "RU",
      points: 6,
      goalDifference: 11
    },
    {
      team: "SM",
      points: 0,
      goalDifference: -16
    },
    {
      team: "SQ",
      points: 6,
      goalDifference: 0
    }
    ],
    J: [{
      team: "AM",
      points: 3,
      goalDifference: 0
    },
    {
      team: "BA",
      points: 4,
      goalDifference: -1
    },
    {
      team: "FI",
      points: 6,
      goalDifference: 2
    },
    {
      team: "GR",
      points: 4,
      goalDifference: -1
    },
    {
      team: "IT",
      points: 9,
      goalDifference: 11
    },
    {
      team: "LI",
      points: 0,
      goalDifference: -11
    }
    ]
  },
  CA: {
    A: [{
      team: "BO"
    }, {
      team: "BR"
    }, {
      team: "PE"
    }, {
      team: "VE"
    }],
    B: [{
      team: "AR"
    }, {
      team: "CO"
    }, {
      team: "PY"
    }, {
      team: "QA"
    }],
    C: [{
      team: "CL"
    }, {
      team: "EC"
    }, {
      team: "JP"
    }, {
      team: "UY"
    }]
  },
  AR: {
    A: [{
      team: "CD"
    }, {
      team: "EG"
    }, {
      team: "UG"
    }, {
      team: "ZW"
    }],
    B: [{
      team: "BI"
    }, {
      team: "GN"
    }, {
      team: "MG"
    }, {
      team: "NG"
    }],
    C: [{
      team: "DZ"
    }, {
      team: "KE"
    }, {
      team: "SN"
    }, {
      team: "TZ"
    }],
    D: [{
      team: "CI"
    }, {
      team: "MA"
    }, {
      team: "NA"
    }, {
      team: "ZA"
    }],
    E: [{
      team: "AO"
    }, {
      team: "ML"
    }, {
      team: "MR"
    }, {
      team: "TN"
    }],
    F: [{
      team: "BJ"
    }, {
      team: "CM"
    }, {
      team: "GH"
    }, {
      team: "GW"
    }]
  },
  CCH: {
    A: [{
      team: "CA"
    }, {
      team: "CU"
    }, {
      team: "MQ"
    }, {
      team: "MX"
    }],
    B: [{
      team: "BM"
    }, {
      team: "CR"
    }, {
      team: "HT"
    }, {
      team: "NI"
    }],
    C: [{
      team: "CW"
    }, {
      team: "HN"
    }, {
      team: "JM"
    }, {
      team: "SV"
    }],
    D: [{
      team: "GY"
    }, {
      team: "PA"
    }, {
      team: "TT"
    }, {
      team: "US"
    }]
  }
};

let standings;

const resetStandings = () => {
  standings = Object.entries(currentStandings[tournament]).reduce(
    (acc, [group, teams]) => {
      acc[group] = teams.map(team => ({
        points: 0,
        goalDifference: 0,
        ...team
      }));
      return acc;
    }, {}
  );
};

const updateStandings = (group, teamCode, goalDifference) => {
  let points = 0;
  if (goalDifference === 0) {
    points = 1;
  } else if (goalDifference > 0) {
    points = 3;
  }

  const t = standings[group].find(({
    team
  }) => team === teamCode);
  t.points += points;
  t.goalDifference += goalDifference;
};

const sortFunction = (a, b) => {
  if (a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  return Math.random() - 0.5;
};

const sortStandings = () => {
  Object.values(standings).forEach(teams => {
    teams.sort(sortFunction);
  });
};

const getTeamFromStandings = (group, rank) => standings[group][rank - 1].team;

const printStandings = () => {
  Object.entries(standings).forEach(([group, teams]) => {
    console.log(`Group ${group}:\n`);

    teams.forEach(({
      team,
      points,
      goalDifference
    }) => {
      console.log(team, "\t", goalDifference, "\t", points);
    });

    console.log();
  });
};

const fixtures = {
  EQ: [
    ["A", "BG", ["BG", "KO"]],
    ["A", "CZ", ["CZ", "ME"]],
    ["D", "DK", ["DK", "GE"]],
    ["F", "FO", ["FO", "NO"]],
    ["D", "IE", ["IE", "GI"]],
    ["G", "LV", ["LV", "SI"]],
    ["F", "MT", ["MT", "RO"]],
    ["G", "NM", ["NM", "AT"]],
    ["G", "PL", ["PL", "IL"]],
    ["B", "RS", ["RS", "LT"]],
    ["F", "ES", ["ES", "SE"]],
    ["B", "UA", ["UA", "LU"]],
    ["H", "AL", ["AL", "MD"]],
    ["H", "AD", ["AD", "FR"]],
    ["E", "AZ", ["AZ", "SK"]],
    ["C", "BY", ["BY", "EI"]],
    ["I", "BE", ["BE", "SQ"]],
    ["C", "DE", ["DE", "EE"]],
    ["J", "GR", ["GR", "AM"]],
    ["E", "HU", ["HU", "WA"]],
    ["H", "IS", ["IS", "TR"]],
    ["J", "IT", ["IT", "BA"]],
    ["I", "KZ", ["KZ", "SM"]],
    ["J", "LI", ["LI", "FI"]],
    ["I", "RU", ["RU", "CY"]],
    ["J", "AM", ["AM", "IT"]],
    ["J", "BA", ["BA", "LI"]],
    ["F", "FO", ["FO", "SE"]],
    ["J", "FI", ["FI", "GR"]],
    ["D", "GI", ["GI", "DK"]],
    ["D", "IE", ["IE", "CH"]],
    ["G", "IL", ["IL", "NM"]],
    ["F", "NO", ["NO", "MT"]],
    ["F", "RO", ["RO", "ES"]],
    ["G", "AT", ["AT", "LV"]],
    ["I", "CY", ["CY", "KZ"]],
    ["C", "EE", ["EE", "BY"]],
    ["C", "DE", ["DE", "NL"]],
    ["I", "SM", ["SM", "BE"]],
    ["I", "SQ", ["SQ", "RU"]],
    ["E", "SK", ["SK", "HR"]],
    ["G", "SI", ["SI", "PL"]],
    ["E", "WA", ["WA", "AZ"]],
    ["A", "EN", ["EN", "BG"]],
    ["H", "FR", ["FR", "AL"]],
    ["H", "IS", ["IS", "MD"]],
    ["A", "KO", ["KO", "CZ"]],
    ["B", "LT", ["LT", "UA"]],
    ["B", "RS", ["RS", "PT"]],
    ["H", "TR", ["TR", "AD"]],
    ["J", "AM", ["AM", "BA"]],
    ["J", "FI", ["FI", "IT"]],
    ["D", "GE", ["GE", "DK"]],
    ["J", "GR", ["GR", "LI"]],
    ["F", "RO", ["RO", "MT"]],
    ["F", "ES", ["ES", "FO"]],
    ["F", "SE", ["SE", "NO"]],
    ["D", "CH", ["CH", "GI"]],
    ["E", "AZ", ["AZ", "HR"]],
    ["C", "EE", ["EE", "NL"]],
    ["E", "HU", ["HU", "SK"]],
    ["G", "LV", ["LV", "NM"]],
    ["C", "EI", ["EI", "DE"]],
    ["G", "PL", ["PL", "AT"]],
    ["I", "RU", ["RU", "KZ"]],
    ["I", "SM", ["SM", "CY"]],
    ["I", "SQ", ["SQ", "BE"]],
    ["G", "SI", ["SI", "IL"]],
    ["H", "AL", ["AL", "IS"]],
    ["A", "EN", ["EN", "KO"]],
    ["H", "FR", ["FR", "AD"]],
    ["B", "LT", ["LT", "PT"]],
    ["B", "LU", ["LU", "RS"]],
    ["H", "MD", ["MD", "TR"]],
    ["A", "ME", ["ME", "CZ"]],
    ["G", "AT", ["AT", "IL"]],
    ["C", "BY", ["BY", "EE"]],
    ["I", "BE", ["BE", "SM"]],
    ["E", "HR", ["HR", "HU"]],
    ["I", "KZ", ["KZ", "CY"]],
    ["G", "LV", ["LV", "PL"]],
    ["C", "NL", ["NL", "EI"]],
    ["G", "NM", ["NM", "SI"]],
    ["I", "RU", ["RU", "SQ"]],
    ["E", "SK", ["SK", "WA"]],
    ["H", "AD", ["AD", "MD"]],
    ["A", "CZ", ["CZ", "EN"]],
    ["H", "IS", ["IS", "FR"]],
    ["A", "ME", ["ME", "BG"]],
    ["B", "PT", ["PT", "LU"]],
    ["H", "TR", ["TR", "AL"]],
    ["B", "UA", ["UA", "LT"]],
    ["J", "BA", ["BA", "FI"]],
    ["D", "DK", ["DK", "CH"]],
    ["F", "FO", ["FO", "RO"]],
    ["D", "GE", ["GE", "IE"]],
    ["J", "IT", ["IT", "GR"]],
    ["J", "LI", ["LI", "AM"]],
    ["F", "MT", ["MT", "SE"]],
    ["F", "NO", ["NO", "ES"]],
    ["C", "BY", ["BY", "NL"]],
    ["I", "CY", ["CY", "RU"]],
    ["C", "EE", ["EE", "DE"]],
    ["E", "HU", ["HU", "AZ"]],
    ["I", "KZ", ["KZ", "BE"]],
    ["G", "PL", ["PL", "NM"]],
    ["I", "SQ", ["SQ", "SM"]],
    ["G", "SI", ["SI", "AT"]],
    ["E", "WA", ["WA", "HR"]],
    ["A", "BG", ["BG", "EN"]],
    ["H", "FR", ["FR", "TR"]],
    ["H", "IS", ["IS", "AD"]],
    ["A", "KO", ["KO", "ME"]],
    ["B", "LT", ["LT", "RS"]],
    ["H", "MD", ["MD", "AL"]],
    ["B", "UA", ["UA", "PT"]],
    ["F", "FO", ["FO", "MT"]],
    ["J", "FI", ["FI", "AM"]],
    ["D", "GI", ["GI", "GE"]],
    ["J", "GR", ["GR", "BA"]],
    ["G", "IL", ["IL", "LV"]],
    ["J", "LI", ["LI", "IT"]],
    ["F", "RO", ["RO", "NO"]],
    ["F", "SE", ["SE", "ES"]],
    ["D", "CH", ["CH", "IE"]],
    ["H", "AL", ["AL", "AD"]],
    ["A", "CZ", ["CZ", "KO"]],
    ["A", "EN", ["EN", "ME"]],
    ["H", "FR", ["FR", "MD"]],
    ["B", "PT", ["PT", "LT"]],
    ["B", "RS", ["RS", "LU"]],
    ["H", "TR", ["TR", "IS"]],
    ["J", "AM", ["AM", "GR"]],
    ["J", "BA", ["BA", "IT"]],
    ["D", "DK", ["DK", "GI"]],
    ["J", "FI", ["FI", "LI"]],
    ["F", "NO", ["NO", "FO"]],
    ["F", "RO", ["RO", "SE"]],
    ["F", "ES", ["ES", "MT"]],
    ["D", "CH", ["CH", "GE"]],
    ["G", "AT", ["AT", "NM"]],
    ["E", "AZ", ["AZ", "WA"]],
    ["E", "HR", ["HR", "SK"]],
    ["I", "CY", ["CY", "SQ"]],
    ["C", "DE", ["DE", "BY"]],
    ["G", "IL", ["IL", "PL"]],
    ["C", "EI", ["EI", "NL"]],
    ["I", "RU", ["RU", "BE"]],
    ["I", "SM", ["SM", "KZ"]],
    ["G", "SI", ["SI", "LV"]],
    ["H", "AL", ["AL", "FR"]],
    ["H", "AD", ["AD", "TR"]],
    ["A", "BG", ["BG", "CZ"]],
    ["A", "KO", ["KO", "EN"]],
    ["B", "LU", ["LU", "PT"]],
    ["H", "MD", ["MD", "IS"]],
    ["B", "RS", ["RS", "UA"]],
    ["D", "GI", ["GI", "CH"]],
    ["J", "GR", ["GR", "FI"]],
    ["D", "IE", ["IE", "DK"]],
    ["J", "IT", ["IT", "AM"]],
    ["J", "LI", ["LI", "BA"]],
    ["F", "MT", ["MT", "NO"]],
    ["F", "ES", ["ES", "RO"]],
    ["F", "SE", ["SE", "FO"]],
    ["I", "BE", ["BE", "CY"]],
    ["C", "DE", ["DE", "EI"]],
    ["G", "LV", ["LV", "AT"]],
    ["C", "NL", ["NL", "EE"]],
    ["G", "NM", ["NM", "IL"]],
    ["G", "PL", ["PL", "SI"]],
    ["I", "SM", ["SM", "RU"]],
    ["I", "SQ", ["SQ", "KZ"]],
    ["E", "SK", ["SK", "AZ"]],
    ["E", "WA", ["WA", "HU"]]
  ],
  CA: [
    ["A", "BR", ["BR", "BO"]],
    ["B", "BR", ["AR", "CO"]],
    ["A", "BR", ["PE", "VE"]],
    ["C", "BR", ["EC", "UY"]],
    ["B", "BR", ["PY", "QA"]],
    ["C", "BR", ["CL", "JP"]],
    ["A", "BR", ["BO", "PE"]],
    ["A", "BR", ["BR", "VE"]],
    ["B", "BR", ["AR", "PY"]],
    ["B", "BR", ["CO", "QA"]],
    ["C", "BR", ["JP", "UY"]],
    ["C", "BR", ["CL", "EC"]],
    ["A", "BR", ["BO", "VE"]],
    ["A", "BR", ["BR", "PE"]],
    ["B", "BR", ["AR", "QA"]],
    ["B", "BR", ["CO", "PY"]],
    ["C", "BR", ["CL", "UY"]],
    ["C", "BR", ["EC", "JP"]]
  ],
  AR: [
    ["A", "EG", ["EG", "ZW"]],
    ["B", "EG", ["BI", "NG"]],
    ["A", "EG", ["CD", "UG"]],
    ["B", "EG", ["GN", "MG"]],
    ["C", "EG", ["DZ", "KE"]],
    ["D", "EG", ["CI", "ZA"]],
    ["C", "EG", ["SN", "TZ"]],
    ["E", "EG", ["AO", "TN"]],
    ["E", "EG", ["ML", "MR"]],
    ["D", "EG", ["MA", "NA"]],
    ["F", "EG", ["BJ", "GH"]],
    ["F", "EG", ["CM", "GW"]],
    ["B", "EG", ["BI", "MG"]],
    ["A", "EG", ["EG", "CD"]],
    ["A", "EG", ["UG", "ZW"]],
    ["C", "EG", ["DZ", "SN"]],
    ["B", "EG", ["GN", "NG"]],
    ["C", "EG", ["KE", "TZ"]],
    ["D", "EG", ["CI", "MA"]],
    ["E", "EG", ["ML", "TN"]],
    ["D", "EG", ["NA", "ZA"]],
    ["E", "EG", ["AO", "MR"]],
    ["F", "EG", ["BJ", "GW"]],
    ["F", "EG", ["CM", "GH"]],
    ["B", "EG", ["BI", "GN"]],
    ["A", "EG", ["CD", "ZW"]],
    ["A", "EG", ["EG", "UG"]],
    ["B", "EG", ["MG", "NG"]],
    ["C", "EG", ["DZ", "TZ"]],
    ["D", "EG", ["CI", "NA"]],
    ["C", "EG", ["KE", "SN"]],
    ["D", "EG", ["MA", "ZA"]],
    ["E", "EG", ["AO", "ML"]],
    ["F", "EG", ["BJ", "CM"]],
    ["F", "EG", ["GH", "GW"]],
    ["E", "EG", ["MR", "TN"]]
  ],
  CCH: [
    ["A", "US", ["CA", "MQ"]],
    ["A", "US", ["CU", "MX"]],
    ["B", "CR", ["BM", "HT"]],
    ["B", "CR", ["CR", "NI"]],
    ["C", "JM", ["CW", "SV"]],
    ["C", "JM", ["JM", "HN"]],
    ["D", "US", ["PA", "TT"]],
    ["D", "US", ["US", "GY"]],
    ["A", "US", ["CA", "MX"]],
    ["A", "US", ["CU", "MQ"]],
    ["B", "US", ["BM", "CR"]],
    ["B", "US", ["HT", "NI"]],
    ["C", "US", ["CW", "HN"]],
    ["C", "US", ["SV", "JM"]],
    ["D", "US", ["GY", "PA"]],
    ["D", "US", ["US", "TT"]],
    ["A", "US", ["CA", "CU"]],
    ["A", "US", ["MQ", "MX"]],
    ["B", "US", ["BM", "NI"]],
    ["B", "US", ["CR", "HT"]],
    ["C", "US", ["CW", "JM"]],
    ["C", "US", ["SV", "HN"]],
    ["D", "US", ["GY", "TT"]],
    ["D", "US", ["US", "PA"]]
  ]
};

const simulateResult = probabilities => {
  const random = Math.random();
  let total = 0;
  for (let [goalDifference, probability] of Object.entries(probabilities)) {
    total += probability;
    if (random <= total) {
      return goalDifference;
    }
  }
};

const evaluatedStats = {
  EC: {
    qualifyFromGroup: 0,
    qualifyToPlayoffs: 0,
    qualifyFromPlayoffs: 0
  },
  CA: {
    first: 0,
    second: 0,
    third: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  },
  AR: {
    first: 0,
    second: 0,
    third: 0,
    roundOf16: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  },
  CCH: {
    first: 0,
    second: 0,
    quarterfinals: 0,
    semifinals: 0,
    final: 0,
    champions: 0
  }
};

const stats = Object.entries(currentStandings[tournament]).reduce(
  (acc, [group, teams]) => {
    acc[group] = teams.reduce((teamAcc, {
      team
    }) => {
      teamAcc[team] = {
        ...evaluatedStats[tournament]
      };
      return teamAcc;
    }, {});
    return acc;
  }, {}
);

const printStats = () => {
  const statPrint = Object.entries(stats).reduce((acc, [group, teams]) => {
    acc += `Group ${group}:\n`;
    acc += Object.entries(teams).reduce((tAcc, [team, totals]) => {
      const [c, {
        name
      }] = Object.entries(currentRatings).find(
        ([code]) => code === team
      );
      tAcc += `${name}`;

      const valuePrint = Object.values(totals).reduce((vAcc, total) => {
        const percentage = Math.round((total / simulations) * 100);
        vAcc += `,${percentage}%`;

        return vAcc;
      }, "");

      tAcc += `${valuePrint}\n`;

      return tAcc;
    }, "");
    return `${acc}\n`;
  }, "");

  console.log(statPrint);
};

const addStat = (team, ...statList) => {
  statList.forEach(stat => {
    team[stat]++;
  });
};

const addStats = (group, team, ...statList) => {
  if (group) {
    addStat(stats[group][team], ...statList);
  } else {
    const group = Object.values(stats).find(group =>
      Object.keys(group).includes(team)
    );
    addStat(group[team], ...statList);
  }
};

const rankStatNames = ["first", "second", "third"];

const getBestTeamsOfRank = (rank, teamCount, automaticStat) => {
  const rankIndex = rank - 1;
  return Object.entries(standings)
    .reduce((acc, [group, teams]) => {
      teams.forEach((team, index) => {
        const teamCode = team.team;
        const stat = rankStatNames[index];
        if (index < rankIndex) {
          addStats(group, teamCode, stat, automaticStat);
        } else if (index === rankIndex) {
          addStats(group, teamCode, stat);
          acc.push({
            ...team,
            group
          });
        }
      });
      return acc;
    }, [])
    .sort(sortFunction)
    .slice(0, teamCount);
};

const updateStats = stage => {
  sortStandings();

  switch (stage) {
    case "EQ": {
      const qualifiedTeams = [];

      Object.entries(standings).forEach(([group, [qual1, qual2]]) => {
        const stat = "qualifyFromGroup";

        const q1 = qual1.team;
        const q2 = qual2.team;

        addStats(group, q1, stat);
        addStats(group, q2, stat);

        qualifiedTeams.push(q1, q2);
      });

      const playoffTeams = [];

      const isQualified = team =>
        qualifiedTeams.includes(team) || playoffTeams.includes(team);

      const addTeamsToLeague = (obj, league, teams) => {
        const leagueTeams = obj[league];

        obj[league] = {
          ...leagueTeams,
          rest: [...leagueTeams.rest, ...teams]
        };
      };

      const paths = Object.entries(nationsLeagueStandings).reduce(
        (acc, [league, {
          groupWinners,
          rest
        }], idx, src) => {
          const selectedGroupWinners = groupWinners.filter(
            gw => !isQualified(gw)
          );

          const groupWinnerCount = selectedGroupWinners.length;

          const selectedLeagueTeams = rest.reduce((tAcc, team) => {
            if (tAcc.length + groupWinnerCount === 4 || isQualified(team)) {
              return tAcc;
            }

            tAcc.push(team);
            return tAcc;
          }, []);

          playoffTeams.push(...selectedGroupWinners, ...selectedLeagueTeams);

          let teamsLeftToPick =
            4 - (groupWinnerCount + selectedLeagueTeams.length);

          if (groupWinnerCount && teamsLeftToPick) {
            for (let i = idx - 1; i >= 0; i--) {
              const [league, {
                rest
              }] = src[i];

              const selectedRemainingTeams = rest
                .filter(team => !isQualified(team))
                .slice(0, teamsLeftToPick);

              addTeamsToLeague(acc, league, selectedRemainingTeams);
              playoffTeams.push(...selectedRemainingTeams);

              teamsLeftToPick -= selectedRemainingTeams.length;
              if (!teamsLeftToPick) {
                break;
              }
            }
          }

          acc[league] = {
            groupWinners: selectedGroupWinners,
            rest: selectedLeagueTeams
          };
          return acc;
        }, {}
      );

      let teamsLeftToPick = 16 - playoffTeams.length;

      if (teamsLeftToPick) {
        for (let [league, {
          rest
        }] of [
          ...Object.entries(nationsLeagueStandings)
        ].reverse()) {
          const selectedRemainingTeams = rest
            .filter(team => !isQualified(team))
            .slice(0, teamsLeftToPick);

          addTeamsToLeague(paths, league, selectedRemainingTeams);
          playoffTeams.push(...selectedRemainingTeams);

          teamsLeftToPick -= selectedRemainingTeams.length;
          if (!teamsLeftToPick) {
            break;
          }
        }
      }

      Object.values(paths).forEach(({
        groupWinners,
        rest
      }) => {
        const teams = [...groupWinners, ...rest];
        teams.forEach(team => {
          addStats(null, team, "qualifyToPlayoffs");
        });
      });

      const selectedTeams = [];

      const getPot = teams =>
        teams.filter(team => !selectedTeams.includes(team));
      const drawTeam = pot => pot[Math.floor(Math.random() * pot.length)];

      const draws = Object.entries(paths).reduce(
        (acc, [league, {
          groupWinners,
          rest
        }], idx, src) => {
          const drawTeams = [...groupWinners];

          const teamsLeftToDraw = () => 4 - drawTeams.length;
          if (teamsLeftToDraw) {
            let pot = getPot(rest);
            const potTeamCount = pot.length;
            if (teamsLeftToDraw() >= potTeamCount) {
              drawTeams.push(...pot);
              selectedTeams.push(...pot);
            } else {
              while (teamsLeftToDraw()) {
                const draw = drawTeam(pot);

                drawTeams.push(draw);
                selectedTeams.push(draw);

                pot = getPot(pot);
              }
            }
          }

          for (let i = idx - 1; teamsLeftToDraw() && i >= 0; i--) {
            const teams = src[i][1].rest;
            let pot = getPot(teams);

            while (teamsLeftToDraw() && pot.length) {
              const draw = drawTeam(pot);

              drawTeams.push(draw);
              selectedTeams.push(draw);
              pot = getPot(teams);
            }
          }

          drawTeams.sort((a, b) => {
            const aIndex = getTeamRank(a);
            const bIndex = getTeamRank(b);

            return aIndex - bIndex;
          });

          acc[league] = drawTeams;

          return acc;
        }, {}
      );

      return draws;
    }
    case "CA": {
      const thirdPlacedTeams = getBestTeamsOfRank(3, 2, "quarterfinals").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return bGroup - aGroup;
        }
      );

      thirdPlacedTeams.forEach(({
        group,
        team
      }) => {
        addStats(group, team, "quarterfinals");
      });

      const knockouts = [];

      knockouts.push([getTeamFromStandings("A", 1), thirdPlacedTeams[0].team]);
      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("B", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("C", 2)
      ]);
      knockouts.push([getTeamFromStandings("C", 1), thirdPlacedTeams[1].team]);

      return knockouts;
    }
    case "AR": {
      const matchupIndices = {
        ABCD: [2, 3, 0, 1],
        ABCE: [2, 0, 1, 3],
        ABCF: [2, 0, 1, 3],
        ABDE: [2, 0, 1, 3],
        ABDF: [2, 0, 1, 3],
        ABEF: [2, 0, 1, 3],
        ACDE: [1, 2, 0, 3],
        ACDF: [1, 2, 0, 3],
        ACEF: [1, 0, 3, 2],
        ADEF: [1, 0, 3, 2],
        BCDE: [1, 2, 0, 3],
        BCDF: [1, 2, 0, 3],
        BCEF: [2, 1, 0, 3],
        BDEF: [2, 1, 0, 3],
        CDEF: [0, 1, 3, 2]
      };

      const thirdPlacedTeams = getBestTeamsOfRank(3, 4, "roundOf16").sort(
        (a, b) => {
          const aGroup = a.group.charCodeAt();
          const bGroup = b.group.charCodeAt();

          return aGroup - bGroup;
        }
      );

      const thirdPlaceQualifierGroups = thirdPlacedTeams.reduce(
        (acc, {
          group
        }) => acc + group,
        ""
      );
      const scenarioIndices = matchupIndices[thirdPlaceQualifierGroups];

      const knockouts = [];

      knockouts.push([
        getTeamFromStandings("A", 2),
        getTeamFromStandings("C", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        thirdPlacedTeams[scenarioIndices[3]].team
      ]);
      knockouts.push([
        getTeamFromStandings("B", 1),
        thirdPlacedTeams[scenarioIndices[1]].team
      ]);
      knockouts.push([
        getTeamFromStandings("F", 1),
        getTeamFromStandings("E", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("E", 1),
        getTeamFromStandings("D", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        thirdPlacedTeams[scenarioIndices[2]].team
      ]);
      knockouts.push([
        getTeamFromStandings("B", 2),
        getTeamFromStandings("F", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        thirdPlacedTeams[scenarioIndices[0]].team
      ]);

      return knockouts;
    }
    case "CCH": {
      const knockouts = [];

      getBestTeamsOfRank(3, 0, "quarterfinals");

      knockouts.push([
        getTeamFromStandings("B", 1),
        getTeamFromStandings("A", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("A", 1),
        getTeamFromStandings("B", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("C", 1),
        getTeamFromStandings("D", 2)
      ]);
      knockouts.push([
        getTeamFromStandings("D", 1),
        getTeamFromStandings("C", 2)
      ]);

      return knockouts;
    }
    default:
      break;
  }
  return null;
};

const simulateMatch = ({
  group,
  location,
  teams,
  isPenaltyShootout
}) => {
  const [team1Rating, team2Rating] = teams.map(
    team => simRatings[team].rating + (team === location ? 100 : 0)
  );

  const [favorite, underdog] =
    team1Rating >= team2Rating ? teams : [...teams].reverse();

  const ratingDifference = Math.abs(team1Rating - team2Rating);
  const probabilities = getProbabilities(ratingDifference);
  const result = simulateResult(probabilities);

  const goalDifference = Math.abs(result);
  if (group) {
    updateStandings(group, favorite, goalDifference);
    updateStandings(group, underdog, -goalDifference);
  }

  let kAdj = 1;
  if (goalDifference === 2) {
    kAdj = 1.5;
  } else if (goalDifference >= 3) {
    kAdj = 1.75 + (goalDifference - 3) / 8;
  }
  const k = 40 * kAdj;

  let w = 0.5;
  let winner;
  if (result < 0) {
    w = 0;
    winner = underdog;
  } else if (result > 0) {
    w = 1;
    winner = favorite;
  }

  const we = 1 / (Math.pow(10, -ratingDifference / 400) + 1);

  const ratingChange = Math.round(k * (w - we));
  updateRating(favorite, ratingChange);
  updateRating(underdog, -ratingChange);

  if (isPenaltyShootout && !winner) {
    const penaltyShootoutResult = Math.random();
    winner = penaltyShootoutResult <= we ? favorite : underdog;
  }

  return winner;
};

const simulateRound = (location, stat) => (acc, teams, idx) => {
  const winner = simulateMatch({
    location,
    teams,
    isPenaltyShootout: true
  });

  addStats(null, winner, stat);

  if (idx % 2 === 0) {
    acc.push([winner]);
  } else {
    const matchup = acc.pop();
    matchup.push(winner);
    acc.push(matchup);
  }

  return acc;
};

const simulateKnockouts = (knockouts, stats, location) => {
  let round = [...knockouts];
  const roundStats = [...stats];

  do {
    const roundStat = roundStats.shift();
    round = round.reduce(simulateRound(location, roundStat), []);
  } while (round.length > 1);

  round.reduce(simulateRound(location, roundStats[0]), []);
};

for (let sim = 0; sim < simulations; sim++) {
  resetRatings();
  resetStandings();

  fixtures[tournament].forEach(([group, location, teams]) => {
    simulateMatch({
      group,
      location,
      teams
    });
  });

  const playoffs = updateStats(tournament);

  switch (tournament) {
    case "EQ": {
      Object.values(playoffs).forEach(([team1, team2, team3, team4]) => {
        const winner1 = simulateMatch({
          location: team1,
          teams: [team1, team4],
          isPenaltyShootout: true
        });

        const winner2 = simulateMatch({
          location: team2,
          teams: [team2, team3],
          isPenaltyShootout: true
        });

        const finalHomeDraw = Math.random();
        const playoffFinal =
          finalHomeDraw <= 0.5 ? [winner1, winner2] : [winner2, winner1];

        const playoffWinner = simulateMatch({
          location: playoffFinal[0],
          teams: playoffFinal,
          isPenaltyShootout: true
        });

        addStats(null, playoffWinner, "qualifyFromPlayoffs");
      });
      break;
    }
    case "CA":
      simulateKnockouts(playoffs, ["semifinals", "final", "champions"], "BR");
      break;
    case "AR":
      simulateKnockouts(
        playoffs,
        ["quarterfinals", "semifinals", "final", "champions"],
        "EG"
      );
      break;
    case "CCH":
      simulateKnockouts(playoffs, ["semifinals", "final", "champions", "US"]);
      break;
    default:
      break;
  }
}

printStats();