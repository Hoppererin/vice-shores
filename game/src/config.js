// Vice Shores — all tuning numbers, palette, districts and the save key.
// One place to tune the game; no other module hard-codes these values.

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const VIEW_W = 1280;
export const VIEW_H = 720;

export const ROAD_XS = [200, 600, 1000, 1400, 1800, 2200, 2600];
export const ROAD_YS = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_W = 96;
export const SIDEWALK = 26;

export const BEACH_X = 2840;   // sand starts here; no buildings east of it
export const OCEAN_X = 3020;   // water starts here

export const PARK = { x: 1430, y: 1030, w: 340, h: 340 };
export const PLAZA = { x: 1030, y: 1830, w: 340, h: 340 };

export const SAVE_KEY = 'vice-shores.save.v1';
export const SAVE_EVERY_S = 20;

export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 265,
  radius: 13,
  health: 100,
  enterRange: 46,
  punchRange: 42,
  punchDamage: 34,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 420,
  topSpeed: 540,
  sportsTop: 640,
  reverseMax: 160,
  brake: 700,
  drag: 0.55,
  turnRate: 2.6,
  length: 46,
  width: 22,
};

export const TRAFFIC_COUNT = 14;
export const TRAFFIC_SPEED = 150;
export const PED_COUNT = 42;
export const PED_SPEED = 62;
export const PED_FLEE_SPEED = 150;

export const WANTED_DECAY_S = 26;
export const MAX_POLICE_CARS = 4;
export const BUST_HOLD_S = 1.4;
export const COP_GRAB_RANGE = 26;

export const COLORS = {
  grass: '#6fae56',
  grassDark: '#639c4d',
  road: '#2b2f38',
  roadEdge: '#3a3f4b',
  sidewalk: '#b9b3a4',
  lane: '#e8c832',
  sand: '#e6cf9a',
  ocean: '#2f7fa8',
  oceanDeep: '#2a6f96',
  buildingSide: '#00000055',
  park: '#5da24a',
  plaza: '#c9c2b2',
  pond: '#7ec3e8',
  fountain: '#8fd0f0',
  hudBg: 'rgba(10,12,18,0.72)',
  hudGold: '#ffd23e',
  hudText: '#f2f2ea',
  hudMuted: '#c8c8bc',
  starOn: '#ffd23e',
  starOff: '#5a5f6e',
  marker: '#ffd23e',
  police: '#2f6fd0',
  taxi: '#f7c531',
  sports: '#f2f2f0',
};

export const BUILDING_COLORS = [
  '#c96a4a', '#d98a4b', '#7fa3c9', '#c97f9a', '#8fae7a',
  '#c9b458', '#9a7fc9', '#6aa39a', '#b0524f', '#d9a06a',
];

export const DISTRICTS = [
  { name: 'Porto Verde', x0: 0, y0: 0, x1: 1000, y1: 1000 },
  { name: 'Old Town', x0: 1000, y0: 0, x1: 2000, y1: 1000 },
  { name: 'Neon Mile', x0: 0, y0: 1000, x1: 1000, y1: 2400 },
  { name: 'Marina Bay', x0: 1000, y0: 1000, x1: 2200, y1: 2400 },
  { name: 'Palm Court', x0: 2200, y0: 0, x1: 2840, y1: 2400 },
];

export const MISSION_REWARDS = [150, 300, 500, 1000];
