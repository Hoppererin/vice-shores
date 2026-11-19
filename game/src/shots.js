// The four deterministic screenshot scenes, rewritten for v5.3. Each one
// runs the real simulation forward from a fresh world with a fixed seed
// and a scripted driver, then the browser draws one frame and stops — so
// every shot is a real render of the game's own code, and the same seed
// always gives the same frame.
//
// The scripted driver steers with plain geometry: it holds the accelerator
// and nudges left or right to stay on its road. No randomness is used here
// beyond the world's own seeded stream, so the scenes are deterministic.
//
// v5.3 fixes, all three of them from the v5.2 review:
// - The chase shot ran at 25 mph because the player hit traffic in the
//   corridor: the old clearing moved cars out of the corridor once, at
//   staging, but traffic on the cross-roads drove into it during the
//   two-second run — and the roadblock at y=1650 sat right where the
//   player ended up, so the run ended in the bar. Now the corridor is
//   cleared in 0.5-second chunks around the player (a 600px bubble no
//   traffic car can cross in one chunk), and the roadblock is placed
//   AFTER the run, 200px ahead of wherever the player stopped — in
//   frame, in front of the chase, never in its way.
// - The drive shot's taxi touched a red traffic car on the overtake: the
//   same chunked clearing now runs for the drive, so no traffic car can
//   be anywhere near the taxi at any point in the run.
// - The start shot had three traffic cars stacked at the lower
//   intersection: a de-stack pass after the six-second run moves any car
//   that ended up within 60px of another to a fresh road point, so the
//   title screen's city reads clean.
//
// v5.3: free roam is job 12 of 12 now (the street shot's missionIndex
// moves from 10 to 12), and the street shot shows four crew companions —
// Mara the Driver, Sal the Fixer, Dante the Wheelman, and Ivy the
// Spotter, the new sixth member, in her gold shirt.

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

// Run in 0.5-second chunks, clearing the bubble around the player before
// each chunk. A traffic car tops out near 150 px/s and the player near
// 640 px/s, so in one chunk nothing outside a 600px bubble can reach the
// player — the corridor stays clean for the whole run, not just at
// staging. The same pass keeps pedestrians out of the road too.
function runCleared(world, seconds, driver, radius) {
  const chunks = Math.round(seconds / 0.5);
  for (let c = 0; c < chunks; c++) {
    clearNearPlayer(world, radius);
    run(world, 0.5, driver);
  }
}

// Move every traffic car and pedestrian inside a square bubble around
// the player to a fresh road point well outside the bubble. Only
// traffic and peds move — police chasers and roadblock cars are part
// of the scene and are never touched.
function clearNearPlayer(world, radius) {
  const p = world.player;
  for (const car of world.cars) {
    if (car.kind !== 'traffic') continue;
    if (Math.abs(car.x - p.x) < radius && Math.abs(car.y - p.y) < radius) {
      let spot = randomRoadPoint(world.rng, world.city);
      let guard = 0;
      while (Math.abs(spot.x - p.x) < radius + 200 && Math.abs(spot.y - p.y) < radius + 200 && guard++ < 20) {
        spot = randomRoadPoint(world.rng, world.city);
      }
      car.x = spot.x; car.y = spot.y;
    }
  }
  for (const ped of world.peds) {
    if (Math.abs(ped.x - p.x) < radius && Math.abs(ped.y - p.y) < radius) {
      let spot = randomSidewalkPoint(world.rng, world.city);
      let guard = 0;
      while (Math.abs(spot.x - p.x) < radius + 200 && Math.abs(spot.y - p.y) < radius + 200 && guard++ < 20) {
        spot = randomSidewalkPoint(world.rng, world.city);
      }
      ped.x = spot.x; ped.y = spot.y;
      ped.target = null;
    }
  }
}

// Spread any two traffic cars that ended up within 60px of each other:
// move the later one to a fresh road point, well clear of every other
// traffic car. The title screen's city reads clean instead of showing
// three cars stacked at one intersection.
function spreadTraffic(world) {
  const traffic = world.cars.filter((c) => c.kind === 'traffic');
  for (let i = 0; i < traffic.length; i++) {
    for (let j = i + 1; j < traffic.length; j++) {
      const a = traffic[i];
      const b = traffic[j];
      if (Math.abs(a.x - b.x) < 60 && Math.abs(a.y - b.y) < 60) {
        let spot = randomRoadPoint(world.rng, world.city);
        let guard = 0;
        while (traffic.some((c) => c !== b && Math.abs(c.x - spot.x) < 150 && Math.abs(c.y - spot.y) < 150) && guard++ < 30) {
          spot = randomRoadPoint(world.rng, world.city);
        }
        b.x = spot.x; b.y = spot.y;
      }
    }
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
// moving for a few seconds behind the title. v5.3: the de-stack pass
// runs after the six seconds, so no three cars sit on top of each other
// at the lower intersection.
function shotStart(world) {
  world.screen = 'title';
  run(world, 6, () => blankInput());
  spreadTraffic(world);
  world.camera.x = clamp(world.player.x, CFG.viewW / 2, CFG.worldW - CFG.viewW / 2);
  world.camera.y = clamp(world.player.y, CFG.viewH / 2, CFG.worldH - CFG.viewH / 2);
}

// Mission 1: Rico in the yellow taxi, driving north up the x=1400 road.
// v5.3: the run is chunked with the bubble cleared before each chunk, so
// the overtake is clean — no red traffic car anywhere near the taxi.
function shotDrive(world) {
  world.screen = 'play';
  startMission(world, 0);
  const taxi = world.cars.find((c) => c.kind === 'taxi');
  world.player.inCar = taxi;
  world.player.x = taxi.x;
  world.player.y = taxi.y;
  taxi.angle = -Math.PI / 2; // facing north
  say(world, 'Mama Lou: Drive it up to the Neon Mile club. No scratching the paint.');
  runCleared(world, 3, roadDriver(1400, -1), 500);
}

// Free roam on foot on the beach promenade: palms, sand, ocean, walkers.
// v5.3: Mara the Driver, Sal the Fixer, Dante the Wheelman AND Ivy the
// Spotter walk with Rico (four crew companions, gold rings), and Vice
// Beach likes him (+40 standing) so the standing bar reads green. Free
// roam is job 12 of 12 now.
function shotStreet(world) {
  world.screen = 'play';
  world.missionIndex = 12; // free roam (twelve story jobs in v5.3)
  world.missionStep = 0;
  world.player.inCar = null;
  world.player.x = 2900;
  world.player.y = 1180;
  world.player.angle = Math.PI / 2;
  world.crew.driver = true;
  world.crew.fixer = true;
  world.crew.wheelman = true;
  world.crew.lookout = true;
  world.crew.spotter = true;
  world.standing['Vice Beach'] = 40;
  // A few extra walkers strolling the promenade.
  for (let n = 0; n < 6; n++) {
    const p = makePed(2860 + n * 22, 1020 + n * 55, world.rng);
    world.peds.push(p);
  }
  // Mara, walking just behind Rico, Sal the Fixer beside her, Dante the
  // Wheelman on the far side, and Ivy the Spotter in her gold shirt —
  // four gold rings on the promenade.
  const mara = makePed(2868, 1230, world.rng);
  mara.shirt = '#d03030';
  mara.crew = 'driver';
  world.companions.push(mara);
  const sal = makePed(2932, 1230, world.rng);
  sal.shirt = '#3a7a5a';
  sal.crew = 'fixer';
  world.companions.push(sal);
  const dante = makePed(2900, 1290, world.rng);
  dante.shirt = '#6a3a8a';
  dante.crew = 'wheelman';
  world.companions.push(dante);
  const ivy = makePed(2868, 1290, world.rng);
  ivy.shirt = '#ffd23c';
  ivy.crew = 'lookout';
  world.companions.push(ivy);
  run(world, 3, () => blankInput());
}

// Mission 3: three wanted stars, Rico in the white sports car doing ~58 mph
// down the x=1400 road, two police cars chasing behind him. v5.1: dispatch
// has a roadblock waiting further down the road with a flare burning over
// it, and Air-1 hovers offset up-left — its spotlight beam crosses the
// frame to the player instead of sitting on top of the chase. The shot
// shows the whole wanted system at once. v5.2: the roadblock label draws
// below the bar when the bar sits near the bottom of the frame, clear of
// Mama Lou's dialogue box. v5.3: the corridor is cleared in chunks
// (no traffic can reach the player mid-run), and the roadblock is placed
// AFTER the run, 260px ahead of wherever the player stopped — in frame,
// in front of the chase, never in its way.
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
  // The helicopter is overhead. The helicopter starts offset up-left of
  // the player (its v5.1 hover position), and the roadblock lights its
  // own flare when placed.
  world.heli = { x: 1250, y: 350, active: true };
  world.heliLocked = true; // keep Air-1 in the shot even at 3 stars
  // No dispatch roadblock mid-shot: the player would breach it, gain a
  // fourth star, get PITted and crawl — the v5.1 staging run ended at
  // 19 mph with the roadblock off-frame and a chaser trimmed away.
  world.dispatch.cooldown = 999;
  radio(world, 'DISPATCH: Roadblock set ahead — suspect vehicle, do not let them through.');
  say(world, 'Mama Lou: Do not get busted. I am not bailing you out twice.');
  // Drive south for two seconds in chunks, the bubble cleared before
  // each one: the sports car tops out near 58 mph, and no traffic car
  // can reach the corridor mid-run.
  runCleared(world, 2, roadDriver(1400, 1), 600);
  // Stage the roadblock AFTER the run, 200px ahead of the player: it is
  // in frame at the bottom, with its flare lit, and the player never
  // touches it. 200px puts the bar at screen y ~560, clear of the
  // dialogue box (612-646) — at 260px the bar sat behind the box and
  // only its label showed. Then stage Air-1 at its proper offset for
  // the final frame: the helicopter eases toward the player and cannot
  // keep up with a car at full speed, so without this it trails off the
  // top of the frame.
  spawnRoadblockAt(world, 1400, world.player.y + 200, Math.PI / 2);
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
