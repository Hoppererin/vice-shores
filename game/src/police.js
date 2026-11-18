// Wanted level, heat, police spawning and the chase / bust logic.

import { MAX_POLICE_CARS, WANTED_DECAY_S, BUST_HOLD_S, COP_GRAB_RANGE } from './config.js';
import { clamp, angleDiff, dist } from './random.js';
import { makeCar } from './entities.js';
import { randomRoadPoint } from './city.js';

export function addWanted(world, stars) {
  world.wanted = clamp(world.wanted + stars, 0, 5);
  world.wantedTimer = 0;
  world.lastCrimeAt = world.time;
  if (world.wanted > 0) world.events.push({ type: 'siren' });
}

export function policeCarTarget(world) {
  return Math.min(world.wanted, MAX_POLICE_CARS);
}

export function footCopTarget(world) {
  if (world.wanted < 2) return 0;
  return Math.min(world.wanted - 1, 3);
}

function spawnPoliceCar(world) {
  const p = world.player;
  const spot = randomRoadPoint(world.city, world.rng);
  // Spawn a few hundred px away, on a road, not on top of the player.
  let x = spot.x;
  let y = spot.y;
  if (dist(x, y, p.x, p.y) < 320) {
    x = clamp(p.x + (p.x < 1600 ? 520 : -520), 60, world.cityW - 60);
    y = clamp(p.y + 260, 60, world.cityH - 60);
  }
  const car = makeCar(x, y, 0, 'police', 'police');
  car.node = -1;
  world.cars.push(car);
  world.policeCars.push(car);
  return car;
}

function spawnFootCop(world) {
  const p = world.player;
  const a = world.rng.range(0, Math.PI * 2);
  const cop = {
    kind: 'cop',
    x: clamp(p.x + Math.cos(a) * 320, 20, world.cityW - 20),
    y: clamp(p.y + Math.sin(a) * 320, 20, world.cityH - 20),
    angle: 0,
    speed: 0,
    radius: 12,
    holdTimer: 0,
    color: '#1d2f55',
  };
  world.footCops.push(cop);
  return cop;
}

export function stepPolice(world, dt) {
  const p = world.player;

  // Decay: one star per WANTED_DECAY_S while no police are near and no
  // new crime has happened recently.
  if (world.wanted > 0) {
    const nearest = nearestPoliceDist(world);
    const quiet = world.time - world.lastCrimeAt > 4;
    if (nearest > 420 && quiet) {
      world.wantedTimer += dt;
      if (world.wantedTimer >= WANTED_DECAY_S) {
        world.wanted -= 1;
        world.wantedTimer = 0;
      }
    } else {
      world.wantedTimer = 0;
    }
  }

  // Spawn / despawn to match the wanted level.
  while (world.policeCars.length < policeCarTarget(world)) spawnPoliceCar(world);
  while (world.policeCars.length > policeCarTarget(world)) {
    const car = world.policeCars.pop();
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  }
  while (world.footCops.length < footCopTarget(world)) spawnFootCop(world);
  while (world.footCops.length > footCopTarget(world)) world.footCops.pop();

  // Police cars chase and ram the player.
  if (world.ramCooldown > 0) world.ramCooldown -= dt;
  for (const car of world.policeCars) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    car.angle += clamp(angleDiff(car.angle, wantAngle), -3.0 * dt, 3.0 * dt);
    const targetSpeed = d > 500 ? 600 : 470;
    car.speed += clamp(targetSpeed - car.speed, -400 * dt, 320 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (d < 46 && world.ramCooldown <= 0) {
      // Ram: damage the player (or their car) and bounce off. One hit
      // per 0.6 s so a chase cannot drain health in a single touch.
      world.ramCooldown = 0.6;
      if (p.car) {
        p.car.speed *= 0.6;
        p.health -= 6;
        car.speed *= -0.25;
      } else {
        p.health -= 14;
        car.speed *= -0.2;
      }
      world.events.push({ type: 'crash' });
      if (p.health <= 0) {
        p.health = 0;
        world.state = 'wasted';
      }
    }
  }

  // Foot cops chase on foot; holding the player on foot for BUST_HOLD_S
  // means BUSTED.
  for (const cop of world.footCops) {
    if (p.car) { cop.holdTimer = 0; continue; }
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    const speed = d > 90 ? 205 : 175;
    cop.x += (dx / d) * speed * dt;
    cop.y += (dy / d) * speed * dt;
    if (d < COP_GRAB_RANGE) {
      cop.holdTimer += dt;
      if (cop.holdTimer >= BUST_HOLD_S) {
        world.state = 'busted';
        world.events.push({ type: 'busted' });
      }
    } else {
      cop.holdTimer = 0;
    }
  }
}

export function nearestPoliceDist(world) {
  const p = world.player;
  let best = Infinity;
  for (const car of world.policeCars) best = Math.min(best, dist(p.x, p.y, car.x, car.y));
  for (const cop of world.footCops) best = Math.min(best, dist(p.x, p.y, cop.x, cop.y));
  return best;
}

export function clearPolice(world) {
  for (const car of world.policeCars) {
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  }
  world.policeCars = [];
  world.footCops = [];
}
