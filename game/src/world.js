// The world state and the one fixed-step function tying the systems
// together: the player on foot or in a car, traffic, pedestrians, police,
// missions and the camera. No drawing and no browser in here, so the
// headless smoke test can drive it directly.
import {
  BEACH_X, CAR, PED_COUNT, PLAYER, STEP, TRAFFIC_COUNT, VIEW, WORLD,
} from './config.js';
import { createRandom, clamp, dist } from './random.js';
import { collideBuildings, generateCity, nearestNode, randomRoadPoint, randomSidewalkPoint } from './city.js';
import {
  drivePlayerCar, knockDown, makeCar, makePedestrian, makePlayer, resolveCarCollisions,
  stepPedestrian, stepPlayerOnFoot, stepTrafficCar,
} from './entities.js';
import { addWanted, stepPolice } from './police.js';
import { SPOTS, startMission, updateMission } from './missions.js';

const TRAFFIC_MODELS = ['sedan', 'coupe', 'van', 'pickup'];

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = generateCity(rng);
  const player = makePlayer(1061, 1450);

  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const spot = randomRoadPoint(rng);
    const car = makeCar(rng.pick(TRAFFIC_MODELS), spot.x, spot.y, 0, rng);
    car.driver = 'traffic';
    car.node = nearestNode(city, spot.x, spot.y);
    const node = city.nodes[car.node];
    car.angle = Math.atan2(node.y - car.y, node.x - car.x);
    car.speed = 60;
    cars.push(car);
  }
  const taxi = makeCar('taxi', SPOTS.taxi.x, SPOTS.taxi.y, -Math.PI / 2, rng);
  const sportsCar = makeCar('sports', SPOTS.mallLot.x, SPOTS.mallLot.y, 0, rng);
  cars.push(taxi, sportsCar);

  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const spot = randomSidewalkPoint(rng);
    peds.push(makePedestrian(spot.x, spot.y, rng));
  }

  const world = {
    seed,
    rng,
    city,
    state: 'title', // title | play | pause | busted | wasted
    time: 0,
    player,
    cars,
    taxi,
    sportsCar,
    peds,
    policeCars: [],
    footCops: [],
    wanted: 0,
    quietTimer: 0,
    missionIndex: 0,
    missionStep: 0,
    missionTimer: 0,
    missionFailed: false,
    marker: null,
    dialogue: { lines: [], index: 0, timer: 0 },
    camera: { x: 0, y: 0 },
    jobsDone: 0,
    save: null,
    saveDue: false,
    events: {},
  };
  startMission(world, 0);
  updateCamera(world);
  return world;
}

export function nearestCar(world, x, y, maxDist) {
  const limit = maxDist || 46;
  let best = null;
  let bestD = limit;
  for (const car of world.cars) {
    if (car.driver === 'police') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// E: step out of the car, or step into the nearest car. Taking a parked car
// or yanking a driver out is a crime.
export function tryEnterCar(world) {
  const player = world.player;
  if (player.car) {
    const car = player.car;
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * 30;
    player.y = car.y + Math.sin(side) * 30;
    player.x = clamp(player.x, 12, WORLD.width - 12);
    player.y = clamp(player.y, 12, WORLD.height - 12);
    player.angle = car.angle;
    player.car = null;
    car.driver = 'parked';
    car.speed *= 0.3;
    return true;
  }
  const car = nearestCar(world, player.x, player.y, 46);
  if (!car) return false;
  player.car = car;
  car.driver = 'player';
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  if (car.driver === 'player') addWanted(world, 1);
  return true;
}

// F: punch whatever is in front of the player. Punching a pedestrian is a
// crime; punching a cop is a bigger one.
export function tryPunch(world) {
  const player = world.player;
  if (player.car || player.punchCooldown > 0) return false;
  player.punchCooldown = 0.45;
  let hit = false;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const d = dist(player.x, player.y, ped.x, ped.y);
    if (d > PLAYER.punchRange) continue;
    const want = Math.atan2(ped.y - player.y, ped.x - player.x);
    let diff = want - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > PLAYER.punchArc) continue;
    knockDown(ped, 4);
    addWanted(world, 1);
    hit = true;
  }
  for (const cop of world.footCops) {
    if (cop.state === 'down') continue;
    const d = dist(player.x, player.y, cop.x, cop.y);
    if (d > PLAYER.punchRange) continue;
    cop.state = 'down';
    cop.downTimer = 3;
    cop.grabTimer = 0;
    addWanted(world, 2);
    hit = true;
  }
  if (hit) world.events.punch = true;
  return hit;
}

function stepPlayerCar(world, input, dt) {
  const player = world.player;
  const car = player.car;
  drivePlayerCar(car, input, dt);
  const speedBefore = Math.abs(car.speed);
  if (collideBuildings(world.city, car, CAR.radius)) {
    if (speedBefore > 220) world.events.crash = true;
    // A hard hit costs real speed; brushing a wall while sliding along it
    // only scrubs a little, or a nudge traps the car against the wall.
    car.speed *= speedBefore > 220 ? 0.6 : speedBefore > 60 ? 0.9 : 0.97;
  }
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;

  // Pedestrians: a fast car knocks them down (a crime) and makes the rest flee.
  for (const ped of world.peds) {
    const d = dist(car.x, car.y, ped.x, ped.y);
    if (Math.abs(car.speed) > 200 && d < 26 && ped.state !== 'down') {
      knockDown(ped, 5);
      addWanted(world, 1);
      world.events.crash = true;
    } else if (Math.abs(car.speed) > 250 && d < 220 && ped.state === 'walk') {
      ped.state = 'flee';
      ped.danger = car;
      ped.fleeTimer = 2;
    }
  }
  if (input.wasPressed('KeyE')) tryEnterCar(world);
}

function stepPlayerWalking(world, input, dt) {
  const player = world.player;
  stepPlayerOnFoot(player, input, dt, world.city);
  if (input.wasPressed('KeyE')) tryEnterCar(world);
  else if (input.wasPressed('KeyF')) tryPunch(world);
  // Traffic can run the player down on foot.
  if (player.hurtCooldown <= 0) {
    for (const car of world.cars) {
      if (car.driver === 'parked') continue;
      if (dist(car.x, car.y, player.x, player.y) < 26 && Math.abs(car.speed) > 60) {
        player.health -= 5;
        player.hurtCooldown = 1;
        world.events.crash = true;
        const away = Math.atan2(player.y - car.y, player.x - car.x);
        player.x += Math.cos(away) * 30;
        player.y += Math.sin(away) * 30;
        if (player.health <= 0) world.state = 'wasted';
        break;
      }
    }
  }
}

function updateCamera(world) {
  world.camera.x = clamp(world.player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  world.camera.y = clamp(world.player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
}

function stepAmbient(world, dt) {
  for (const car of world.cars) {
    if (car.driver === 'traffic') stepTrafficCar(car, world, dt);
  }
  for (const ped of world.peds) stepPedestrian(ped, world, dt);
  resolveCarCollisions(world.cars);
  updateCamera(world);
}

// One fixed step. `input` is the small interface from input.js (or a fake
// with the same shape in tests): isDown, wasPressed, axisX, axisY.
export function stepWorld(world, input, dt) {
  world.time += dt;
  if (world.state === 'title') {
    stepAmbient(world, dt);
    return;
  }
  if (world.state !== 'play') return;

  const player = world.player;
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.hurtCooldown > 0) player.hurtCooldown -= dt;

  if (world.missionFailed && input.wasPressed('Enter')) {
    startMission(world, world.missionIndex);
  }

  if (player.car) stepPlayerCar(world, input, dt);
  else stepPlayerWalking(world, input, dt);

  for (const car of world.cars) {
    if (car.driver === 'traffic') stepTrafficCar(car, world, dt);
  }
  stepPolice(world, dt);
  for (const ped of world.peds) stepPedestrian(ped, world, dt);
  const hardest = resolveCarCollisions(world.cars);
  if (hardest > 260 && player.car) world.events.crash = true;

  updateMission(world, dt);
  updateCamera(world);
  if (world.player.health <= 0 && world.state === 'play') world.state = 'wasted';
}

export { STEP };
