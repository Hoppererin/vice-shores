// The moving things: the player on foot, traffic cars, police cars and
// pedestrians, and the step functions that move them. The world module owns
// the rules that connect them (crimes, missions, wanted level); this file
// only knows how each thing moves and bumps into things.
import { CAR, PED_FLEE_SPEED, PED_SPEED, PLAYER, TRAFFIC_SPEED, WORLD } from './config.js';
import { angleDiff, clamp, dist, turnToward } from './random.js';
import { collideBuildings, randomSidewalkPoint } from './city.js';

export const CAR_MODELS = {
  sedan: { name: 'sedan', w: 44, h: 22, topSpeed: 540, colors: ['#c94f43', '#4f7ec9', '#c9c9c9', '#5a6b7a', '#7a9e5f'] },
  coupe: { name: 'coupe', w: 42, h: 20, topSpeed: 560, colors: ['#d9a03a', '#8a5fd0', '#3aa88f', '#c94f43'] },
  taxi: { name: 'taxi', w: 44, h: 22, topSpeed: 540, colors: ['#f2c200'] },
  van: { name: 'van', w: 50, h: 24, topSpeed: 460, colors: ['#e8e8e8', '#7a8a99', '#b08a5a'] },
  sports: { name: 'sports', w: 44, h: 20, topSpeed: 640, colors: ['#f2f2f2'] },
  pickup: { name: 'pickup', w: 48, h: 22, topSpeed: 500, colors: ['#5a7a3a', '#a05a3a', '#4a6a8a'] },
  police: { name: 'police', w: 44, h: 22, topSpeed: 570, colors: ['#1d2126'] },
};

export function makeCar(modelName, x, y, angle, rng) {
  const model = CAR_MODELS[modelName];
  return {
    x, y, angle, speed: 0,
    model,
    color: rng ? rng.pick(model.colors) : model.colors[0],
    driver: 'parked', // traffic | parked | player | police
    node: 0,
    prevNode: -1,
    targetSpeed: 0,
  };
}

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, health: PLAYER.health, cash: 0,
    car: null, punchCooldown: 0, hurtCooldown: 0,
  };
}

const SHIRTS = ['#d94f3d', '#3d7dd9', '#e8b23a', '#7a4fd0', '#4fae62', '#e07ba8', '#e8e8e8'];

export function makePedestrian(x, y, rng) {
  return {
    x, y, angle: rng ? rng.range(0, Math.PI * 2) : 0,
    speed: PED_SPEED,
    state: 'walk', // walk | flee | down
    target: null,
    downTimer: 0,
    fleeTimer: 0,
    danger: null,
    color: rng ? rng.pick(SHIRTS) : SHIRTS[0],
  };
}

export function knockDown(ped, seconds) {
  ped.state = 'down';
  ped.downTimer = seconds || 4;
  ped.danger = null;
}

// --- On foot ---

export function stepPlayerOnFoot(player, input, dt, city) {
  const ax = input.axisX();
  const ay = input.axisY();
  if (ax === 0 && ay === 0) return;
  const speed = input.isDown('run') ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(ax, ay);
  player.x += (ax / len) * speed * dt;
  player.y += (ay / len) * speed * dt;
  player.angle = Math.atan2(ay, ax);
  player.x = clamp(player.x, 12, WORLD.width - 12);
  player.y = clamp(player.y, 12, WORLD.height - 12);
  collideBuildings(city, player, PLAYER.radius);
}

// --- Driving (the player's car) ---

export function drivePlayerCar(car, input, dt) {
  const top = car.model.topSpeed;
  if (input.isDown('up')) car.speed += CAR.accel * dt;
  else if (input.isDown('down')) {
    car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.7) * dt;
  } else {
    // Rolling drag, plus a gentle stop when nobody is on the pedals.
    car.speed -= car.speed * 0.45 * dt;
    if (Math.abs(car.speed) < 6) car.speed = 0;
  }
  car.speed -= car.speed * 0.12 * dt; // air drag grows with speed
  car.speed = clamp(car.speed, -CAR.maxReverse, top);
  const steer = input.axisX();
  if (steer !== 0 && Math.abs(car.speed) > 4) {
    const grip = Math.min(1, Math.abs(car.speed) / 180);
    car.angle += steer * CAR.turnRate * grip * Math.sign(car.speed) * dt;
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 14, WORLD.width - 14);
  car.y = clamp(car.y, 14, WORLD.height - 14);
}

// --- Traffic: follow the road graph, slow down for the car ahead ---

export function stepTrafficCar(car, world, dt) {
  const node = world.city.nodes[car.node];
  const dx = node.x - car.x;
  const dy = node.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 14) {
    car.prevNode = car.node;
    const options = node.neighbors.filter((n) => n !== car.prevNode);
    const pool = options.length > 0 ? options : node.neighbors;
    car.node = world.rng.pick(pool);
    return;
  }
  const wantAngle = Math.atan2(dy, dx);
  car.angle = turnToward(car.angle, wantAngle, 3.4, dt);
  // Slow for a car ahead on the same stretch of road.
  let blocked = false;
  for (const other of world.cars) {
    if (other === car || other.speed === 0 && other.driver === 'parked') continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
    const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 78 && side < 26) {
      blocked = true;
      break;
    }
  }
  // ...and speed up when a faster car is right on the bumper, so traffic
  // clears the way instead of forming a rolling roadblock.
  let tailgated = false;
  for (const other of world.cars) {
    if (other === car) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const behind = -(ox * Math.cos(car.angle) + oy * Math.sin(car.angle));
    const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
    if (behind > 0 && behind < 110 && side < 26 && Math.abs(other.speed) > Math.abs(car.speed) + 50) {
      tailgated = true;
      break;
    }
  }
  const target = tailgated ? 320 : blocked ? 0 : TRAFFIC_SPEED;
  if (car.speed < target) car.speed = Math.min(target, car.speed + 220 * dt);
  else if (car.speed > target) car.speed = Math.max(target, car.speed - 420 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

// --- Pedestrians: stroll the sidewalks, flee a fast car, lie down when hit ---

export function stepPedestrian(ped, world, dt) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.target = null;
    }
    return;
  }
  if (ped.state === 'flee') {
    // A fleeing pedestrian whose danger is gone just goes back to walking.
    if (!ped.danger) {
      ped.state = 'walk';
      ped.target = null;
      return;
    }
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0) {
      ped.state = 'walk';
      ped.danger = null;
      ped.target = null;
      return;
    }
    const away = Math.atan2(ped.y - ped.danger.y, ped.x - ped.danger.x);
    ped.angle = away;
    ped.x += Math.cos(away) * PED_FLEE_SPEED * dt;
    ped.y += Math.sin(away) * PED_FLEE_SPEED * dt;
    ped.x = clamp(ped.x, 12, WORLD.width - 12);
    ped.y = clamp(ped.y, 12, WORLD.height - 12);
    return;
  }
  if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) {
    ped.target = randomSidewalkPoint(world.rng);
  }
  const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  ped.angle = want;
  ped.x += Math.cos(want) * PED_SPEED * dt;
  ped.y += Math.sin(want) * PED_SPEED * dt;
}

// Push overlapping cars apart. Only a genuinely hard hit (fast approach
// along the line between the cars) costs speed; light resting contact just
// separates them, so a chase does not grind both cars to a halt.
export function resolveCarCollisions(cars) {
  let hardest = 0;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      // The push is shared by speed: a parked car holds its ground while the
      // car that drove into it takes the shove, so a chase cannot grind a
      // parked car down the road.
      const speedSum = Math.abs(a.speed) + Math.abs(b.speed);
      const aShare = speedSum > 0 ? (Math.abs(a.speed) / speedSum) * 2 : 1;
      const bShare = speedSum > 0 ? (Math.abs(b.speed) / speedSum) * 2 : 1;
      a.x -= nx * push * aShare;
      a.y -= ny * push * aShare;
      b.x += nx * push * bShare;
      b.y += ny * push * bShare;
      // Approach speed along the line between the cars.
      const avx = Math.cos(a.angle) * a.speed;
      const avy = Math.sin(a.angle) * a.speed;
      const bvx = Math.cos(b.angle) * b.speed;
      const bvy = Math.sin(b.angle) * b.speed;
      const closing = (avx - bvx) * nx + (avy - bvy) * ny;
      const impact = Math.abs(closing);
      if (impact > hardest) hardest = impact;
      if (impact > 80) {
        a.speed *= 0.82;
        b.speed *= 0.82;
      }
    }
  }
  return hardest;
}

export { angleDiff };
