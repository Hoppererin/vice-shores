// The world: one state object and one fixed-step function tying the city,
// the player, the traffic, the police and the missions together. This module
// never touches the DOM, so Node can import it for smoke tests.

import { CFG } from './config.js';
import { mulberry32, clamp, dist } from './random.js';
import { buildCity, collideBuildings, districtAt } from './city.js';
import {
  makePlayer, makeTaxi, makeSportsCar, spawnTraffic, spawnParked,
  spawnPeds, stepTrafficCar, stepPed, stepDrivenCar, collideCars, nearestCar,
} from './entities.js';
import { addCrime, updateWanted, stepPoliceCar, stepFootCop, resetAfterArrest } from './police.js';
import { currentMission, updateMissions, startMission, retryMission, say } from './missions.js';

// Build a fresh world. opts: { cash, missionIndex, jobsDone } restores a save.
export function createWorld(seed = 7, opts = {}) {
  const rng = mulberry32(seed);
  const city = buildCity(rng);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    screen: 'title', // title | play | pause | busted | wasted
    player: makePlayer(1350, 2000),
    cars: [],
    peds: [],
    police: [],
    footCops: [],
    wanted: 0,
    crimeTimer: 0,
    missionIndex: opts.missionIndex || 0,
    missionStep: 0,
    missionTimer: 0,
    missionFailed: false,
    jobsDone: opts.jobsDone || 0,
    dialogue: null,
    dialogueQueue: [],
    camera: { x: 1350, y: 2000 },
    district: 'Neon Mile',
    saveTimer: 0,
    events: freshEvents(),
  };
  world.player.cash = opts.cash || 0;

  world.cars.push(...spawnTraffic(world));
  world.cars.push(...spawnParked(world));
  world.cars.push(makeTaxi(1400, 2000, rng));
  world.cars.push(makeSportsCar(2200, 1400, rng));
  world.peds = spawnPeds(world);
  world.district = districtAt(world.player.x, world.player.y);
  return world;
}

function freshEvents() {
  return {
    crime: false, cash: 0, stepDone: false, missionStart: false,
    missionFailed: false, wantedDown: false, rammed: false, busted: false,
    punch: false, crash: false, pickup: false, enteredCar: false,
  };
}

// One fixed step (dt seconds, normally 1/60).
export function stepWorld(world, input, dt) {
  world.time += dt;
  const player = world.player;

  // The city lives even on the title screen: traffic and pedestrians move.
  for (const car of world.cars) {
    if (car.kind === 'traffic') stepTrafficCar(world, car, dt);
  }
  for (const ped of world.peds) stepPed(world, ped, dt);

  if (world.screen !== 'play') {
    updateCamera(world);
    return;
  }

  // --- player ------------------------------------------------------------
  if (player.punchCooldown > 0) player.punchCooldown -= dt;

  if (player.inCar) {
    stepPlayerCar(world, input, dt);
  } else {
    stepPlayerOnFoot(world, input, dt);
  }

  // --- collisions between cars ------------------------------------------
  // Police cars are excluded: their contact with the player is the ram in
  // stepPoliceCar (damage + slowdown on a cooldown). Letting the generic
  // bumper drag run on a chasing cop would grind both cars to a halt while
  // it rides the player's bumper.
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    if (cars[i].kind === 'police') continue;
    for (let j = i + 1; j < cars.length; j++) {
      if (cars[j].kind === 'police') continue;
      collideCars(cars[i], cars[j]);
    }
  }

  // --- the player car vs pedestrians ------------------------------------
  if (player.inCar && Math.abs(player.inCar.speed) > 200) {
    for (const ped of world.peds) {
      if (ped.downTimer > 0) continue;
      if (dist(ped.x, ped.y, player.inCar.x, player.inCar.y) < 26) {
        ped.downTimer = 5;
        addCrime(world, 1);
        world.events.crash = true;
        say(world, 'Mama Lou: Watch the pedestrians, Rico. The cops saw that.');
      }
    }
    for (const cop of world.footCops) {
      if (cop.downTimer > 0) continue;
      if (dist(cop.x, cop.y, player.inCar.x, player.inCar.y) < 26) {
        cop.downTimer = 5;
        addCrime(world, 1);
        world.events.crash = true;
      }
    }
  }

  // --- police and missions ----------------------------------------------
  updateWanted(world, dt);
  for (const car of world.police) stepPoliceCar(world, car, dt);
  for (const cop of world.footCops) stepFootCop(world, cop, dt);
  updateMissions(world, dt);

  // --- health, dialogue, camera ------------------------------------------
  if (player.health <= 0) {
    player.health = 0;
    world.screen = 'wasted';
  }
  if (world.dialogue && world.time > world.dialogue.until) {
    world.dialogue = world.dialogueQueue.length
      ? { text: world.dialogueQueue.shift(), until: world.time + 6 }
      : null;
  }
  world.district = districtAt(player.x, player.y);
  updateCamera(world);
}

// On foot: WASD/arrows, Shift to run, E to enter a car, F to punch.
function stepPlayerOnFoot(world, input, dt) {
  const player = world.player;
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    const speed = input.run ? CFG.runSpeed : CFG.walkSpeed;
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
    player.angle = Math.atan2(dy, dx);
    player.walkPhase += dt * (input.run ? 13 : 9);
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  player.x = clamp(player.x, 24, CFG.worldW - 24);
  player.y = clamp(player.y, 24, CFG.worldH - 24);
  collideBuildings(world.city, player, CFG.playerRadius);

  if (input.enter) { input.enter = false; tryEnterCar(world); }
  if (input.punch) { input.punch = false; tryPunch(world); }
}

// Driving: the car answers to W/S and steering, E steps out.
function stepPlayerCar(world, input, dt) {
  const player = world.player;
  const car = player.inCar;
  const result = stepDrivenCar(world, car, input, dt);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;
  if (result === 'crash') {
    world.events.crash = true;
    if (car.hitCooldown <= 0) {
      player.health -= 5;
      car.hitCooldown = 1.0;
    }
  }
  if (car.hitCooldown > 0) car.hitCooldown -= dt;
  if (input.enter) { input.enter = false; exitCar(world); }
}

// E near a car: climb in. Stealing a parked car or yanking a driver out is
// a crime. The taxi and the sports car are mission cars, not traffic.
function tryEnterCar(world) {
  const player = world.player;
  const car = nearestCar(world, player.x, player.y, 46);
  if (!car) return;
  if (car.driver) {
    // Yank the driver out: they become a pedestrian, on foot and annoyed.
    car.driver = false;
    const driver = {
      x: car.x + 30, y: car.y + 30, angle: 0, speed: 0,
      target: null, downTimer: 0, fleeing: false,
      shirt: '#c0c0c0', skin: '#e8b88a', walkPhase: 0, cop: false,
    };
    world.peds.push(driver);
  }
  addCrime(world, 1);
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  world.events.enteredCar = true;
  world.events.pickup = true;
}

// E while driving: step out to the car's left side.
function exitCar(world) {
  const player = world.player;
  const car = player.inCar;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * (car.wid / 2 + 16);
  player.y = car.y + Math.sin(side) * (car.wid / 2 + 16);
  player.x = clamp(player.x, 24, CFG.worldW - 24);
  player.y = clamp(player.y, 24, CFG.worldH - 24);
  collideBuildings(world.city, player, CFG.playerRadius);
  player.inCar = null;
  player.speed = 0;
}

// F: punch the nearest person in front of the player.
function tryPunch(world) {
  const player = world.player;
  if (player.punchCooldown > 0) return;
  player.punchCooldown = 0.45;
  player.punchTimer = 0.25;
  world.events.punch = true;
  const reach = 46;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  const targets = [...world.peds, ...world.footCops];
  for (const t of targets) {
    if (t.downTimer > 0) continue;
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > reach) continue;
    if ((dx * fx + dy * fy) / (d || 1) < 0.3) continue; // must be roughly ahead
    t.downTimer = 4;
    addCrime(world, t.cop ? 2 : 1);
    return;
  }
}

// Camera follows the player (or their car), clamped to the world.
function updateCamera(world) {
  const p = world.player;
  world.camera.x = clamp(p.x, CFG.viewW / 2, CFG.worldW - CFG.viewW / 2);
  world.camera.y = clamp(p.y, CFG.viewH / 2, CFG.worldH - CFG.viewH / 2);
}

// Snapshot for the save file (localStorage), restored by createWorld opts.
export function saveSnapshot(world) {
  return {
    cash: world.player.cash,
    missionIndex: world.missionIndex,
    jobsDone: world.jobsDone,
  };
}

// Busted / wasted retry: same as the police module's reset, re-exported
// here so callers only import from world.js.
export function retryAfterArrest(world) {
  resetAfterArrest(world);
}

// Retry the failed timed delivery.
export function retryFailedMission(world) {
  retryMission(world);
}

// Queue a dialogue line behind the one showing (missions.js uses say()).
export function queueDialogue(world, text) {
  if (!world.dialogue) {
    world.dialogue = { text, until: world.time + 6 };
  } else {
    world.dialogueQueue.push(text);
  }
}
