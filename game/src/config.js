// Vice Shores v5.1 — every tuning number, colour and name in one place.
// The rest of the game reads like a description of the city instead of a
// pile of magic numbers. v5.1 adds the fixer's launder, spike strips, the
// PIT manoeuvre, district job boards and two more story jobs.

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

  // Park and plaza (block centres). v5.1 centres them in their blocks:
  // the v5 park sat at (1430,1030), overlapping the x=1400 road so the
  // drive shot's taxi drove across the grass. A block spans 252 px of
  // buildable ground between the sidewalks; the 340 px park/plaza rects
  // cover the sidewalks too, but their centres belong in the block.
  park: { x: 1600, y: 1200, w: 340, h: 340 },
  plaza: { x: 1200, y: 2000, w: 340, h: 340 },

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

  // Dispatch: roadblocks, spike strips, flares and the helicopter (v5/v5.1)
  roadblockCooldown: 14, // seconds between new roadblocks
  heliMinStars: 4, // the helicopter flies from this wanted level
  roadblockSpikeChance: 0.45, // a new roadblock is a spike strip this often
  flareSeconds: 8, // how long a roadblock's smoke flare burns
  heliOffsetX: -150, // the helicopter hovers up-left of the player, never
  heliOffsetY: -250, // directly overhead — its spotlight stops covering
  // the police cars behind the player (v5.1 chase-shot fix)

  // Crew (v5/v5.1): one-time hire prices, and what each bonus is worth
  jamSeconds: 20, // how long the hacker's dispatch jam lasts
  driverTopBonus: 1.12, // +12% top speed with Mara the Driver
  driverTurnBonus: 1.15, // +15% steering with Mara the Driver
  fixerLaunderStars: 2, // Sal the Fixer drops this many stars, once a job
  fixerSpawnSlow: 1.25, // police spawn gap multiplier while Sal is hired
  fixerDecayBonus: 0.85, // wanted decay is this much faster with Sal hired

  // Police pursuit (v5.1): the PIT manoeuvre at high heat
  pitMinStars: 4, // police PIT the player from this wanted level
  pitCooldown: 6, // seconds before the same car can PIT again
  pitSpinSeconds: 1.1, // steering is locked while the car spins out
  pitDamage: 6, // health lost to a PIT spin

  // District standing (v5/v5.1): -100..+100 per district
  standingJobGain: 15, // finishing a job's step in a district
  standingCrimeLoss: 8, // committing a crime in a district
  standingPayoutScale: 200, // payout mult = 1 + standing / this
  standingDiscountDiv: 2, // crew discount = standing / this, in dollars
  standingDriftSeconds: 60, // standing drifts 1 point toward 0 this often
  jobBoardStandingNeeded: 20, // side jobs open once a district likes you
  sideJobStandingGain: 10, // finishing a side job in a district

  // Missions (v5.1: eight story jobs)
  missionTimeLimit: 75,
  mission5Time: 75, // The Silent Partner, loosened from 60 (v5.1)
  mission5CheckpointBonus: 15, // seconds added at the halfway checkpoint
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
    flare: '#ff7a2a',
    spike: '#c8c8d0',
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

// Notice boards: one per district, where the job board lives in the world.
// The board is a sign on a sidewalk corner — 60 px off the nearest road
// centre, on the sidewalk band, never on the asphalt. v5.1 put them on
// the road itself (26 px off centre is inside the 48 px asphalt half);
// these sit at the corner of two sidewalks instead.
export const NOTICE_BOARDS = [
  { district: 'Old Town', x: 660, y: 938 },
  { district: 'Marina Bay', x: 1860, y: 938 },
  { district: 'Neon Mile', x: 660, y: 1338 },
  { district: 'Palm Court', x: 1860, y: 1338 },
  { district: 'Porto Verde', x: 2260, y: 2138 },
  { district: 'Vice Beach', x: 2900, y: 1338 },
];
