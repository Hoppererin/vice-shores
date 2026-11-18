// The four deterministic `?shot=` scenes. Each one plays the real rules
// forward from a fresh world with a fixed seed and a scripted driver, then
// the main loop draws one frame and stops — so every shot is a real render
// of the game's own code, and the same seed always gives the same frame.
import { STEP } from './config.js';
import { createWorld, stepWorld } from './world.js';
import { startMission, SPOTS } from './missions.js';
import { spawnPoliceCar } from './police.js';
import { makeCar } from './entities.js';

class ShotInput {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
  }
  isDown(name) { return this.held.has(name); }
  wasPressed() { return false; }
  axisX() { return (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0); }
  axisY() { return (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0); }
  endFrame() { this.pressed.clear(); }
}

// Steer the player's car toward a point, holding the gas while under the
// target speed (no target speed means flat out). A slower car right ahead
// on our lane is passed on the clear side instead of tailgated.
function driveToward(world, input, tx, ty, targetSpeed) {
  const car = world.player.car;
  input.held = new Set();
  // Aim 200 px ahead toward the target, on the road's centre line — unless
  // a slower car is right ahead on our lane, in which case aim 42 px to
  // the clear side to pass it. The aim is fixed to the target's direction,
  // never to the car's own heading, so it cannot spiral off the road.
  const dx = tx - car.x;
  const dy = ty - car.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = dx / len;
  const fy = dy / len;
  const px = -fy;
  const py = fx;
  let pass = 0;
  for (const other of world.cars) {
    if (other === car) continue;
    const rx = other.x - car.x;
    const ry = other.y - car.y;
    const ahead = rx * fx + ry * fy;
    const side = rx * px + ry * py;
    if (ahead > 0 && ahead < 150 && Math.abs(side) < 32) {
      pass = side > 0 ? -42 : 42;
      break;
    }
  }
  const aimX = car.x + fx * 200 + px * pass;
  const aimY = car.y + fy * 200 + py * pass;
  const want = Math.atan2(aimY - car.y, aimX - car.x);
  let d = want - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) < 1.0 && (targetSpeed === undefined || car.speed < targetSpeed)) {
    input.held.add('up');
  }
  if (d > 0.12) input.held.add('right');
  else if (d < -0.12) input.held.add('left');
}

function stepN(world, input, n) {
  for (let i = 0; i < n; i += 1) {
    stepWorld(world, input, STEP);
    input.endFrame();
  }
}

function putPlayerInCar(world, car, speed) {
  world.player.car = car;
  car.driver = 'player';
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.angle = car.angle;
  car.speed = speed || 0;
}

function stageChase(seed) {
  const world = createWorld(seed);
  world.state = 'play';
  startMission(world, 2); // Getaway: the job starts with 2 wanted stars
  world.wanted = 3;
  const car = world.sportsCar;
  car.x = 1400;
  car.y = 1900;
  car.angle = -Math.PI / 2;
  putPlayerInCar(world, car, 480);
  world.dialogue = {
    lines: ["Mama Lou: Lose them, Rico — all of them — then slip to the safehouse."],
    index: 0,
    timer: 7,
  };
  // Two police cars visibly chasing right behind the player.
  for (const [x, y] of [[1400, 2010], [1400, 2140]]) {
    const cop = makeCar('police', x, y, -Math.PI / 2, world.rng);
    cop.driver = 'police';
    cop.leaveTimer = 0;
    cop.speed = 450;
    world.policeCars.push(cop);
    world.cars.push(cop);
  }
  const input = new ShotInput();
  for (let i = 0; i < 90; i += 1) {
    driveToward(world, input, 1400, 600, 485); // hold ~58 mph up the road
    stepWorld(world, input, STEP);
    input.endFrame();
  }
  return world;
}

function stageDrive(seed) {
  const world = createWorld(seed);
  world.state = 'play';
  startMission(world, 0);
  const taxi = world.taxi;
  putPlayerInCar(world, taxi, 0);
  world.wanted = 1;
  world.missionStep = 1;
  world.marker = SPOTS.club;
  world.dialogue = {
    lines: ["Mama Lou: Good. Now the Neon Mile club — north side, follow the marker."],
    index: 0,
    timer: 7,
  };
  const input = new ShotInput();
  for (let i = 0; i < 180; i += 1) {
    driveToward(world, input, 1400, 300);
    stepWorld(world, input, STEP);
    input.endFrame();
  }
  return world;
}

function stageStreet(seed) {
  const world = createWorld(seed);
  world.state = 'play';
  startMission(world, 0);
  world.player.x = 2920;
  world.player.y = 1200;
  world.player.angle = 0; // facing the ocean
  // Bring a few pedestrians onto the promenade for the shot.
  for (let i = 0; i < 6; i += 1) {
    const ped = world.peds[i];
    ped.x = 2880 + i * 22;
    ped.y = 1100 + (i % 3) * 90;
    ped.state = 'walk';
    ped.target = { x: 2900 + (i % 2) * 60, y: 1150 + i * 25 };
  }
  stepN(world, new ShotInput(), 120);
  return world;
}

function stageStart(seed) {
  const world = createWorld(seed);
  // Title state: the city lives behind the menu (traffic and pedestrians).
  stepN(world, new ShotInput(), 300);
  return world;
}

export function runShot(name, seed) {
  if (name === 'chase') return stageChase(seed);
  if (name === 'drive') return stageDrive(seed);
  if (name === 'street') return stageStreet(seed);
  return stageStart(seed);
}
