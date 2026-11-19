// Everything that moves in Vice Shores, rewritten for v5.3: the player,
// pedestrians, traffic cars and police cars. Each entity is a plain
// object; each step function advances it by dt seconds using only the
// world and the seeded RNG.
//
// v5.3 changes:
// - Stakeout cars: a police car can be parked with its lights off,
//   waiting near a destination (police.js assigns the stakeout). A
//   stakeout car does not chase until the player trips it — then it
//   bursts out at full speed. The car carries a stakeout flag and a
//   hold timer; stepPoliceCar owns the ambush, this module owns the car.
// - District events change the traffic: during a street race the cars
//   in the race district drive faster (everyone is in a hurry to watch),
//   and during a blackout they drive slower, headlights on, because the
//   street lights are out. Pedestrians gather toward the race district's
//   centre while a race runs, and walk slower in a blackout.
// - The getaway car: Dante the Wheelman's black sports car, the fastest
//   thing in the city (top speed 700), spawned by the wheelman swap.
// - Rolling roadblock cars carry a rolling flag so the chase never tries
//   to drive them — dispatch owns them while they hold the lane.
// - With Dante on the crew, every car runs a little faster on top of
//   Mara's driver bonus (the two stack).
// - Pedestrians keep to the sidewalks while the heat is on. In v5 they
//   wandered onto the asphalt mid-chase and got run over, which raised
//   the wanted level for no good reason — the chase shot itself caught a
//   fourth star that way. Now, at 3+ stars, a pedestrian on the road
//   heads for the nearest sidewalk instead of ambling across.
// - Traffic yields to roadblocks: a traffic car that sees a barrier bar
//   ahead of it on its lane stops and waits instead of driving into it.
// - Spike strips bite: a car crossing one at speed gets a tyre timer —
//   top speed and steering are crippled until it wears off.
// - Cars carry the PIT spin state (pitTimer) and the tyre state
//   (tireTimer), both ticked down where the car is driven.

import { CFG, CAR_MODELS } from './config.js';
import { angleDiff, chance, clamp, dist, pick, rand, randInt } from './random.js';
import { collideBuildings, districtAt, nearestNode, onRoad, randomRoadPoint, randomSidewalkPoint, districtCenter } from './city.js';

// ---------------------------------------------------------------- player

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, // facing north
    health: CFG.playerHealth,
    cash: 0,
    inCar: null, // the car object the player is driving, or null
    walkPhase: 0,
    punchTimer: 0,
    punchCooldown: 0,
    downTimer: 0, // >0 while knocked down (only used for peds/cops)
    heldTimer: 0, // seconds a foot cop has held the player
    speed: 0,
  };
}

// ---------------------------------------------------------------- cars

let carSeq = 0;

export function makeCar(kind, x, y, angle, model, rng) {
  const def = CAR_MODELS[model];
  const baseTop = CFG.carTopSpeed * def.top;
  return {
    id: ++carSeq,
    kind, // 'traffic' | 'parked' | 'taxi' | 'sports' | 'police' | 'player'
    model,
    color: pickColor(kind, model, rng),
    x, y, angle,
    speed: 0,
    len: def.len, wid: def.wid,
    topSpeed: baseTop,
    baseTopSpeed: baseTop, // v5: the driver's +12% scales this, never the scaled value
    block: false, // v5: true while a police car is holding a roadblock line
    rolling: false, // v5.2: true while a police car is part of a rolling roadblock
    getaway: false, // v5.2: true for Dante's black getaway car
    stakeout: false, // v5.3: true while a police car is parked on a stakeout
    stakeoutUntil: 0, // v5.3: the stakeout stands down after this world time
    driver: kind === 'traffic' || kind === 'taxi',
    node: -1, // current road-graph node (traffic only)
    next: -1, // node being driven to (traffic only)
    wait: 0,
    hitCooldown: 0,
    pitCooldown: 0, // v5.1: seconds before this police car can PIT again
    pitTimer: 0, // v5.1: >0 while this car is spinning out from a PIT
    tireTimer: 0, // v5.1: >0 while the tyres are popped from a spike strip
  };
}

function pickColor(kind, model, rng) {
  if (kind === 'police') return '#2a4a8a';
  if (kind === 'taxi') return '#f2c230';
  const colors = CAR_MODELS[model].colors;
  // No fallback: every caller passes the world's seeded RNG, so the
  // colour pick is deterministic — a seed always builds the same city.
  return colors[Math.floor(rng() * colors.length)];
}

// The yellow mission taxi, parked by the plaza.
export function makeTaxi(x, y, rng) {
  const car = makeCar('taxi', x, y, -Math.PI / 2, 'taxi', rng);
  car.driver = false;
  return car;
}

// The white sports car for the final job, parked in the mall lot.
export function makeSportsCar(x, y, rng) {
  const car = makeCar('sports', x, y, Math.PI / 2, 'sports', rng);
  car.color = '#e8e8e8';
  car.driver = false;
  return car;
}

// Dante the Wheelman's getaway car: a black sports car, the fastest thing
// in Vice Shores. It spawns on the nearest road ahead of the player when
// the wheelman swap is called, and Rico climbs straight into it.
export function makeGetawayCar(x, y, rng) {
  const car = makeCar('sports', x, y, 0, 'sports', rng);
  car.color = '#1a1a1a';
  car.driver = false;
  car.getaway = true;
  car.baseTopSpeed = CFG.getawayTopSpeed;
  car.topSpeed = CFG.getawayTopSpeed;
  return car;
}

// A stakeout car: a police car parked with its lights off near a
// destination, waiting for the player. It does not move and does not
// chase until police.js trips the ambush — then it is just a fast
// police car with a burst of speed. The hold timer stands it down.
export function makeStakeoutCar(world, x, y, angle) {
  const car = makeCar('police', x, y, angle, 'police', world.rng);
  car.speed = 0;
  car.stakeout = true;
  car.stakeoutUntil = world.time + CFG.stakeoutHoldSeconds;
  return car;
}

// Spawn the ambient traffic: cars already on the road graph, mid-edge.
export function spawnTraffic(world) {
  const cars = [];
  const models = ['sedan', 'sedan', 'coupe', 'van', 'sports', 'pickup', 'taxi'];
  for (let n = 0; n < CFG.trafficCount; n++) {
    const node = pick(world.rng, world.city.nodes);
    const links = node.links;
    if (!links.length) continue;
    const next = pick(world.rng, links);
    const target = world.city.nodes[next];
    const t = rand(world.rng, 0.15, 0.85);
    const x = node.x + (target.x - node.x) * t;
    const y = node.y + (target.y - node.y) * t;
    const car = makeCar('traffic', x, y, Math.atan2(target.y - node.y, target.x - node.x), pick(world.rng, models), world.rng);
    car.node = node.id;
    car.next = next;
    car.speed = CFG.trafficSpeed * rand(world.rng, 0.8, 1.1);
    cars.push(car);
  }
  return cars;
}

// A few parked cars in lots and along kerbs, for the player to steal.
export function spawnParked(world) {
  const spots = [
    [1000, 2000, 'sedan'], [1800, 2000, 'coupe'], [600, 1400, 'sedan'],
    [2200, 600, 'pickup'], [1400, 2200, 'van'], [2600, 1000, 'sedan'],
    [1000, 600, 'coupe'], [1800, 1000, 'van'],
  ];
  const cars = [];
  for (const [x, y, model] of spots) {
    const car = makeCar('parked', x + rand(world.rng, -20, 20), y + rand(world.rng, -20, 20), rand(world.rng, 0, Math.PI * 2), model, world.rng);
    car.driver = false;
    cars.push(car);
  }
  return cars;
}

// ---------------------------------------------------------------- peds

const SHIRTS = ['#d05050', '#5080d0', '#50a050', '#d0a050', '#a050c0', '#e0e0e0', '#505050', '#d08050'];
const SKINS = ['#e8b88a', '#c98a5a', '#8a5a3a', '#f0c8a0'];

export function makePed(x, y, rng) {
  return {
    x, y,
    angle: rand(rng, 0, Math.PI * 2),
    speed: 0,
    target: null,
    downTimer: 0,
    fleeing: false,
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    walkPhase: rand(rng, 0, Math.PI * 2),
    cop: false,
  };
}

export function spawnPeds(world) {
  const peds = [];
  for (let n = 0; n < CFG.pedCount; n++) {
    const p = randomSidewalkPoint(world.rng, world.city);
    peds.push(makePed(p.x, p.y, world.rng));
  }
  return peds;
}

// ---------------------------------------------------------------- traffic

// The traffic speed multiplier for a district event: a street race makes
// the cars in the race district hurry (everyone is late for the start
// line), a blackout makes them crawl (the street lights are out and the
// headlights are all anyone has).
export function trafficEventFactor(world, x, y) {
  const ev = world.districtEvent;
  if (!ev || districtAt(x, y) !== ev.district) return 1;
  if (ev.type === 'race') return 1.3;
  if (ev.type === 'blackout') return 0.7;
  return 1;
}

// Drive one traffic car along the road graph for dt seconds. A traffic
// car that sees a roadblock barrier ahead on its lane stops and waits
// instead of driving into the cordon — the PD's line is not a suggestion.
export function stepTrafficCar(world, car, dt) {
  if (car.wait > 0) { car.wait -= dt; return; }
  const city = world.city;
  const target = city.nodes[car.next];
  if (!target) return;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const d = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  car.angle += clamp(angleDiff(car.angle, want), -3.2 * dt, 3.2 * dt);

  // Slow down for a car ahead in the same lane.
  let blocked = false;
  for (const other of world.cars) {
    if (other === car || other === world.player.inCar) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
    const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 78 && side < 30) { blocked = true; break; }
  }
  // And for a barrier roadblock ahead: the cars respect the cordon.
  if (!blocked) {
    for (const rb of world.roadblocks) {
      if (rb.kind !== 'barrier') continue;
      const ox = rb.x - car.x;
      const oy = rb.y - car.y;
      const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 110 && side < 60) { blocked = true; break; }
    }
  }
  const goal = blocked ? 0 : CFG.trafficSpeed * trafficEventFactor(world, car.x, car.y);
  car.speed += clamp(goal - car.speed, -260 * dt, 200 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  if (d < 26) {
    // Reached the intersection: pick a next edge, preferring not to U-turn.
    const options = target.links.filter((id) => id !== car.node);
    const next = options.length ? pick(world.rng, options) : target.links[0];
    car.node = car.next;
    car.next = next;
    if (chance(world.rng, 0.06)) car.wait = rand(world.rng, 0.5, 1.5);
  }
}

// ---------------------------------------------------------------- peds

// Walk one pedestrian: amble between sidewalk points, flee a fast car.
// v5.1: while the wanted level is 3 or higher, a pedestrian who finds
// themself on the asphalt heads for the nearest sidewalk instead of
// ambling across the road — a chase down a road should not turn into a
// wanted-level farm, and the chase screenshot stays clean.
// v5.3: district events change the walk. During a street race, a
// pedestrian in the race district drifts toward the district centre to
// watch; during a blackout, everyone walks slower, feeling their way.
export function stepPed(world, ped, dt) {
  if (ped.downTimer > 0) {
    ped.downTimer -= dt;
    return;
  }
  const player = world.player;
  const playerCar = player.inCar;
  let danger = null;
  if (playerCar && Math.abs(playerCar.speed) > 200) danger = playerCar;
  if (danger) {
    const d = dist(ped.x, ped.y, danger.x, danger.y);
    if (d < 150) {
      ped.fleeing = true;
      const away = Math.atan2(ped.y - danger.y, ped.x - danger.x);
      ped.angle += clamp(angleDiff(ped.angle, away), -6 * dt, 6 * dt);
      ped.speed = CFG.pedFleeSpeed;
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      ped.walkPhase += dt * 14;
      // Fleeing stays on the sidewalk when the heat is on: steer the
      // flight toward the kerb instead of across the road.
      if (world.wanted >= 3 && onRoad(ped.x, ped.y)) {
        ped.target = nearestSidewalkExit(ped.x, ped.y);
      }
      return;
    }
  }
  ped.fleeing = false;
  // High heat: a pedestrian standing on the road walks to the nearest
  // sidewalk — straight off the road edge, not to a random distant point
  // (which could be hundreds of pixels down the same road, leaving them
  // on the asphalt for seconds while a chase runs through).
  if (world.wanted >= 3 && onRoad(ped.x, ped.y)) {
    ped.target = nearestSidewalkExit(ped.x, ped.y);
  }
  if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 18) {
    // A street race draws a crowd: a pedestrian in the race district
    // heads for a sidewalk point near the district centre instead of a
    // random one, so the race has spectators on the kerbs.
    const ev = world.districtEvent;
    if (ev && ev.type === 'race' && districtAt(ped.x, ped.y) === ev.district) {
      const c = districtCenter(ev.district);
      ped.target = {
        x: clamp(c.x + rand(world.rng, -260, 260), 60, CFG.worldW - 60),
        y: clamp(c.y + rand(world.rng, -260, 260), 60, CFG.worldH - 60),
      };
    } else {
      ped.target = randomSidewalkPoint(world.rng, world.city);
    }
  }
  const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  ped.angle += clamp(angleDiff(ped.angle, want), -5 * dt, 5 * dt);
  // A blackout slows the walk: nobody hurries in the dark.
  const ev = world.districtEvent;
  const slow = ev && ev.type === 'blackout' && districtAt(ped.x, ped.y) === ev.district ? 0.6 : 1;
  ped.speed = CFG.pedSpeed * slow;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.x = clamp(ped.x, 40, CFG.worldW - 40);
  ped.y = clamp(ped.y, 40, CFG.worldH - 40);
  ped.walkPhase += dt * 9;
}

// The nearest point off the road from (x, y): just beyond the asphalt
// edge of the closest road line, on the nearer side. A pedestrian on the
// road at high wanted heads here — the fastest way off the asphalt.
function nearestSidewalkExit(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of CFG.roadXs) {
    const d = Math.abs(x - rx);
    if (d < bestD) {
      bestD = d;
      best = { x: rx + (x >= rx ? CFG.roadHalf + 13 : -(CFG.roadHalf + 13)), y };
    }
  }
  for (const ry of CFG.roadYs) {
    const d = Math.abs(y - ry);
    if (d < bestD) {
      bestD = d;
      best = { x, y: ry + (y >= ry ? CFG.roadHalf + 13 : -(CFG.roadHalf + 13)) };
    }
  }
  return best;
}

// ---------------------------------------------------------------- driving

// Advance a driven car (the player's) by dt. Returns 'crash' when it hit a
// building hard, 'bump' for a light scrape, '' otherwise. With Mara the
// Driver on the crew, the car runs faster and turns sharper (v5). With
// popped tyres from a spike strip (v5.1), the top speed is crippled and
// the steering goes soft until the timer wears off. With Dante the
// Wheelman on the crew (v5.2), every car runs a little faster on top of
// Mara's bonus — the two stack. A getaway car ignores the crew bonuses:
// it is already the fastest thing in the city.
export function stepDrivenCar(world, car, input, dt) {
  if (car.tireTimer > 0) car.tireTimer -= dt;
  const driver = world.crew && world.crew.driver;
  const wheelman = world.crew && world.crew.wheelman;
  const tyres = car.tireTimer > 0 ? 0.55 : 1;
  const top = car.getaway
    ? car.baseTopSpeed * tyres
    : car.baseTopSpeed * (driver ? CFG.driverTopBonus : 1) * (wheelman ? CFG.wheelmanTopBonus : 1) * tyres;
  car.topSpeed = top;
  if (input.up) car.speed += CFG.carAccel * dt;
  else if (input.down) {
    if (car.speed > 20) car.speed -= CFG.carBrake * dt;
    else car.speed = Math.max(-CFG.carReverseMax, car.speed - CFG.carAccel * 0.6 * dt);
  } else {
    // Coast down.
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
  }
  car.speed = clamp(car.speed, -CFG.carReverseMax, top);

  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 240, 0, 1);
  const turn = CFG.carTurn * (driver ? CFG.driverTurnBonus : 1) * (car.tireTimer > 0 ? 0.8 : 1);
  car.angle += steer * turn * speedFactor * Math.sign(car.speed || 1) * dt;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, CFG.worldW - 30);
  car.y = clamp(car.y, 30, CFG.worldH - 30);

  // Buildings: push the car out at its nose and tail circles.
  let result = '';
  for (const off of [car.len * 0.32, -car.len * 0.32]) {
    const probe = {
      x: car.x + Math.cos(car.angle) * off,
      y: car.y + Math.sin(car.angle) * off,
    };
    if (collideBuildings(world.city, probe, car.wid * 0.62)) {
      const hard = Math.abs(car.speed) > 260;
      car.x += probe.x - (car.x + Math.cos(car.angle) * off);
      car.y += probe.y - (car.y + Math.sin(car.angle) * off);
      car.speed *= hard ? 0.35 : 0.7;
      result = hard ? 'crash' : 'bump';
    }
  }
  return result;
}

// Two cars overlap: push them apart and trade momentum along the line of
// centres (equal-mass elastic impulse, restitution 0.4). A fast car
// rear-ending a slow one shoves it forward instead of welding both cars
// together at a crawl — the old average-speed version did exactly that.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = (a.len + b.len) * 0.42;
  if (d >= min || d < 0.01) return false;
  const nx = dx / d;
  const ny = dy / d;
  const push = (min - d) / 2;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;

  // Velocity vectors from each car's heading and scalar speed.
  const vax = Math.cos(a.angle) * a.speed;
  const vay = Math.sin(a.angle) * a.speed;
  const vbx = Math.cos(b.angle) * b.speed;
  const vby = Math.sin(b.angle) * b.speed;
  const rvn = (vbx - vax) * nx + (vby - vay) * ny;
  if (rvn >= 0) return true; // moving apart: position only
  const j = (-(1 + 0.4) * rvn) / 2;
  const vax2 = vax - j * nx;
  const vay2 = vay - j * ny;
  const vbx2 = vbx + j * nx;
  const vby2 = vby + j * ny;
  // Back to scalar speeds along each car's own heading.
  a.speed = vax2 * Math.cos(a.angle) + vay2 * Math.sin(a.angle);
  b.speed = vbx2 * Math.cos(b.angle) + vby2 * Math.sin(b.angle);
  return true;
}

// Nearest car within range of a point (for E to enter).
export function nearestCar(world, x, y, range) {
  let best = null;
  let bestD = range;
  for (const car of world.cars) {
    if (car.kind === 'police') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
