// The four deterministic screenshot scenes, rewritten for v5.1. Each one
// runs the real simulation forward from a fresh world with a fixed seed
// and a scripted driver, then the browser draws one frame and stops — so
// every shot is a real render of the game's own code, and the same seed
// always gives the same frame.
//
// The scripted driver steers with plain geometry: it holds the accelerator
// and nudges left or right to stay on its road. No randomness is used here
// beyond the world's own seeded stream, so the scenes are deterministic.
//
// v5.1: free roam is job 8 of 8 now (the street shot's missionIndex moves
// from 6 to 8), the street shot shows two crew companions — Mara the
// Driver and Sal the Fixer, the new fourth member — and the chase shot's
// helicopter starts offset up-left of the player, so the spotlight beam
// reads as a beam instead of a puddle on top of the police cars.

import { CFG } from './config.js';
import { clamp } from './random.js';
import { stepWorld } from './world.js';
import { makeCar, makePed } from './entities.js';
import { startMission, say } from './missions.js';
import { blankInput } from './input.js';
import { randomRoadPoint, randomSidewalkPoint } from './city.js';
import { spawnRoadblockAt, radio } from './dispatch.js';

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
  // Clear the drive corridor (the x=1400 road, y 1000-2100) of traffic and
  // pedestrians, so the run is a clean drive north, not a traffic jam at
  // the first intersection — the same clearing the chase shot uses.
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    if (Math.abs(car.x - 1400) < 140 && car.y > 1000 && car.y < 2100) {
      let spot = randomRoadPoint(world.rng, world.city);
      let guard = 0;
      while (Math.abs(spot.x - 1400) < 300 && guard++ < 20) spot = randomRoadPoint(world.rng, world.city);
      car.x = spot.x; car.y = spot.y;
    }
  }
  for (const ped of world.peds) {
    if (Math.abs(ped.x - 1400) < 110 && ped.y > 1000 && ped.y < 2100) {
      let spot = randomSidewalkPoint(world.rng, world.city);
      let guard = 0;
      while (Math.abs(spot.x - 1400) < 300 && guard++ < 20) spot = randomSidewalkPoint(world.rng, world.city);
      ped.x = spot.x; ped.y = spot.y;
      ped.target = null;
    }
  }
  run(world, 3, roadDriver(1400, -1));
}

// Free roam on foot on the beach promenade: palms, sand, ocean, walkers.
// v5.1: Mara the Driver AND Sal the Fixer walk with Rico (two crew
// companions, gold rings), and Vice Beach likes him (+40 standing) so
// the standing bar reads green.
function shotStreet(world) {
  world.screen = 'play';
  world.missionIndex = 8; // free roam (eight story jobs in v5.1)
  world.missionStep = 0;
  world.player.inCar = null;
  world.player.x = 2900;
  world.player.y = 1180;
  world.player.angle = Math.PI / 2;
  world.crew.driver = true;
  world.crew.fixer = true;
  world.standing['Vice Beach'] = 40;
  // A few extra walkers strolling the promenade.
  for (let n = 0; n < 6; n++) {
    const p = makePed(2860 + n * 22, 1020 + n * 55, world.rng);
    world.peds.push(p);
  }
  // Mara, walking just behind Rico, and Sal the Fixer beside her.
  const mara = makePed(2868, 1230, world.rng);
  mara.shirt = '#d03030';
  mara.crew = 'driver';
  world.companions.push(mara);
  const sal = makePed(2932, 1230, world.rng);
  sal.shirt = '#3a7a5a';
  sal.crew = 'fixer';
  world.companions.push(sal);
  run(world, 3, () => blankInput());
}

// Mission 3: three wanted stars, Rico in the white sports car doing ~58 mph
// down the x=1400 road, two police cars chasing behind him. v5.1: dispatch
// has a roadblock waiting further down the road with a flare burning over
// it, and Air-1 hovers offset up-left — its spotlight beam crosses the
// frame to the player instead of sitting on top of the chase. The shot
// shows the whole wanted system at once.
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
  // v5: a roadblock waits at y=1650 on the same road — just inside the
  // frame at the end of the run, the player stopping short of it — and
  // the helicopter is overhead. v5.1: the helicopter starts offset
  // up-left of the player (its v5.1 hover position), and the roadblock
  // lights its own flare when placed.
  spawnRoadblockAt(world, 1400, 1650, Math.PI / 2);
  world.heli = { x: 1250, y: 350, active: true };
  world.heliLocked = true; // keep Air-1 in the shot even at 3 stars
  // No dispatch roadblock mid-shot: the player would breach it, gain a
  // fourth star, get PITted and crawl — the v5.1 staging run ended at
  // 19 mph with the roadblock off-frame and a chaser trimmed away.
  world.dispatch.cooldown = 999;
  radio(world, 'DISPATCH: Roadblock set ahead — suspect vehicle, do not let them through.');
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
  // Drive south for two seconds: the sports car tops out near 58 mph,
  // stops just short of the roadblock at y=2100, and both chasers plus
  // the helicopter stay in frame.
  run(world, 2, roadDriver(1400, 1));
  // Stage Air-1 at its proper offset for the final frame: the helicopter
  // eases toward the player and cannot keep up with a car at full speed,
  // so without this it trails off the top of the frame.
  if (world.heli) {
    world.heli.x = world.player.x + CFG.heliOffsetX;
    world.heli.y = world.player.y + CFG.heliOffsetY;
  }
  // The wanted system may have spawned a third patrol car far away; keep
  // exactly the two chasers in frame for a clean shot — plus the
  // roadblock cars, which are part of the scene.
  const keep = new Set([cop1, cop2]);
  world.police = world.police.filter((c) => keep.has(c));
  world.cars = world.cars.filter((c) => c.kind !== 'police' || keep.has(c) || c.block);
}
