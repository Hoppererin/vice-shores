// The wanted level and the police who answer it. Crimes raise the level;
// it decays one star per WANTED_DECAY_SECONDS while no police are near and
// no new crime happens. Police cars chase and ram the player; from level 2
// foot cops join in, and one who holds the player on foot for
// BUST_HOLD_SECONDS makes the bust.
import {
  BUST_HOLD_SECONDS, CAR, MAX_POLICE_CARS, WANTED_DECAY_SECONDS, WORLD,
} from './config.js';
import { clamp, dist, turnToward } from './random.js';
import { makeCar } from './entities.js';
import { collideBuildings, nearestNode, randomRoadPoint } from './city.js';

export function addWanted(world, stars) {
  world.wanted = clamp(world.wanted + stars, 0, 5);
  world.quietTimer = 0;
}

function policeCarCount(wanted) {
  if (wanted <= 0) return 0;
  return Math.min(MAX_POLICE_CARS, wanted);
}

function footCopCount(wanted) {
  if (wanted < 2) return 0;
  return Math.min(2, wanted - 1);
}

function spawnPointNear(world, minDist, maxDist) {
  for (let tries = 0; tries < 12; tries += 1) {
    const p = randomRoadPoint(world.rng);
    const d = dist(p.x, p.y, world.player.x, world.player.y);
    if (d >= minDist && d <= maxDist) return p;
  }
  const node = world.city.nodes[nearestNode(world.city, world.player.x + 500, world.player.y)];
  return { x: node.x, y: node.y };
}

export function spawnPoliceCar(world) {
  const p = spawnPointNear(world, 480, 720);
  const car = makeCar('police', p.x, p.y, 0, world.rng);
  car.driver = 'police';
  car.leaveTimer = 0;
  car.ramCooldown = 0;
  world.policeCars.push(car);
  world.cars.push(car);
  return car;
}

export function spawnFootCop(world) {
  const p = spawnPointNear(world, 260, 420);
  const cop = {
    x: p.x, y: p.y, angle: 0, speed: 205,
    state: 'chase', grabTimer: 0, downTimer: 0,
  };
  world.footCops.push(cop);
  return cop;
}

function stepPoliceCar(car, world, dt) {
  if (car.ramCooldown > 0) car.ramCooldown -= dt;
  const target = world.player.car || world.player;
  // Close in on the player, but aim for a point just behind a moving car
  // so the chase trails the player instead of driving through them.
  let aimX = target.x;
  let aimY = target.y;
  if (world.player.car) {
    aimX = target.x - Math.cos(target.angle) * 70;
    aimY = target.y - Math.sin(target.angle) * 70;
  }
  const want = Math.atan2(aimY - car.y, aimX - car.x);
  car.angle = turnToward(car.angle, want, 3.0, dt);
  const d = dist(car.x, car.y, target.x, target.y);
  const top = Math.min(575, 470 + world.wanted * 22);
  if (d > 90) car.speed = Math.min(top, car.speed + 430 * dt);
  else car.speed = Math.max(120, car.speed - 200 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 14, WORLD.width - 14);
  car.y = clamp(car.y, 14, WORLD.height - 14);
  // Police cars stay on the roads like everyone else: a building stops them.
  if (collideBuildings(world.city, car, CAR.radius)) car.speed *= 0.6;
  // Ram the player: a hard touch costs health, with a short cooldown, and
  // the rammer falls back instead of grinding against the player.
  const playerBody = world.player.car || world.player;
  const hitD = dist(car.x, car.y, playerBody.x, playerBody.y);
  if (hitD < CAR.radius + 15 && world.player.hurtCooldown <= 0 && car.ramCooldown <= 0) {
    world.player.health -= 8;
    world.player.hurtCooldown = 1;
    world.events.crash = true;
    if (world.player.car) world.player.car.speed *= 0.85;
    car.speed *= 0.45;
    car.ramCooldown = 1.5;
    if (world.player.health <= 0) world.state = 'wasted';
  }
}

function stepFootCop(cop, world, dt) {
  if (cop.state === 'down') {
    cop.downTimer -= dt;
    if (cop.downTimer <= 0) cop.state = 'chase';
    return;
  }
  const player = world.player;
  const d = dist(cop.x, cop.y, player.x, player.y);
  if (!player.car && d < 24) {
    cop.grabTimer += dt;
    if (cop.grabTimer >= BUST_HOLD_SECONDS) {
      world.state = 'busted';
      world.events.busted = true;
    }
    return;
  }
  cop.grabTimer = Math.max(0, cop.grabTimer - dt * 2);
  if (d > 26) {
    const want = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.angle = turnToward(cop.angle, want, 5, dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
  }
}

export function stepPolice(world, dt) {
  // Decay: one star per quiet stretch with no police close by.
  if (world.wanted > 0) {
    const nearCar = world.policeCars.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 550);
    const nearCop = world.footCops.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 350);
    if (nearCar || nearCop) world.quietTimer = 0;
    else {
      world.quietTimer += dt;
      if (world.quietTimer >= WANTED_DECAY_SECONDS) {
        world.wanted -= 1;
        world.quietTimer = 0;
      }
    }
  }

  // Keep the headcount matched to the level.
  const wantCars = policeCarCount(world.wanted);
  while (world.policeCars.length < wantCars) spawnPoliceCar(world);
  const wantCops = footCopCount(world.wanted);
  while (world.footCops.length < wantCops) spawnFootCop(world);

  for (const car of world.policeCars) stepPoliceCar(car, world, dt);
  for (const cop of world.footCops) stepFootCop(cop, world, dt);

  // When the heat is fully off, the police leave: cars drive off and are
  // removed once they are far away, cops simply walk off the job.
  if (world.wanted === 0) {
    for (const car of world.policeCars) {
      car.leaveTimer += dt;
      if (car.leaveTimer > 2.5 || dist(car.x, car.y, world.player.x, world.player.y) > 900) {
        car.gone = true;
      }
    }
    if (world.policeCars.length > 0 && world.policeCars.every((c) => c.gone)) {
      world.cars = world.cars.filter((c) => !c.gone);
      world.policeCars = [];
    }
    if (world.footCops.length > 0) world.footCops = [];
  }
}
