const probability_variables = {
  [-3]: [
    2.89117,
    [4.60875, 0.00196866],
    [10.9095, 0.00456198],
    [18.2638, 0.00557003],
    [13.055, 0.00752074],
    [4.84452, 0.00979567],
    [1.59797, 0.0110293],
    [0.517296, 0.0127096],
    [0.118588, 0.0144449],
    [0.0245152, 0.0163272],
    [0.0138689, 0.0178673]
  ],
  [-2]: [
    7.3841,
    [4.63221, -0.00196866],
    [17.4791, 0.00259332],
    [29.2621, 0.00360137],
    [20.9165, 0.00555208],
    [7.76185, 0.00782701],
    [2.56025, 0.0090606],
    [0.828807, 0.010741],
    [0.19, 0.0124762],
    [0.039278, 0.0143586],
    [0.0222206, 0.0158986]
  ],
  [-1]: [
    32.5229,
    [8.61903, -0.00456198],
    [13.7394, -0.00259332],
    [54.4473, 0.00100805],
    [38.9189, 0.00295876],
    [14.4423, 0.00523369],
    [4.7638, 0.00646728],
    [1.54214, 0.00814763],
    [0.353528, 0.00988292],
    [0.0730837, 0.0117652],
    [0.0413453, 0.0133053]
  ],
  [0]: [
    69.3106,
    [10.9719, -0.00557003],
    [17.4901, -0.00360137],
    [41.4012, -0.00100805],
    [49.5432, 0.00195071],
    [18.3848, 0.00422564],
    [6.06425, 0.00545923],
    [1.96312, 0.00713958],
    [0.450037, 0.00887487],
    [0.0930345, 0.0107572],
    [0.052632, 0.0122973]
  ],
  [1]: [
    79.0372,
    [17.5037, -0.00752074],
    [27.9023, -0.00555208],
    [66.0482, -0.00295876],
    [110.573, -0.00195071],
    [29.3297, 0.00227493],
    [9.67441, 0.00350852],
    [3.13181, 0.00518887],
    [0.717952, 0.00692416],
    [0.14842, 0.00880647],
    [0.0839649, 0.0103465]
  ],
  [2]: [
    50.5673,
    [30.1781, -0.00979567],
    [48.1063, -0.00782701],
    [113.874, -0.00523369],
    [190.638, -0.00422564],
    [136.268, -0.00227493],
    [16.6797, 0.00123359],
    [5.39955, 0.00291394],
    [1.23782, 0.00464923],
    [0.255891, 0.00653154],
    [0.144764, 0.00807161]
  ],
  [3]: [
    22.4111,
    [40.548, -0.0110293],
    [64.6366, -0.0090606],
    [153.003, -0.00646728],
    [256.145, -0.00545923],
    [183.092, -0.00350852],
    [67.9432, -0.00123359],
    [7.25495, 0.00168035],
    [1.66316, 0.00341564],
    [0.34382, 0.00529795],
    [0.194508, 0.00683803]
  ],
  [4]: [
    10.8485,
    [60.6322, -0.0127096],
    [96.6524, -0.010741],
    [228.788, -0.00814763],
    [383.02, -0.00713958],
    [273.782, -0.00518887],
    [101.597, -0.00291394],
    [33.5118, -0.00168035],
    [2.48696, 0.00173529],
    [0.514121, 0.0036176],
    [0.290851, 0.00515767]
  ],
  [5]: [
    3.76804,
    [91.865, -0.0144449],
    [146.44, -0.0124762],
    [346.642, -0.00988292],
    [580.321, -0.00887487],
    [414.812, -0.00692416],
    [153.931, -0.00464923],
    [50.7744, -0.00341564],
    [16.4367, -0.00173529],
    [0.778954, 0.00188231],
    [0.440675, 0.00342238]
  ],
  [6]: [
    1.22249,
    [144.173, -0.0163272],
    [229.824, -0.0143586],
    [544.021, -0.0117652],
    [910.757, -0.0107572],
    [651.008, -0.00880647],
    [241.581, -0.00653154],
    [79.6856, -0.00529795],
    [25.7959, -0.0036176],
    [5.91358, -0.00188231],
    [0.691597, 0.00154007]
  ],
  [7]: [
    1,
    [208.465, -0.0178673],
    [332.309, -0.0158986],
    [786.617, -0.0133053],
    [1316.89, -0.0122973],
    [941.312, -0.0103465],
    [349.309, -0.00807161],
    [115.22, -0.00683803],
    [37.299, -0.00515767],
    [8.55062, -0.00342238],
    [1.76764, -0.00154007]
  ]
};

const getProbabilities = ratingDifference =>
  Object.entries(probability_variables).reduce(
    (acc, [goalDifference, [variable1, ...exp]]) => {
      const value = exp.reduce(
        (valueAcc, [multiplier, expMult]) =>
          valueAcc + multiplier * Math.pow(Math.E, expMult * ratingDifference),
        0
      );
      acc[goalDifference] = variable1 / (variable1 + value);
      return acc;
    },
    {}
  );

exports.simulateResult = ratingDifference => {
  const probabilities = getProbabilities(ratingDifference);
  
  const random = Math.random();
  let total = 0;
  for (let [goalDifference, probability] of Object.entries(probabilities)) {
    total += probability;
    if (random <= total) {
      return Number.parseInt(goalDifference);
    }
  }
  throw Error('Simulation failed');
}