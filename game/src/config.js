// Vice Shores — every tuning number, colour and name in one place, so the
// rest of the game reads like a description of the city instead of a pile
// of magic numbers.

export const CFG = {
  // World and view
  worldW: 3200,
  worldH: 2400,
  viewW: 1280,
  viewH: 720,

  // Roads
  roadXs: [200, 600, 1000, 1400, 1800, 2200, 2600],
  roadYs: [200, 600, 1000, 1400, 1800, 2200],
  roadHalf: 48, // half the asphalt width
  walkHalf: 74, // asphalt + sidewalk: blocks start beyond this

  // Beach and ocean (east edge)
  sandX: 2840,
  oceanX: 3020,

  // Park and plaza (block centres)
  park: { x: 1430, y: 1030, w: 340, h: 340 },
  plaza: { x: 1030, y: 1830, w: 340, h: 340 },

  // Player on foot
  walkSpeed: 175,
  runSpeed: 265,
  playerRadius: 14,
  playerHealth: 100,

  // Driving
  carAccel: 420,
  carTopSpeed: 540,
  sportsTopSpeed: 640,
  carReverseMax: 160,
  carTurn: 2.6,
  carBrake: 700,

  // Traffic and pedestrians
  trafficCount: 14,
  trafficSpeed: 150,
  pedCount: 42,
  pedSpeed: 55,
  pedFleeSpeed: 130,

  // Wanted
  wantedDecaySeconds: 26,
  maxPoliceCars: 4,
  bustHoldSeconds: 1.4,

  // Missions
  missionTimeLimit: 75,
  markerRadius: 70,

  // Save
  saveKey: 'vice-shores.save.v1',
  saveEverySeconds: 20,

  // Palette
  colors: {
    grass: '#79b657',
    grassDark: '#6da84e',
    road: '#333a45',
    roadEdge: '#2b313b',
    sidewalk: '#c9c2b4',
    line: '#e8c33c',
    sand: '#ecd9a0',
    ocean: '#3f8fb5',
    oceanDeep: '#2f7ba3',
    parkGrass: '#5da24a',
    pond: '#7cc4e8',
    plaza: '#b9b2a4',
    fountain: '#8fd0ee',
    buildingRoof: ['#d98a6a', '#7fa8c9', '#c9a86a', '#b07ba8', '#8fb08a', '#c97b7b', '#6a8fb0', '#d9b06a'],
    buildingSide: '#00000033',
    tree: '#3f8f3a',
    treeDark: '#357a31',
    palm: '#4da34a',
    trunk: '#8a6a4a',
  },

  districts: [
    // name, test on x/y — first match wins
    { name: 'Ocean', test: (x) => x >= 3020 },
    { name: 'Vice Beach', test: (x) => x >= 2840 },
    { name: 'Marina Bay', test: (x, y) => x >= 1400 && y < 1000 },
    { name: 'Old Town', test: (x, y) => x < 1400 && y < 1000 },
    { name: 'Porto Verde', test: (x, y) => x >= 1800 && y >= 1800 },
    { name: 'Neon Mile', test: (x, y) => x < 1400 && y >= 1000 },
    { name: 'Palm Court', test: () => true },
  ],
};

// Car models: length/width in px, top speed multiplier, palette.
export const CAR_MODELS = {
  sedan: { len: 52, wid: 26, top: 1.0, colors: ['#5a7fb0', '#b05050', '#7a7a7a', '#4a8a6a'] },
  coupe: { len: 48, wid: 24, top: 1.05, colors: ['#c05050', '#5050a0', '#c0a050'] },
  taxi: { len: 52, wid: 26, top: 1.0, colors: ['#f2c230'] },
  van: { len: 62, wid: 28, top: 0.85, colors: ['#8a8a8a', '#6a7a8a', '#a08a6a'] },
  sports: { len: 50, wid: 25, top: 1.18, colors: ['#e8e8e8', '#d03030', '#3080d0'] },
  pickup: { len: 56, wid: 27, top: 0.95, colors: ['#7a5a3a', '#3a6a5a', '#8a3a3a'] },
  police: { len: 54, wid: 27, top: 1.12, colors: ['#2a4a8a'] },
};
