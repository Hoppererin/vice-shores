// The four deterministic ?shot= scenes. Each one runs the real simulation
// forward from a fresh world with a fixed seed and a scripted driver, then
// main.js draws one frame and stops — so every screenshot is a real render
// of the game's own code, and the same seed always gives the same frame.

import { stepWorld, createWorld } from './world.js';
import { startMission } from './missions.js';
import { makePedestrian } from './entities.js';
import { clamp } from './random.js';

const DT = 1 / 60;

function scriptedInput(heldKeys) {
  return { held: new Set(heldKeys), pressed: new Set() };
}

// Step the world N fixed frames with a scripted held-key set.
function drive(world, frames, heldKeys) {
  const input = {
    isDown: (name) => heldKeys.has(name),
    wasPressed: () => false,
    axisX: () => (heldKeys.has('right') ? 1 : 0) - (heldKeys.has('left') ? 1 : 0),
    axisY: () => (heldKeys.has('down') ? 1 : 0) - (heldKeys.has('up') ? 1 : 0),
    endFrame: () => {},
  };
  for (let i = 0; i < frames; i++) stepWorld(world, input, DT);
}

// Drive the player's car along the road graph toward (destX, destY) for
// `frames` steps: BFS path over intersections, steer toward the next node.
function driveAlongGraph(world, frames, destX, destY) {
  const nodes = world.city.nodes;
  function nearestNodeIdx(x, y) {
    let best = 0;
    let bd = Infinity;
    nodes.forEach((n, i) => {
      const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  const start = nearestNodeIdx(world.player.x, world.player.y);
  const goal = nearestNodeIdx(destX, destY);
  const prev = new Array(nodes.length).fill(-1);
  const q = [start];
  prev[start] = start;
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) break;
    for (const nb of nodes[cur].neighbors) {
      if (prev[nb] === -1) { prev[nb] = cur; q.push(nb); }
    }
  }
  const path = [goal];
  let c = goal;
  while (c !== start) { c = prev[c]; path.unshift(c); }
  let pathI = 0;
  let stuckFrames = 0;
  let reverseFrames = 0;
  let lastX = world.player.x;
  let lastY = world.player.y;
  const input = {
    held: new Set(['up']),
    isDown(name) { return input.held.has(name); },
    wasPressed: () => false,
    axisX() { return (input.held.has('right') ? 1 : 0) - (input.held.has('left') ? 1 : 0); },
    axisY() { return (input.held.has('down') ? 1 : 0) - (input.held.has('up') ? 1 : 0); },
    endFrame() {},
  };
  for (let i = 0; i < frames; i++) {
    const car = world.player.car;
    if (!car) break;
    // Lookahead: once close to the current node, aim at the next one so
    // the car cuts the corner on the road instead of orbiting the point.
    const target = nodes[path[pathI]];
    if (Math.hypot(car.x - target.x, car.y - target.y) < 160 && pathI < path.length - 1) pathI++;
    const aim = nodes[path[pathI]];
    const want = Math.atan2(aim.y - car.y, aim.x - car.x);
    let d = want - car.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    input.held = new Set();
    if (reverseFrames > 0) {
      reverseFrames--;
      input.held.add('down');
      if (d > 0.12) input.held.add('left');
      else if (d < -0.12) input.held.add('right');
    } else {
      // Ease off the throttle for a sharp turn so the car can rotate.
      if (Math.abs(d) < 1.0) input.held.add('up');
      if (d > 0.12) input.held.add('right');
      else if (d < -0.12) input.held.add('left');
    }
    stepWorld(world, input, DT);
    if (Math.hypot(car.x - lastX, car.y - lastY) < 0.2) stuckFrames++;
    else stuckFrames = 0;
    lastX = car.x;
    lastY = car.y;
    if (stuckFrames > 120) {
      stuckFrames = 0;
      reverseFrames = 40;
    }
  }
}

// Mission 3 ("Getaway") at 3 wanted stars: Rico in the white sports car
// doing ~58 mph down a road, two police cars chasing behind.
export function shotChase(world) {
  startMission(world, 2);
  world.state = 'play';
  world.wanted = 3;
  world.lastCrimeAt = world.time;
  const car = world.sportsCar;
  car.x = 1400;
  car.y = 1900;
  car.angle = -Math.PI / 2;
  car.speed = 480;
  car.driver = 'player';
  car.playerCar = true;
  world.player.car = car;
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.angle = car.angle;
  world.dialogue = ['Mama Lou: Do not get busted. I am not bailing you out twice.'];
  world.dialogueTimer = 0;
  world.dialogueLine = 0;
  driveAlongGraph(world, 120, 1400, 200);
  // Frame the shot: ~58 mph, and two police cars visibly chasing right
  // behind Rico on the same road.
  car.speed = 480;
  const chasers = [...world.policeCars].slice(0, 2);
  chasers.forEach((cop, i) => {
    cop.x = car.x + (i === 0 ? -14 : 16);
    cop.y = car.y + 190 + i * 150;
    cop.angle = car.angle;
    cop.speed = 430;
  });
  // Re-show the line for the frame: the sim above already ran ~2 s of
  // dialogue clock, which would otherwise have cleared it.
  world.dialogue = ['Mama Lou: Do not get busted. I am not bailing you out twice.'];
  world.dialogueTimer = 0;
  world.dialogueLine = 0;
}

// Mission 1: Rico driving the yellow taxi north through the city.
export function shotDrive(world) {
  startMission(world, 0);
  world.missionStep = 1; // already in the taxi; objective is the club
  world.state = 'play';
  const car = world.taxi;
  car.x = 1400;
  car.y = 2000;
  car.angle = -Math.PI / 2;
  car.speed = 0;
  car.driver = 'player';
  car.playerCar = true;
  world.player.car = car;
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.angle = car.angle;
  world.dialogue = ['Mama Lou: Yellow taxi by the plaza. Take it to the Neon Mile club.'];
  world.dialogueTimer = 0;
  world.dialogueLine = 0;
  driveAlongGraph(world, 120, 600, 1000);
  // Re-show the briefing line for the frame (see shotChase).
  world.dialogue = ['Mama Lou: Yellow taxi by the plaza. Take it to the Neon Mile club.'];
  world.dialogueTimer = 0;
  world.dialogueLine = 0;
}

// Free roam on foot on the beach promenade: palms, sand, ocean, pedestrians.
export function shotStreet(world) {
  world.missionIndex = 4; // free roam
  world.state = 'play';
  const p = world.player;
  p.x = 2900;
  p.y = 1500;
  p.angle = Math.PI / 2;
  p.car = null;
  // A few pedestrians strolling the promenade near Rico.
  for (let i = 0; i < 6; i++) {
    const ped = makePedestrian(2880 + world.rng.range(-30, 90), 1380 + i * 46, world.rng);
    ped.target = { x: 2900, y: 1200 + i * 40 };
    world.peds.push(ped);
  }
  drive(world, 150, new Set());
  // Keep the camera on the promenade even though Rico barely moved.
  world.camera.x = clamp(p.x - 640, 0, 3200 - 1280);
  world.camera.y = clamp(p.y - 360, 0, 2400 - 720);
}

// Title screen over the living city: let traffic and pedestrians run a
// while, then freeze on a city view with the title overlay.
export function shotStart(world) {
  world.state = 'play';
  drive(world, 600, new Set());
  world.state = 'title';
  world.camera.x = 760;
  world.camera.y = 840;
}

const SHOTS = { chase: shotChase, drive: shotDrive, street: shotStreet, start: shotStart };

export function runShot(name, seed) {
  const world = createWorld(seed);
  world.noSave = true; // shots never write to the player's real save slot
  const fn = SHOTS[name];
  if (!fn) throw new Error(`unknown shot: ${name}`);
  fn(world);
  return world;
}

export function shotNames() {
  return Object.keys(SHOTS);
}
