// Entities: the player, pedestrians, traffic cars and police cars, plus
// their per-step behaviour. Car models carry their own size / top speed.

import { CAR, PED_SPEED, PED_FLEE_SPEED, TRAFFIC_SPEED } from './config.js';
import { clamp, angleDiff, dist } from './random.js';
import { collideBuildings, nearestNode, randomRoadPoint, randomSidewalkPoint } from './city.js';

export const CAR_MODELS = {
  sedan:   { name: 'sedan',   len: 46, wid: 22, top: 520, color: '#5b7fa6' },
  coupe:   { name: 'coupe',   len: 44, wid: 21, top: 560, color: '#a64b4b' },
  taxi:    { name: 'taxi',    len: 46, wid: 22, top: 540, color: '#f7c531' },
  van:     { name: 'van',     len: 54, wid: 24, top: 460, color: '#7a8a99' },
  sports:  { name: 'sports',  len: 46, wid: 21, top: 640, color: '#f2f2f0' },
  pickup:  { name: 'pickup',  len: 50, wid: 23, top: 500, color: '#6a8f5a' },
  police:  { name: 'police',  len: 48, wid: 22, top: 600, color: '#2f6fd0' },
};

let nextId = 1;
export function makeCar(x, y, angle, modelName, driver) {
  const model = CAR_MODELS[modelName] || CAR_MODELS.sedan;
  return {
    id: nextId++,
    kind: 'car',
    x, y, angle,
    speed: 0,
    model,
    driver: driver || null,   // 'player' | 'traffic' | 'police' | null (parked)
    node: -1,                 // current road-graph target node (traffic only)
    prevNode: -1,
    color: model.color,
    isPolice: modelName === 'police',
    // Set by the world when this car belongs to the player (never AI-driven).
    playerCar: driver === 'player',
  };
}

export function makePedestrian(x, y, rng) {
  const palette = ['#d96a4a', '#4a7fd9', '#d9a04a', '#7a4ad9', '#4ad98a', '#d94a8a', '#8a6a4a'];
  return {
    kind: 'ped',
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    target: null,
    state: 'walk',            // walk | flee | down
    downTimer: 0,
    color: rng.pick(palette),
    shirt: rng.pick(palette),
    radius: 11,
    // Danger pointer is only read while fleeing; it is null the rest of the
    // time and every flee branch checks it before use (known draft bug).
    danger: null,
    fleeTimer: 0,
  };
}

export function makePlayer(x, y) {
  return {
    kind: 'player',
    x, y,
    angle: -Math.PI / 2,
    health: 100,
    cash: 0,
    car: null,                // car object while driving, else null
    punchTimer: 0,
    punchAnim: 0,
    moving: false,
  };
}

// --- Player on foot -------------------------------------------------------

export function stepPlayerOnFoot(world, dt, input) {
  const p = world.player;
  const ax = input.axisX();
  const ay = input.axisY();
  const mag = Math.hypot(ax, ay);
  p.moving = mag > 0;
  if (mag > 0) {
    const speed = input.isDown('run') ? 265 : 175;
    const nx = ax / mag;
    const ny = ay / mag;
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.angle = Math.atan2(ny, nx);
  }
  p.x = clamp(p.x, 16, world.cityW - 16);
  p.y = clamp(p.y, 16, world.cityH - 16);
  const hit = collideBuildings(world.city, p.x, p.y, 13);
  p.x = hit.x;
  p.y = hit.y;
  if (p.punchTimer > 0) p.punchTimer -= dt;
  if (p.punchAnim > 0) p.punchAnim -= dt;
}

// --- Player driving -------------------------------------------------------

export function stepPlayerCar(world, dt, input) {
  const car = world.player.car;
  if (!car) return;
  const throttle = input.isDown('up') ? 1 : 0;
  const brake = input.isDown('down') ? 1 : 0;
  const steer = input.axisX();
  const top = car.model.top;
  if (throttle) car.speed += CAR.accel * dt;
  if (brake) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.5 * dt;
  }
  if (!throttle && !brake) car.speed -= Math.sign(car.speed) * CAR.drag * 220 * dt;
  if (Math.abs(car.speed) < 4 && !throttle && !brake) car.speed = 0;
  car.speed = clamp(car.speed, -CAR.reverseMax, top);
  // Steering stays usable at low speed (25% authority) and firms up
  // with speed, so the car can actually turn out of a tight corner.
  const steerAuthority = clamp(Math.abs(car.speed) / 200, 0.25, 1);
  car.angle += steer * CAR.turnRate * steerAuthority * Math.sign(car.speed || 1) * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hit = collideBuildings(world.city, nx, ny, car.model.len * 0.42);
  if (hit.hit) {
    if (Math.abs(car.speed) > 260) world.events.push({ type: 'crash' });
    car.speed *= 0.45;
  }
  car.x = clamp(hit.x, 20, world.cityW - 20);
  car.y = clamp(hit.y, 20, world.cityH - 20);
  const p = world.player;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

// --- Traffic --------------------------------------------------------------

// One traffic car follows the road graph. The player's own car is NEVER
// passed through here (known draft bug: the player car drove itself).
export function stepTrafficCar(world, car, dt) {
  if (car.driver !== 'traffic') return;
  if (car.node < 0) {
    car.node = nearestNode(world.city, car.x, car.y);
    car.prevNode = car.node;
  }
  const target = world.city.nodes[car.node];
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const d = Math.hypot(dx, dy);
  const wantAngle = Math.atan2(dy, dx);
  car.angle += clamp(angleDiff(car.angle, wantAngle), -2.2 * dt, 2.2 * dt);
  // Slow down for a car ahead on the same stretch.
  let slow = false;
  for (const other of world.cars) {
    if (other === car || other.driver === null) continue;
    const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
    const side = Math.abs((other.x - car.x) * -Math.sin(car.angle) + (other.y - car.y) * Math.cos(car.angle));
    if (ahead > 0 && ahead < 70 && side < 26) { slow = true; break; }
  }
  const targetSpeed = slow ? 40 : TRAFFIC_SPEED;
  car.speed += clamp(targetSpeed - car.speed, -260 * dt, 180 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (d < 26) {
    const node = world.city.nodes[car.node];
    const options = node.neighbors.filter((n) => n !== car.prevNode);
    const next = options.length
      ? options[world.rng.int(0, options.length - 1)]
      : node.neighbors[world.rng.int(0, node.neighbors.length - 1)];
    car.prevNode = car.node;
    car.node = next;
  }
}

// --- Pedestrians ----------------------------------------------------------

export function stepPedestrian(world, ped, dt) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.target = null;
    }
    return;
  }
  if (ped.state === 'flee') {
    // Guard: danger may be null (e.g. the car that scared them despawned);
    // a null danger means stop fleeing, never dereference it.
    if (!ped.danger) {
      ped.state = 'walk';
      ped.target = null;
      return;
    }
    const dx = ped.x - ped.danger.x;
    const dy = ped.y - ped.danger.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * PED_FLEE_SPEED * dt;
    ped.y += (dy / d) * PED_FLEE_SPEED * dt;
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0 || d > 420) {
      ped.state = 'walk';
      ped.danger = null;
      ped.target = null;
    }
    const hit = collideBuildings(world.city, ped.x, ped.y, ped.radius);
    ped.x = clamp(hit.x, 16, world.cityW - 16);
    ped.y = clamp(hit.y, 16, world.cityH - 16);
    return;
  }
  // Walk: wander between random sidewalk points.
  if (!ped.target) ped.target = randomSidewalkPoint(world.city, world.rng);
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 14) {
    ped.target = null;
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * PED_SPEED * dt;
  ped.y += (dy / d) * PED_SPEED * dt;
  const hit = collideBuildings(world.city, ped.x, ped.y, ped.radius);
  ped.x = clamp(hit.x, 16, world.cityW - 16);
  ped.y = clamp(hit.y, 16, world.cityH - 16);
  // Flee from a fast-moving player car nearby.
  const car = world.player.car;
  if (car && Math.abs(car.speed) > 220) {
    const cd = dist(ped.x, ped.y, car.x, car.y);
    if (cd < 130) {
      ped.state = 'flee';
      ped.danger = car;
      ped.fleeTimer = 2.2;
    }
  }
}

export function knockDown(ped, seconds) {
  ped.state = 'down';
  ped.downTimer = seconds;
  ped.danger = null;
  ped.target = null;
}
