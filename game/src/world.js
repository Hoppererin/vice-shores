// The world state and the one fixed-step function tying the systems
// together. Everything the game does each tick flows through stepWorld:
// input -> player -> traffic -> pedestrians -> police -> missions -> save.

import { WORLD_W, WORLD_H, PLAYER, SAVE_KEY, SAVE_EVERY_S, TRAFFIC_COUNT, PED_COUNT } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { buildCity, randomRoadPoint, randomSidewalkPoint, nearestNode } from './city.js';
import {
  makeCar, makePedestrian, makePlayer,
  stepPlayerOnFoot, stepPlayerCar, stepTrafficCar, stepPedestrian, knockDown,
} from './entities.js';
import { stepPolice, addWanted, clearPolice } from './police.js';
import { startMission, stepMission, onEnterCar, currentMission } from './missions.js';

export function createWorld(seed) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const world = {
    seed,
    rng,
    city,
    cityW: WORLD_W,
    cityH: WORLD_H,
    time: 0,
    state: 'title',           // title | play | pause | busted | wasted
    player: makePlayer(1200, 1960),
    cars: [],
    peds: [],
    policeCars: [],
    footCops: [],
    wanted: 0,
    wantedTimer: 0,
    ramCooldown: 0,
    lastCrimeAt: -100,
    missionIndex: 0,
    missionStep: 0,
    missionTimer: 0,
    missionFailed: false,
    jobsDone: 0,
    dialogue: [],
    dialogueTimer: 0,
    dialogueLine: 0,
    events: [],
    saveDue: false,
    saveTimer: 0,
    camera: { x: 1200, y: 1960 },
    // Mission cars, kept as references so missions can find them.
    taxi: null,
    sportsCar: null,
  };

  // The mission taxi by the plaza (parked on the road just east of it, so
  // driving off is down a clear road) and the white sports car in the mall lot.
  world.taxi = makeCar(1400, 2000, -Math.PI / 2, 'taxi', null);
  world.sportsCar = makeCar(2200, 1400, Math.PI, 'sports', null);
  world.cars.push(world.taxi, world.sportsCar);

  // Traffic: seeded models on the road graph, spread across the city.
  const models = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'sports', 'pickup'];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const spot = randomRoadPoint(city, rng);
    const car = makeCar(spot.x, spot.y, rng.range(0, Math.PI * 2), models[i % models.length], 'traffic');
    car.node = nearestNode(city, spot.x, spot.y);
    car.prevNode = car.node;
    world.cars.push(car);
  }

  // Pedestrians on the sidewalks.
  for (let i = 0; i < PED_COUNT; i++) {
    const spot = randomSidewalkPoint(city, rng);
    world.peds.push(makePedestrian(spot.x, spot.y, rng));
  }

  return world;
}

// --- Entering / exiting cars ---------------------------------------------

export function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function tryEnterCar(world) {
  const p = world.player;
  if (p.car) return false;
  const car = nearestCar(world, p.x, p.y, PLAYER.enterRange);
  if (!car) return false;
  if (car.driver === 'traffic') {
    // Yanking a driver out is a crime; the driver becomes a pedestrian.
    addWanted(world, 1);
    world.events.push({ type: 'punch' });
    const driver = makePedestrian(car.x + 30, car.y, world.rng);
    world.peds.push(driver);
  } else if (car.driver === null) {
    // Taking a parked car is a crime too.
    addWanted(world, 1);
  } else if (car.driver === 'police') {
    return false;
  }
  car.driver = 'player';
  car.playerCar = true;
  car.node = -1;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  onEnterCar(world, car);
  return true;
}

export function exitCar(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.playerCar = false;
  car.speed = 0;
  // Step out to the car's left side.
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 30;
  p.y = car.y + Math.sin(side) * 30;
  p.car = null;
}

// --- Punching --------------------------------------------------------------

export function tryPunch(world) {
  const p = world.player;
  if (p.car || p.punchTimer > 0) return;
  p.punchTimer = PLAYER.punchCooldown;
  p.punchAnim = 0.25;
  world.events.push({ type: 'punch' });
  const reach = PLAYER.punchRange;
  const fx = p.x + Math.cos(p.angle) * 26;
  const fy = p.y + Math.sin(p.angle) * 26;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (dist(fx, fy, ped.x, ped.y) < reach) {
      knockDown(ped, 5);
      addWanted(world, 1);
      return;
    }
  }
  for (const cop of world.footCops) {
    if (dist(fx, fy, cop.x, cop.y) < reach + 6) {
      addWanted(world, 2);
      cop.holdTimer = 0;
      cop.x += Math.cos(p.angle) * 60;
      cop.y += Math.sin(p.angle) * 60;
      return;
    }
  }
}

// --- Car vs car ------------------------------------------------------------

function stepCarCollisions(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.model.len + b.model.len) * 0.32;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const aFast = Math.abs(a.speed) > 120;
      const bFast = Math.abs(b.speed) > 120;
      if (aFast || bFast) {
        a.speed *= 0.55;
        b.speed *= 0.55;
        world.events.push({ type: 'crash' });
      }
    }
  }
}

// A fast player car knocking a pedestrian down is a crime.
function stepCarVsPeds(world) {
  const car = world.player.car;
  if (!car || Math.abs(car.speed) < 200) return;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 30) {
      knockDown(ped, 6);
      addWanted(world, 1);
    }
  }
}

// --- The fixed step ---------------------------------------------------------

export function stepWorld(world, input, dt) {
  world.time += dt;
  world.events = [];

  if (world.state !== 'play') return;

  // One-shot actions.
  if (input.wasPressed('KeyE')) {
    if (world.player.car) exitCar(world);
    else tryEnterCar(world);
  }
  if (input.wasPressed('KeyF')) tryPunch(world);

  // Player.
  if (world.player.car) stepPlayerCar(world, dt, input);
  else stepPlayerOnFoot(world, dt, input);

  // Traffic: only cars whose driver is 'traffic'. The player's car is
  // never stepped here, and police cars have their own chase step.
  for (const car of world.cars) {
    if (car.driver === 'traffic') stepTrafficCar(world, car, dt);
  }
  stepCarCollisions(world);
  stepCarVsPeds(world);

  for (const ped of world.peds) stepPedestrian(world, ped, dt);
  stepPolice(world, dt);

  // Missions.
  const result = stepMission(world, dt);
  if (result === 'failed') {
    // Retry the same job with ENTER; handled by main.
  }

  // Dialogue advances on its own clock (one line per 3.2 s).
  if (world.dialogue.length > 0) {
    world.dialogueTimer += dt;
    if (world.dialogueTimer > 3.2) {
      world.dialogueTimer = 0;
      world.dialogueLine++;
      if (world.dialogueLine >= world.dialogue.length) {
        world.dialogue = [];
        world.dialogueLine = 0;
      }
    }
  }

  // Camera follows the player, clamped to the world.
  const p = world.player;
  world.camera.x = clamp(p.x - 640, 0, WORLD_W - 1280);
  world.camera.y = clamp(p.y - 360, 0, WORLD_H - 720);

  // Autosave: on job completion and every SAVE_EVERY_S seconds.
  world.saveTimer += dt;
  if (world.saveDue || world.saveTimer >= SAVE_EVERY_S) {
    world.saveDue = false;
    world.saveTimer = 0;
    saveGame(world);
  }
}

// --- Save / load ------------------------------------------------------------

export function saveGame(world) {
  if (world.noSave) return false;
  if (typeof localStorage === 'undefined') return false;
  try {
    const data = {
      cash: world.player.cash,
      missionIndex: world.missionIndex,
      jobsDone: world.jobsDone,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(world, save) {
  if (!save) return;
  world.player.cash = save.cash || 0;
  world.jobsDone = save.jobsDone || 0;
  const index = Math.min(save.missionIndex || 0, 3);
  startMission(world, index);
  world.dialogue = ['Mama Lou: Back at it, Rico. Pick up where you left off.'];
  world.dialogueTimer = 0;
}

export function missionTitle(world) {
  const m = currentMission(world);
  return m ? m.title : 'Free Roam';
}
