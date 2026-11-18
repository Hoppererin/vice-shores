// The four deterministic screenshot scenes. Each one runs the real
// simulation forward from a fresh world with a fixed seed and a scripted
// driver, then the browser draws one frame and stops — so every shot is a
// real render of the game's own code, and the same seed always gives the
// same frame.
//
// The scripted driver steers with plain geometry: it holds the accelerator
// and nudges left or right to stay on its road. No randomness is used here
// beyond the world's own seeded stream, so the scenes are deterministic.

import { CFG } from './config.js';
import { clamp } from './random.js';
import { stepWorld } from './world.js';
import { makeCar, makePed } from './entities.js';
import { startMission, say } from './missions.js';
import { blankInput } from './input.js';
import { randomRoadPoint, randomSidewalkPoint } from './city.js';

const DT = 1 / 60;

// Run n fixed steps with the driver function supplying each step's input.
function run(world, seconds, driver) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    stepWorld(world, driver(world, i) || blankInput(), DT);
  }
}

// Stay on a vertical road at roadX while driving: steer toward the line.
// heading: -1 driving north, +1 driving south (steering flips with it).
function roadDriver(roadX, heading) {
  return (world) => {
    const car = world.player.inCar;
    if (!car) return blankInput();
    const dx = car.x - roadX;
    const needLeft = heading < 0 ? dx > 6 : dx < -6;
    const needRight = heading < 0 ? dx < -6 : dx > 6;
    return {
      ...blankInput(),
      up: true,
      left: needLeft,
      right: needRight,
    };
  };
}

export function applyShot(world, name) {
  switch (name) {
    case 'start': return shotStart(world);
    case 'drive': return shotDrive(world);
    case 'street': return shotStreet(world);
    case 'chase': return shotChase(world);
    default: return shotStart(world);
  }
}

// Title screen over the living city: traffic and pedestrians have been
// moving for a few seconds behind the title.
function shotStart(world) {
  world.screen = 'title';
  run(world, 6, () => blankInput());
  world.camera.x = clamp(world.player.x, CFG.viewW / 2, CFG.worldW - CFG.viewW / 2);
  world.camera.y = clamp(world.player.y, CFG.viewH / 2, CFG.worldH - CFG.viewH / 2);
}

// Mission 1: Rico in the yellow taxi, driving north up the x=1400 road.
function shotDrive(world) {
  world.screen = 'play';
  startMission(world, 0);
  const taxi = world.cars.find((c) => c.kind === 'taxi');
  world.player.inCar = taxi;
  world.player.x = taxi.x;
  world.player.y = taxi.y;
  taxi.angle = -Math.PI / 2; // facing north
  say(world, 'Mama Lou: Drive it up to the Neon Mile club. No scratching the paint.');
  run(world, 3, roadDriver(1400, -1));
}

// Free roam on foot on the beach promenade: palms, sand, ocean, walkers.
function shotStreet(world) {
  world.screen = 'play';
  world.missionIndex = 4; // free roam
  world.missionStep = 0;
  world.player.inCar = null;
  world.player.x = 2900;
  world.player.y = 1180;
  world.player.angle = Math.PI / 2;
  // A few extra walkers strolling the promenade.
  for (let n = 0; n < 6; n++) {
    const p = makePed(2860 + n * 22, 1020 + n * 55, world.rng);
    world.peds.push(p);
  }
  run(world, 3, () => blankInput());
}

// Mission 3: three wanted stars, Rico in the white sports car doing ~58 mph
// down the x=1400 road, two police cars chasing behind him.
function shotChase(world) {
  world.screen = 'play';
  startMission(world, 2);
  world.wanted = 3;
  const sports = world.cars.find((c) => c.kind === 'sports');
  sports.x = 1400;
  sports.y = 600;
  sports.angle = Math.PI / 2; // facing south, down the road
  sports.speed = 0;
  world.player.inCar = sports;
  world.player.x = sports.x;
  world.player.y = sports.y;
  // Two police cars right behind him, already in pursuit.
  const cop1 = makeCar('police', 1392, 480, Math.PI / 2, 'police', world.rng);
  const cop2 = makeCar('police', 1416, 540, Math.PI / 2, 'police', world.rng);
  cop1.speed = 480;
  cop2.speed = 500;
  world.police.push(cop1, cop2);
  world.cars.push(cop1, cop2);
  // Clear the chase corridor (the x=1400 road, y 200-2300) of traffic and
  // pedestrians, so the run is a clean high-speed chase, not a traffic jam
  // — and nobody wanders into the road and raises the wanted level mid-shot.
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    if (Math.abs(car.x - 1400) < 140 && car.y > 200 && car.y < 2300) {
      let spot = randomRoadPoint(world.rng, world.city);
      let guard = 0;
      while (Math.abs(spot.x - 1400) < 300 && guard++ < 20) spot = randomRoadPoint(world.rng, world.city);
      car.x = spot.x; car.y = spot.y;
    }
  }
  for (const ped of world.peds) {
    if (Math.abs(ped.x - 1400) < 110 && ped.y > 200 && ped.y < 2300) {
      let spot = randomSidewalkPoint(world.rng, world.city);
      let guard = 0;
      while (Math.abs(spot.x - 1400) < 300 && guard++ < 20) spot = randomSidewalkPoint(world.rng, world.city);
      ped.x = spot.x; ped.y = spot.y;
      ped.target = null;
    }
  }
  say(world, 'Mama Lou: Do not get busted. I am not bailing you out twice.');
  // Drive south for two and a half seconds: the sports car tops out near
  // 58 mph, stays inside the city, and both chasers stay in frame.
  run(world, 2.5, roadDriver(1400, 1));
  // The wanted system may have spawned a third patrol car far away; keep
  // exactly the two chasers in frame for a clean shot.
  const keep = new Set([cop1, cop2]);
  world.police = world.police.filter((c) => keep.has(c));
  world.cars = world.cars.filter((c) => c.kind !== 'police' || keep.has(c));
}
