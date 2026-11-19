// Police dispatch, rewritten for v5.1: roadblocks, spike strips, flares
// and the helicopter. Dispatch is the system that makes a high wanted
// level feel like the whole city is after you — and in v5.1 it has more
// than one trick. At 3+ stars it sets roadblocks on the roads ahead of
// the player; at 4+ stars a helicopter joins, and some roadblocks are
// spike strips instead of barriers. Every roadblock burns a flare so the
// player can see it coming. The hacker's jam (crew.js) shuts dispatch
// down for a while. Everything here is deterministic: roadblock spots,
// kinds and radio lines come from the world's seeded RNG, never from
// Math.random.
//
// Roadblock kinds:
//   'barrier' — two police cars parked across the road with a striped bar
//     between them. Solid: the player must go around it or ram it (ramming
//     breaks it, costs a star and sends its cars after them).
//   'spike' — a strip of spikes laid across the road. Harmless on foot and
//     invisible until close, but a car crossing it at speed pops its tyres:
//     top speed and steering are crippled for twenty seconds. Slow down and
//     crawl over it, or go around.
//
// The helicopter hovers offset from the player (up-left), not directly
// overhead, so its spotlight cone no longer sits on top of the police cars
// chasing behind — the v5 chase shot had them stacked on each other.

import { CFG } from './config.js';
import { clamp, dist, pick, rand } from './random.js';
import { makeCar } from './entities.js';
import { nearestRoad } from './city.js';
import { addCrime } from './police.js';
import { say } from './missions.js';

// How many roadblocks the current wanted level calls for, and of which
// kinds. Three stars is one barrier; four adds a spike strip and the
// helicopter; five stars is two barriers and a spike strip.
export function roadblocksWanted(world) {
  if (world.wanted < 3) return 0;
  if (world.wanted >= 5) return 3;
  if (world.wanted >= 4) return 2;
  return 1;
}

// The helicopter flies from 4 stars up.
export function heliWanted(world) {
  return world.wanted >= CFG.heliMinStars;
}

// Is dispatch jammed right now (the hacker crew ability)?
export function dispatchJammed(world) {
  return world.time < (world.jamUntil || 0);
}

// One tick of dispatch: spawn / clear roadblocks and the helicopter,
// step the flares, refresh the radio line. Called from stepWorld after
// updateWanted.
export function updateDispatch(world, dt) {
  const d = world.dispatch;
  d.cooldown = Math.max(0, d.cooldown - dt);
  if (d.msg && world.time > d.until) d.msg = null;
  stepFlares(world, dt);

  const jammed = dispatchJammed(world);
  if (jammed) {
    // A jam clears the air: no new roadblocks, no helicopter, and the
    // ones out there stand down while the signal is dead.
    if (world.roadblocks.length || world.heli) {
      clearRoadblocks(world);
      world.heli = null;
      world.flares = [];
      radio(world, 'DISPATCH: ... signal lost ... all units, hold position.');
    }
    return;
  }

  // Roadblocks: spawn up to the level's demand, clear them when the heat
  // drops below 3 stars. A mission's scripted roadblock is a set piece,
  // not a heat response: it stays up at zero stars and only the job
  // ending, the hacker's jam, or the player breaking through removes it.
  const want = roadblocksWanted(world);
  if (want === 0) {
    clearNonScriptedRoadblocks(world);
  } else {
    while (countDispatchRoadblocks(world) < want && d.cooldown <= 0) {
      const kind = pickRoadblockKind(world);
      if (spawnRoadblock(world, null, kind)) {
        d.cooldown = CFG.roadblockCooldown;
        radio(world, pickRoadblockLine(world, kind));
      } else {
        break; // nowhere sensible to put one right now
      }
    }
    // Trim dispatch roadblocks to the level's demand; a scripted one
    // does not count toward the limit and is never trimmed away.
    while (countDispatchRoadblocks(world) > want) {
      const idx = world.roadblocks.findIndex((r) => !r.scripted);
      if (idx < 0) break;
      removeRoadblock(world, world.roadblocks[idx]);
    }
  }

  // Helicopter: follows the player from 4 stars, gone below that — unless
  // a scripted scene locked it in place (the chase screenshot). It hovers
  // offset up-left of the player so the spotlight beam reads as a beam,
  // not a puddle on top of the chase.
  if (heliWanted(world)) {
    if (!world.heli) {
      world.heli = {
        x: world.player.x + CFG.heliOffsetX,
        y: world.player.y + CFG.heliOffsetY,
        active: true,
      };
      radio(world, 'DISPATCH: Air-1 overhead. Suspect in sight, do not lose them.');
    }
  } else if (world.heli && !world.heliLocked) {
    world.heli = null;
  }
  if (world.heli) {
    const p = world.player;
    const tx = p.x + CFG.heliOffsetX;
    const ty = p.y + CFG.heliOffsetY;
    world.heli.x += (tx - world.heli.x) * Math.min(1, dt * 1.6);
    world.heli.y += (ty - world.heli.y) * Math.min(1, dt * 1.6);
  }

  // Step every roadblock: its cars hold the line until the player gets
  // close, then they break and join the chase. Spike strips arm the
  // moment the player crosses them at speed.
  for (const rb of [...world.roadblocks]) stepRoadblock(world, rb, dt);
}

function countDispatchRoadblocks(world) {
  return world.roadblocks.filter((r) => !r.scripted).length;
}

// Which kind of roadblock does this spawn make? At three stars the PD
// mostly builds barriers; from four stars up, spike strips join the mix.
function pickRoadblockKind(world) {
  const spikeChance = world.wanted >= 4 ? CFG.roadblockSpikeChance : 0.2;
  return rand(world.rng, 0, 1) < spikeChance ? 'spike' : 'barrier';
}

// Put a dispatch line on the HUD radio for a few seconds.
export function radio(world, text) {
  world.dispatch.msg = text;
  world.dispatch.until = world.time + 5;
  world.dispatchLog.push(text);
  if (world.dispatchLog.length > 3) world.dispatchLog.shift();
}

// A flare burns over a fresh roadblock so the player sees it coming:
// orange smoke rising from the road, gone after a few seconds.
function lightFlare(world, x, y) {
  world.flares.push({ x, y, until: world.time + CFG.flareSeconds });
}

function stepFlares(world, dt) {
  world.flares = world.flares.filter((f) => world.time < f.until);
}

// Place a roadblock on a road ahead of the player, across the road they
// are travelling. kind is 'barrier' or 'spike'. Returns true when one
// was placed.
export function spawnRoadblock(world, at, kind = 'barrier') {
  const spot = at || roadAheadSpot(world);
  if (!spot) return false;
  const rb = {
    x: spot.x, y: spot.y,
    angle: spot.angle, // direction of the road (0 = east-west, PI/2 = north-south)
    kind,
    cars: [],
    ttl: 0,
    tripped: false, // a spike strip only bites once
  };
  if (kind === 'barrier') {
    // Two police cars parked across the road, nose to nose, leaving only
    // a narrow gap — plus a striped barrier bar between them.
    const across = spot.angle + Math.PI / 2;
    const off = 34;
    for (const s of [-1, 1]) {
      const car = makeCar('police',
        spot.x + Math.cos(across) * off * s,
        spot.y + Math.sin(across) * off * s,
        spot.angle, 'police', world.rng);
      car.speed = 0;
      car.block = true; // holds the line; stepPoliceCar skips blocked cars
      rb.cars.push(car);
      world.cars.push(car);
    }
  }
  // A spike strip has no cars: just the strip itself, and a flare so the
  // player can spot it before their tyres find it.
  world.roadblocks.push(rb);
  lightFlare(world, spot.x, spot.y);
  world.events.roadblock = true;
  return true;
}

// Place a roadblock at an exact spot (missions use this for a scripted
// roadblock on the direct route). angle is the road direction, kind is
// 'barrier' or 'spike'. The roadblock is marked scripted so dispatch's
// heat-based clearing never sweeps it away — the job put it there, not
// the wanted level.
export function spawnRoadblockAt(world, x, y, angle, kind = 'barrier') {
  if (!spawnRoadblock(world, { x, y, angle }, kind)) return false;
  world.roadblocks[world.roadblocks.length - 1].scripted = true;
  return true;
}

// Clear every roadblock dispatch itself placed, leaving a mission's
// scripted set piece standing.
function clearNonScriptedRoadblocks(world) {
  for (const rb of world.roadblocks.filter((r) => !r.scripted)) removeRoadblockCars(world, rb);
  world.roadblocks = world.roadblocks.filter((r) => r.scripted);
}

// Remove every scripted roadblock (a job ended or was retried): its
// blocked cars leave the world too.
export function clearScriptedRoadblocks(world) {
  for (const rb of world.roadblocks.filter((r) => r.scripted)) removeRoadblockCars(world, rb);
  world.roadblocks = world.roadblocks.filter((r) => !r.scripted);
}

// Find a spot on a road ahead of the player's heading: walk forward along
// the player's direction until the nearest road, then snap to it.
function roadAheadSpot(world) {
  const p = world.player;
  const ahead = 520 + rand(world.rng, 0, 260);
  const fx = p.x + Math.cos(p.angle) * ahead;
  const fy = p.y + Math.sin(p.angle) * ahead;
  const best = nearestRoad(fx, fy);
  if (!best || best.dist > 320) return null;
  // Do not drop a roadblock on top of the player or a mission marker.
  if (dist(best.x, best.y, p.x, p.y) < 260) return null;
  return best;
}

// A barrier roadblock holds until the player rams its bar: then the block
// breaks, its cars give chase, and breaching a police roadblock is a
// crime (+1 star) — so the chase has heat to sustain it. A spike strip
// bites the moment a fast car crosses it: popped tyres, and no crime —
// the PD never saw who did it, only the hiss.
function stepRoadblock(world, rb, dt) {
  rb.ttl += dt;
  const p = world.player;
  const body = p.inCar || p;
  const radius = p.inCar ? body.wid * 0.6 : CFG.playerRadius;
  if (rb.kind === 'spike') {
    if (!rb.tripped && p.inCar && Math.abs(p.inCar.speed) > 150 && roadblockHit(rb, body, radius)) {
      rb.tripped = true;
      p.inCar.tireTimer = 20;
      p.inCar.speed *= 0.7;
      say(world, 'Mama Lou: Spike strip! Your tyres are gone — go easy on her, Rico.');
      world.events.spike = true;
      removeRoadblock(world, rb);
    }
    return;
  }
  if (!roadblockHit(rb, body, radius)) return;
  for (const car of rb.cars) {
    car.block = false;
    car.speed = 240;
    car.fromRoadblock = true; // updateWanted keeps a fresh chaser
    if (!world.police.includes(car)) world.police.push(car);
  }
  removeRoadblock(world, rb);
  addCrime(world, 1);
  radio(world, 'DISPATCH: Roadblock breached — all units, pursue!');
  world.events.roadblockBreak = true;
}

// The barrier bar's solid box: wide across the road, thin along it. A
// spike strip uses the same box so crossing it is detected the same way.
function barrierBox(rb, radius) {
  // The bar runs across the road: its long side is perpendicular to the
  // road direction, so its box is wide across the road, thin along it.
  const along = rb.angle === 0 ? 8 : 76; // half-length along x
  const across = rb.angle === 0 ? 76 : 8; // half-length along y
  return {
    x0: rb.x - along - radius, x1: rb.x + along + radius,
    y0: rb.y - across - radius, y1: rb.y + across + radius,
  };
}

// Is the body touching THIS roadblock's bar or strip? stepRoadblock uses
// this per-roadblock check — the shared roadblockContact (any roadblock)
// would remove every roadblock the moment the player touches one.
function roadblockHit(rb, body, radius) {
  const b = barrierBox(rb, radius);
  return body.x >= b.x0 && body.x <= b.x1 && body.y >= b.y0 && body.y <= b.y1;
}

// Is the body touching any roadblock's bar or strip? No push-out —
// stepRoadblock uses this so the block breaks (or bites) on contact.
export function roadblockContact(world, body, radius) {
  for (const rb of world.roadblocks) {
    const b = barrierBox(rb, radius);
    if (body.x >= b.x0 && body.x <= b.x1 && body.y >= b.y0 && body.y <= b.y1) return true;
  }
  return false;
}

// A barrier bar is a solid box the player (on foot or in a car) cannot
// pass through. A spike strip is flat: cars roll over it (and get bitten)
// and pedestrians walk over it. Returns true on contact with a barrier.
export function collideRoadblock(world, body, radius) {
  let hit = false;
  for (const rb of world.roadblocks) {
    if (rb.kind !== 'barrier') continue;
    const b = barrierBox(rb, radius);
    if (body.x < b.x0 || body.x > b.x1 || body.y < b.y0 || body.y > b.y1) continue;
    hit = true;
    // Push out along the smallest penetration axis.
    const left = body.x - b.x0;
    const right = b.x1 - body.x;
    const top = body.y - b.y0;
    const bottom = b.y1 - body.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) body.x = b.x0;
    else if (m === right) body.x = b.x1;
    else if (m === top) body.y = b.y0;
    else body.y = b.y1;
  }
  return hit;
}

function removeRoadblock(world, rb) {
  const i = world.roadblocks.indexOf(rb);
  if (i >= 0) world.roadblocks.splice(i, 1);
  removeRoadblockCars(world, rb);
}

// Take a roadblock's cars out of the world car list (when it clears
// because the heat dropped). Cars that already joined the chase stay.
function removeRoadblockCars(world, rb) {
  for (const car of rb.cars) {
    if (car.block) {
      const i = world.cars.indexOf(car);
      if (i >= 0) world.cars.splice(i, 1);
    }
  }
}

// Clear every roadblock (heat dropped, or the hacker jammed dispatch).
function clearRoadblocks(world) {
  for (const rb of world.roadblocks) removeRoadblockCars(world, rb);
  world.roadblocks = [];
}

function pickRoadblockLine(world, kind) {
  if (kind === 'spike') {
    return pick(world.rng, [
      'DISPATCH: Spike strips down on the main drag. Watch their tyres.',
      'DISPATCH: Stingers ready — suspect is coming in hot.',
      'DISPATCH: Spike strip set. Do not let them swerve around it.',
    ]);
  }
  return pick(world.rng, [
    'DISPATCH: Roadblock set ahead — suspect vehicle, do not let them through.',
    'DISPATCH: All units, roadblock on the main drag. Box them in.',
    'DISPATCH: Cordon up ahead. Suspect approaching the line.',
  ]);
}
