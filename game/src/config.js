// Vice Shores v5.3 — every tuning number, colour and name in one place.
// The rest of the game reads like a description of the city instead of a
// pile of magic numbers. v5.3 adds the wanted heat meter, the police
// scanner, Ivy's promotion to Spotter, district events (street race,
// police raid, blackout), the police stakeout, and two more story jobs
// (twelve in all).

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

  // Park and plaza (block centres). The 340 px park/plaza rects cover
  // the sidewalks too, but their centres belong in the block: a block
  // spans 252 px of buildable ground between the sidewalks.
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

  // Wanted heat (v5.3): a 0-100 meter that lives between jobs. Every
  // crime pours heat in; it cools slowly while the player stays clean.
  // Hot players get more roadblocks, faster police spawns and slower
  // decay — the city remembers, even after the stars are gone.
  heatMax: 100, // the meter's top
  heatPerStar: 14, // heat added per wanted star gained
  heatPerCrime: 6, // heat added per crime, on top of the stars
  heatDecayPerSecond: 0.9, // heat lost per second with no police near
  heatDecayPolice: 0.25, // heat lost per second while police are near
  heatRoadblockBonus: 1, // +1 roadblock demand while heat is over the line
  heatLine: 55, // heat above this: the PD is on high alert
  heatSpawnFactor: 0.75, // police spawn gap multiplier while heat is high
  heatDecayFactor: 1.35, // wanted decay is this much slower while heat is high

  // Dispatch: roadblocks, spike strips, flares and the helicopter (v5/v5.1)
  roadblockCooldown: 14, // seconds between new roadblocks
  heliMinStars: 4, // the helicopter flies from this wanted level
  roadblockSpikeChance: 0.45, // a new roadblock is a spike strip this often
  flareSeconds: 8, // how long a roadblock's smoke flare burns
  heliOffsetX: -150, // the helicopter hovers up-left of the player, never
  heliOffsetY: -250, // directly overhead — its spotlight stops covering
  // the police cars behind the player (v5.1 chase-shot fix)

  // Dispatch v5.2: the lockdown, the second helicopter, the rolling
  // roadblock. At five stars the district the player is in locks down:
  // extra roadblocks, a second helicopter, and the whole district on the
  // minimap turns red. A rolling roadblock is two police cars driving
  // side by side ahead of the player, blocking the lane while moving.
  lockdownMinStars: 5, // the district locks down at this wanted level
  heli2MinStars: 5, // Air-2 joins the hunt at this wanted level
  heli2OffsetX: 150, // Air-2 hovers up-right, mirroring Air-1 up-left
  heli2OffsetY: -250,
  rollingMinStars: 4, // a rolling roadblock appears from this level
  rollingChance: 0.3, // a new roadblock is a rolling one this often
  rollingSpeed: 300, // how fast the rolling pair advances along the road
  rollingGap: 34, // half the distance between the two rolling cars

  // Police scanner (v5.3): at 3+ stars dispatch's scanner is live — the
  // nearest roadblock is ringed on the minimap and its distance and
  // compass bearing are read out under the radio line, so a driver can
  // plan around the cordon instead of driving into it blind.
  scannerMinStars: 3, // the scanner switches on at this wanted level
  scannerRingRadius: 26, // the pulsing ring around the scanned roadblock

  // Crew (v5/v5.1): one-time hire prices, and what each bonus is worth
  jamSeconds: 20, // how long the hacker's dispatch jam lasts
  driverTopBonus: 1.12, // +12% top speed with Mara the Driver
  driverTurnBonus: 1.15, // +15% steering with Mara the Driver
  fixerLaunderStars: 2, // Sal the Fixer drops this many stars, once a job
  fixerSpawnSlow: 1.25, // police spawn gap multiplier while Sal is hired
  fixerDecayBonus: 0.85, // wanted decay is this much faster with Sal hired

  // Crew v5.2: Dante the Wheelman. He costs the most of anyone, and he
  // earns it: once per job he brings you a fresh getaway car, and just
  // by being on the crew your cars run a little faster.
  wheelmanCost: 1000, // Dante's hire price
  wheelmanTopBonus: 1.08, // +8% top speed with Dante on the crew
  getawayTopSpeed: 700, // the getaway car's top speed

  // Crew v5.3: Ivy the Spotter. Ivy the Lookout can be promoted for a
  // second fee — once she is a Spotter, every police car and every
  // roadblock is marked on the minimap live, and the scanner shows all
  // of them instead of just the nearest one.
  spotterCost: 500, // the promotion fee, on top of Ivy's hire price
  spotterRange: 900, // the Spotter marks police out to this range

  // Police pursuit (v5.1): the PIT manoeuvre at high heat
  pitMinStars: 4, // police PIT the player from this wanted level
  pitCooldown: 6, // seconds before the same car can PIT again
  pitSpinSeconds: 1.1, // steering is locked while the car spins out
  pitDamage: 6, // health lost to a PIT spin

  // Police pursuit v5.2: at five stars the police stop trying to catch
  // you and start trying to hit you — faster pursuit, harder rams.
  ramBoostStars: 5, // the ramming behaviour switches on at this level
  ramBoostSpeed: 640, // pursuit goal speed at five stars
  ramDamage: 12, // health lost to a five-star ram (was 8)

  // Police stakeout (v5.3): at 4+ stars, or on a job's final leg, a
  // police car parks near the destination with its lights off and waits.
  // When the player comes within range it bursts out with a radio call
  // and joins the chase at full speed.
  stakeoutMinStars: 4, // stakeouts appear from this wanted level
  stakeoutAmbushRange: 260, // the player trips the ambush this close
  stakeoutBurstSpeed: 640, // the ambush burst speed
  stakeoutHoldSeconds: 25, // a stakeout stands down after this long

  // District standing (v5/v5.1): -100..+100 per district
  standingJobGain: 15, // finishing a job's step in a district
  standingCrimeLoss: 8, // committing a crime in a district
  standingPayoutScale: 200, // payout mult = 1 + standing / this
  standingDiscountDiv: 2, // crew discount = standing / this, in dollars
  standingDriftSeconds: 60, // standing drifts 1 point toward 0 this often
  jobBoardStandingNeeded: 20, // side jobs open once a district likes you
  sideJobStandingGain: 10, // finishing a side job in a district

  // Turf war (v5.2): a district flips when its standing crosses one of
  // these lines. Home turf pays a side-job bonus; hostile turf sends
  // more police, faster, and locks its job board shut.
  turfLoved: 60, // standing at or above this: the district is home turf
  turfHated: -60, // standing at or below this: the district is hostile
  turfPayoutBonus: 0.25, // home turf side jobs pay this much extra
  hostilePoliceBonus: 1, // one extra police car in a hostile district
  hostileSpawnFactor: 0.7, // police spawn gap multiplier in hostile turf
  hostileFootCops: 1, // one extra foot cop in a hostile district

  // District events (v5.3): a district can be mid-event — a street race,
  // a police raid or a blackout — for a minute or so, and the whole
  // district plays differently while it lasts.
  eventGapMin: 90, // seconds between events, at least
  eventGapMax: 150, // seconds between events, at most
  eventDurationMin: 60, // an event lasts at least this long
  eventDurationMax: 90, // and at most this long
  eventRacePayout: 0.5, // a street race pays 50% more in its district
  eventRaceSpawnFactor: 1.4, // ...and the police are busy watching it
  eventRaidSpawnFactor: 0.6, // a raid sends police much faster
  eventRaidDecayFactor: 1.5, // ...and the heat is slower to die down
  eventRaidPayout: 0.25, // a raid pays 25% more for the risk
  eventBlackoutSpawnFactor: 1.6, // a blackout: police are slow, and the
  eventBlackoutHeli: false, // helicopters are grounded in a blackout

  // Missions (v5.3: twelve story jobs)
  missionTimeLimit: 75,
  mission5Time: 75, // The Silent Partner, loosened from 60 (v5.1)
  mission5CheckpointBonus: 15, // seconds added at the halfway checkpoint
  mission9Time: 120, // The Wheelman Run's delivery leg
  mission11Time: 120, // The Scanner Job's delivery leg
  mission12Time: 150, // The Blackout finale's last leg
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
    // v5.2: turf and lockdown colours on the minimap.
    turfHome: 'rgba(90,200,60,0.22)',
    turfHostile: 'rgba(208,48,48,0.28)',
    lockdown: 'rgba(255,80,64,0.55)',
    // v5.3: the scanner ring, the heat bar and the district-event tints.
    scanner: '#ff8c2a',
    heat: '#ff7a2a',
    eventRace: 'rgba(255,210,60,0.25)',
    eventRaid: 'rgba(208,48,48,0.30)',
    eventBlackout: 'rgba(20,24,40,0.45)',
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

  // Approximate rectangles for each district, for the minimap: the turf
  // tint and the lockdown ring are drawn over these. They follow the
  // same borders as the district tests above (Palm Court is the
  // remainder, capped at y < 1800 so it does not cover Porto Verde).
  districtRects: {
    'Ocean': { x: 3020, y: 0, w: 180, h: 2400 },
    'Vice Beach': { x: 2840, y: 0, w: 180, h: 2400 },
    'Marina Bay': { x: 1400, y: 0, w: 1440, h: 1000 },
    'Old Town': { x: 0, y: 0, w: 1400, h: 1000 },
    'Porto Verde': { x: 1800, y: 1800, w: 1040, h: 600 },
    'Neon Mile': { x: 0, y: 1000, w: 1400, h: 1400 },
    'Palm Court': { x: 1400, y: 1000, w: 1440, h: 800 },
  },

  // District centres, for district events: the event banner names the
  // district, and the race crowd gathers near its centre.
  districtCentres: {
    'Old Town': { x: 700, y: 500 },
    'Marina Bay': { x: 2000, y: 500 },
    'Neon Mile': { x: 700, y: 1500 },
    'Palm Court': { x: 2000, y: 1400 },
    'Porto Verde': { x: 2300, y: 2100 },
    'Vice Beach': { x: 2900, y: 1200 },
  },
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
// centre, on the sidewalk band, never on the asphalt.
export const NOTICE_BOARDS = [
  { district: 'Old Town', x: 660, y: 938 },
  { district: 'Marina Bay', x: 1860, y: 938 },
  { district: 'Neon Mile', x: 660, y: 1338 },
  { district: 'Palm Court', x: 1860, y: 1338 },
  { district: 'Porto Verde', x: 2260, y: 2138 },
  { district: 'Vice Beach', x: 2900, y: 1338 },
];
