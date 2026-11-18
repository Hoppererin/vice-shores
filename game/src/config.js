// Vice Shores — every tuning number, colour and place name in one place.
// The world is a fixed 3200 x 2400 px city; the renderer shows it through a
// 1280 x 720 logical canvas that scales to the window, so no rule here
// depends on the screen size.
export const WORLD = { width: 3200, height: 2400 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'vice-shores.save.v1';

// Roads: vertical lines at these x, horizontal lines at these y.
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_W = 96; // asphalt width
export const WALK_W = 26; // sidewalk strip on each side of a road

export const BEACH_X = 2840; // sand starts here
export const OCEAN_X = 3020; // water starts here
export const PARK = { x: 1430, y: 1030, w: 340, h: 340 };
export const PLAZA = { x: 1030, y: 1830, w: 340, h: 340 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  punchRange: 38,
  punchArc: 1.1,
  health: 100,
};

export const CAR = {
  accel: 420,
  brake: 620,
  maxReverse: 160,
  topSpeed: 540,
  sportsTopSpeed: 640,
  turnRate: 2.6,
  radius: 17,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 42;
export const TRAFFIC_SPEED = 150;
export const PED_SPEED = 55;
export const PED_FLEE_SPEED = 135;

export const WANTED_DECAY_SECONDS = 26;
export const MAX_POLICE_CARS = 4;
export const BUST_HOLD_SECONDS = 1.4;
export const AUTOSAVE_SECONDS = 20;

export const MISSION_TIMER = 75; // seconds for the timed delivery

export const DISTRICTS = [
  { name: 'Porto Verde', x: 0, y: 0, w: 1150, h: 1150 },
  { name: 'Old Town', x: 1150, y: 0, w: 1150, h: 1150 },
  { name: 'Neon Mile', x: 0, y: 1150, w: 1150, h: 1250 },
  { name: 'Marina Bay', x: 2300, y: 0, w: 540, h: 1150 },
  { name: 'Palm Court', x: 1150, y: 1150, w: 1690, h: 1250 },
];

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a258',
  sand: '#e8d39a',
  ocean: '#2f7fc4',
  oceanDeep: '#256aa8',
  road: '#3c3f46',
  roadLine: '#e8d44d',
  sidewalk: '#9aa0a8',
  plaza: '#b9b3a4',
  park: '#5f9e4e',
  pond: '#4d9ec9',
  buildingSide: 'rgba(0,0,0,0.28)',
  roofs: ['#e07856', '#e8a34c', '#7fb3d5', '#c98bb0', '#8fc97f', '#d5c06a', '#9a8fd0', '#e08a7a'],
  tree: '#3f7d3a',
  treeLight: '#57a04e',
  palm: '#4c9a4a',
};
