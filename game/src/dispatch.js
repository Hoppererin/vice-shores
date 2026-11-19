// Police dispatch, rewritten for v5.3: roadblocks, spike strips, flares,
// the helicopter — and three new systems for the hottest chases. The
// WANTED HEAT meter (0-100) lives between jobs: every crime pours heat
// in, it cools slowly while the player stays clean, and a hot player gets
// more roadblocks, faster police spawns and slower decay — the city
// remembers you even after the stars are gone. The POLICE SCANNER goes
// live at 3+ stars: the nearest roadblock is ringed on the minimap and
// its distance and compass bearing are read out under the radio line, so
// a driver can plan around the cordon instead of driving into it blind.
// And at five stars the district the player is in LOCKS DOWN: extra
// roadblocks, a second helicopter (Air-2), and the whole district turns
// red on the minimap. From four stars up, some roadblocks are ROLLING
// ones — two police cars driving side by side ahead of the player,
// blocking the lane while moving, so the player has to go around them or
// brake. And the radio lines are shuffled now, so the same line does not
// come up twice in a row.
//
// Dispatch is the system that makes a high wanted level feel like the
// whole city is after you. At 3+ stars it sets roadblocks on the roads
// ahead of the player; at 4+ stars a helicopter joins, and some
// roadblocks are spike strips instead of barriers. Every roadblock burns
// a flare so the player can see it coming. The hacker's jam (crew.js)
// shuts dispatch down for a while. Everything here is deterministic:
// roadblock spots, kinds and radio lines come from the world's seeded
// RNG, never from Math.random.
//
// Roadblock kinds:
//   'barrier' — two police cars parked across the road with a striped bar
//     between them. Solid: the player must go around it or ram it (ramming
//     breaks it, costs a star and sends its cars after them).
//   'spike' — a strip of spikes laid across the road. Harmless on foot and
//     invisible until close, but a car crossing it at speed pops its tyres:
//     top speed and steering are crippled for twenty seconds. Slow down and
//     crawl over it, or go around.
//   'rolling' — two police cars driving side by side ahead of the player,
//     blocking the lane while moving. They advance along the road in the
//     direction the player is travelling, so the player catches up to them
//     from behind: go around on the sidewalk, or brake and let them pull
//     away. Once the player passes them they break off and join the chase.
//
// The helicopters hover offset from the player (Air-1 up-left, Air-2
// up-right), not directly overhead, so their spotlight cones no longer
// sit on top of the police cars chasing behind — the v5 chase shot had
// them stacked on each other.

import { CFG } from './config.js';
import { clamp, compass, dist, pick, rand, shuffle } from './random.js';
import { makeCar } from './entities.js';
import { nearestRoad } from './city.js';
import { addCrime, heatHigh, updateHeat } from './police.js';
import { say } from './missions.js';

// ---------------------------------------------------------------- scanner

// Is the police scanner live right now? At 3+ stars dispatch's scanner
// is on — the nearest roadblock is ringed on the minimap and read out
// under the radio line. A blackout in the player's district grounds the
// scanner with the helicopters: no signal in the dark.
export function scannerLive(world) {
  if (world.wanted < CFG.scannerMinStars) return false;
  const ev = world.districtEvent;
  if (ev && ev.type === 'blackout' && ev.district === world.district) return false;
  return true;
}

// The nearest roadblock to the player, or null. The scanner rings this
// one on the minimap; with Ivy the Spotter on the crew, every roadblock
// is ringed instead (crew.js owns that check, render.js draws it).
export function nearestRoadblock(world) {
  let best = null;
  let bestD = Infinity;
  for (const rb of world.roadblocks) {
    const d = dist(rb.x, rb.y, world.player.x, world.player.y);
    if (d < bestD) { bestD = d; best = rb; }
  }
  return best;
}

// The scanner's readout line for the HUD: distance in metres and compass
// bearing to the nearest roadblock, or null when the scanner is dark.
export function scannerReadout(world) {
  if (!scannerLive(world)) return null;
  const rb = nearestRoadblock(world);
  if (!rb) return 'SCANNER: no roadblock in range';
  const d = Math.round(dist(rb.x, rb.y, world.player.x, world.player.y) / 10);
  const bearing = compass(world.player.x, world.player.y, rb.x, rb.y);
  return `SCANNER: roadblock ${d}m ${bearing} — ${rb.kind}`;
}

// ---------------------------------------------------------------- demand

// How many roadblocks the current wanted level calls for, and of which
// kinds. Three stars is one barrier; four adds a spike strip and the
// helicopter; five stars locks the district down: four roadblocks and
// Air-2 in the sky. A hot heat meter adds one more on top.
export function roadblocksWanted(world) {
  let n = 0;
  if (world.wanted < 3) n = 0;
  else if (world.wanted >= 5) n = 4;
  else if (world.wanted >= 4) n = 2;
  else n = 1;
  if (n > 0 && heatHigh(world)) n += CFG.heatRoadblockBonus;
  return n;
}

// The first helicopter flies from 4 stars up — unless a blackout in the
// player's district has grounded it.
export function heliWanted(world) {
  if (world.wanted < CFG.heliMinStars) return false;
  const ev = world.districtEvent;
  if (ev && ev.type === 'blackout' && ev.district === world.district) return false;
  return true;
}

// The second helicopter flies from 5 stars up — the lockdown's air cover.
export function heli2Wanted(world) {
  if (world.wanted < CFG.heli2MinStars) return false;
  const ev = world.districtEvent;
  if (ev && ev.type === 'blackout' && ev.district === world.district) return false;
  return true;
}

// The district locks down at 5 stars.
export function lockdownWanted(world) {
  return world.wanted >= CFG.lockdownMinStars;
}

// Is dispatch jammed right now (the hacker crew ability)?
export function dispatchJammed(world) {
  return world.time < (world.jamUntil || 0);
}

// One tick of dispatch: the heat meter, the roadblocks and the
// helicopters, the flares, the radio line, the lockdown. Called from
// stepWorld after updateWanted.
export function updateDispatch(world, dt) {
  const d = world.dispatch;
  d.cooldown = Math.max(0, d.cooldown - dt);
  if (d.msg && world.time > d.until) d.msg = null;
  stepFlares(world, dt);
  updateHeat(world, dt);

  const jammed = dispatchJammed(world);
  if (jammed) {
    // A jam clears the air: no new roadblocks, no helicopters, no
    // lockdown, and the ones out there stand down while the signal
    // is dead.
    if (world.roadblocks.length || world.heli || world.heli2 || world.lockdown) {
      clearRoadblocks(world);
      world.heli = null;
      world.heli2 = null;
      world.lockdown = null;
      world.flares = [];
      radio(world, 'DISPATCH: ... signal lost ... all units, hold position.');
    }
    return;
  }

  // The scanner ping: the moment the scanner goes live (3+ stars, and
  // not in a blackout), it pings once — the sound tells the driver the
  // readout is up without them having to look at the HUD.
  const scanLive = scannerLive(world);
  if (scanLive && !world.scannerWasLive) world.events.scanner = true;
  world.scannerWasLive = scanLive;

  // The lockdown: while the heat is at five stars, the district the
  // player is standing in is locked down. It follows the player — the
  // PD locks down wherever the crime is happening right now.
  if (lockdownWanted(world)) {
    if (!world.lockdown) {
      world.lockdown = { district: world.district, until: 0 };
      world.events.lockdown = true;
      radio(world, 'DISPATCH: LOCKDOWN — ' + world.district + ' is sealed. Nobody in or out.');
    } else if (world.lockdown.district !== world.district) {
      world.lockdown.district = world.district;
      radio(world, 'DISPATCH: LOCKDOWN moving to ' + world.district + '.');
    }
  } else if (world.lockdown) {
    world.lockdown = null;
  }

  // Roadblocks: spawn up to the level's demand, clear them when the heat
  // drops below 3 stars. A mission's scripted roadblock is a set piece,
  // not a heat response: it stays up at zero stars and only the job
  // ending, the hacker's jam, or the player breaking through removes it.
  // A blackout in the player's district stops new roadblocks there — the
  // PD cannot see to set them — but ones already up stay up.
  const ev = world.districtEvent;
  const blackoutHere = ev && ev.type === 'blackout' && ev.district === world.district;
  const want = roadblocksWanted(world);
  if (want === 0) {
    clearNonScriptedRoadblocks(world);
  } else {
    while (!blackoutHere && countDispatchRoadblocks(world) < want && d.cooldown <= 0) {
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

  // Helicopter Air-1: follows the player from 4 stars, gone below that —
  // unless a scripted scene locked it in place (the chase screenshot).
  // It hovers offset up-left of the player so the spotlight beam reads
  // as a beam, not a puddle on top of the chase.
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

  // Helicopter Air-2: the lockdown's air cover, from 5 stars. It mirrors
  // Air-1 on the other side — up-right — so the two beams cross over the
  // player instead of stacking on each other.
  if (heli2Wanted(world)) {
    if (!world.heli2) {
      world.heli2 = {
        x: world.player.x + CFG.heli2OffsetX,
        y: world.player.y + CFG.heli2OffsetY,
        active: true,
      };
      radio(world, 'DISPATCH: Air-2 joining the lockdown. Two birds on the suspect.');
    }
  } else if (world.heli2) {
    world.heli2 = null;
  }
  if (world.heli2) {
    const p = world.player;
    const tx = p.x + CFG.heli2OffsetX;
    const ty = p.y + CFG.heli2OffsetY;
    world.heli2.x += (tx - world.heli2.x) * Math.min(1, dt * 1.6);
    world.heli2.y += (ty - world.heli2.y) * Math.min(1, dt * 1.6);
  }

  // Step every roadblock: its cars hold the line until the player gets
  // close, then they break and join the chase. Spike strips arm the
  // moment the player crosses them at speed. Rolling roadblocks advance
  // along the road and break off once the player passes them.
  for (const rb of [...world.roadblocks]) stepRoadblock(world, rb, dt);
}

function countDispatchRoadblocks(world) {
  return world.roadblocks.filter((r) => !r.scripted).length;
}

// Which kind of roadblock does this spawn make? At three stars the PD
// mostly builds barriers; from four stars up, spike strips join the mix,
// and from four stars a rolling roadblock can appear instead — two cars
// driving side by side, blocking the lane while moving.
function pickRoadblockKind(world) {
  const r = rand(world.rng, 0, 1);
  if (world.wanted >= CFG.rollingMinStars && r < CFG.rollingChance) return 'rolling';
  const spikeChance = world.wanted >= 4 ? CFG.roadblockSpikeChance : 0.2;
  return rand(world.rng, 0, 1) < spikeChance ? 'spike' : 'barrier';
}

// Put a dispatch line on the HUD radio for a few seconds. The lines are
// shuffled once per kind, so the same line does not come up twice in a
// row while a chase runs long.
const linePools = {};
function shuffledLines(world, key, lines) {
  if (!linePools[key]) linePools[key] = shuffle(world.rng, [...lines]);
  const pool = linePools[key];
  const line = pool.pop();
  if (!pool.length) linePools[key] = shuffle(world.rng, [...lines]);
  return line;
}

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
// are travelling. kind is 'barrier', 'spike' or 'rolling'. Returns true
// when one was placed.
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
    dir: 1, // a rolling roadblock's travel direction along the road
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
  if (kind === 'rolling') {
    // Two police cars driving side by side, blocking the lane while
    // moving. They travel in the direction the player is heading, so the
    // player catches up to them from behind and has to go around.
    const across = spot.angle + Math.PI / 2;
    const off = CFG.rollingGap;
    const p = world.player;
    const body = p.inCar || p;
    // Which way along the road is the player travelling? The pair moves
    // the same way, so the player comes up behind them.
    const alongX = Math.cos(spot.angle);
    const alongY = Math.sin(spot.angle);
    const pvx = Math.cos(body.angle) * (body.speed || 0);
    const pvy = Math.sin(body.angle) * (body.speed || 0);
    const dot = pvx * alongX + pvy * alongY;
    rb.dir = dot >= 0 ? 1 : -1;
    for (const s of [-1, 1]) {
      const car = makeCar('police',
        spot.x + Math.cos(across) * off * s,
        spot.y + Math.sin(across) * off * s,
        spot.angle + (rb.dir < 0 ? Math.PI : 0), 'police', world.rng);
      car.speed = CFG.rollingSpeed;
      car.rolling = true; // stepPoliceCar leaves rolling cars to dispatch
      car.block = true;
      rb.cars.push(car);
      world.cars.push(car);
    }
    rb.x = spot.x;
    rb.y = spot.y;
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
// the PD never saw who did it, only the hiss. A rolling roadblock
// advances along the road and breaks off once the player passes it.
function stepRoadblock(world, rb, dt) {
  rb.ttl += dt;
  const p = world.player;
  const body = p.inCar || p;
  const radius = p.inCar ? body.wid * 0.6 : CFG.playerRadius;
  if (rb.kind === 'rolling') {
    stepRollingRoadblock(world, rb, dt);
    return;
  }
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

// A rolling roadblock advances along the road in the direction the player
// is travelling. Its two cars stay side by side, blocking the lane. Once
// the player gets past them — or they drift too far from the player —
// they break off and join the chase like any other roadblock car.
function stepRollingRoadblock(world, rb, dt) {
  const p = world.player;
  const body = p.inCar || p;
  // Advance the pair along the road.
  const vx = Math.cos(rb.angle) * rb.dir * CFG.rollingSpeed;
  const vy = Math.sin(rb.angle) * rb.dir * CFG.rollingSpeed;
  rb.x += vx * dt;
  rb.y += vy * dt;
  const across = rb.angle + Math.PI / 2;
  const off = CFG.rollingGap;
  for (let i = 0; i < rb.cars.length; i++) {
    const s = i === 0 ? -1 : 1;
    const car = rb.cars[i];
    car.x = rb.x + Math.cos(across) * off * s;
    car.y = rb.y + Math.sin(across) * off * s;
    car.angle = rb.angle + (rb.dir < 0 ? Math.PI : 0);
    car.speed = CFG.rollingSpeed;
  }
  // Has the player passed the pair? Project the player-pair vector onto
  // the road direction: past the pair means the player is ahead of them
  // along the direction of travel.
  const dx = body.x - rb.x;
  const dy = body.y - rb.y;
  const along = dx * Math.cos(rb.angle) * rb.dir + dy * Math.sin(rb.angle) * rb.dir;
  const far = dist(rb.x, rb.y, body.x, body.y) > 950;
  const edge = rb.x < 140 || rb.x > CFG.worldW - 140 || rb.y < 140 || rb.y > CFG.worldH - 140;
  if (along > 90 || far || edge) {
    for (const car of rb.cars) {
      car.block = false;
      car.rolling = false;
      car.speed = 300;
      car.fromRoadblock = true;
      if (!world.police.includes(car)) world.police.push(car);
    }
    removeRoadblock(world, rb);
    if (along > 90) radio(world, 'DISPATCH: Suspect slipped the rolling roadblock — pursue!');
    world.events.roadblockBreak = true;
  }
}

// The barrier bar's solid box: wide across the road, thin along it. A
// spike strip uses the same box so crossing it is detected the same way.
// A rolling roadblock has no box — its cars are real cars, and the
// bumper collision in world.js handles them.
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
  if (rb.kind === 'rolling') return false;
  const b = barrierBox(rb, radius);
  return body.x >= b.x0 && body.x <= b.x1 && body.y >= b.y0 && body.y <= b.y1;
}

// Is the body touching any roadblock's bar or strip? No push-out —
// stepRoadblock uses this so the block breaks (or bites) on contact.
export function roadblockContact(world, body, radius) {
  for (const rb of world.roadblocks) {
    if (rb.kind === 'rolling') continue;
    const b = barrierBox(rb, radius);
    if (body.x >= b.x0 && body.x <= b.x1 && body.y >= b.y0 && body.y <= b.y1) return true;
  }
  return false;
}

// A barrier bar is a solid box the player (on foot or in a car) cannot
// pass through. A spike strip is flat: cars roll over it (and get bitten)
// and pedestrians walk over it. A rolling roadblock is two real cars, so
// it has no box at all. Returns true on contact with a barrier.
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
    return shuffledLines(world, 'spike', [
      'DISPATCH: Spike strips down on the main drag. Watch their tyres.',
      'DISPATCH: Stingers ready — suspect is coming in hot.',
      'DISPATCH: Spike strip set. Do not let them swerve around it.',
    ]);
  }
  if (kind === 'rolling') {
    return shuffledLines(world, 'rolling', [
      'DISPATCH: Rolling roadblock moving up the main drag. Box them in.',
      'DISPATCH: Two units rolling ahead of the suspect — hold the lane.',
      'DISPATCH: Rolling cordon in place. Suspect cannot get past.',
    ]);
  }
  return shuffledLines(world, 'barrier', [
    'DISPATCH: Roadblock set ahead — suspect vehicle, do not let them through.',
    'DISPATCH: All units, roadblock on the main drag. Box them in.',
    'DISPATCH: Cordon up ahead. Suspect approaching the line.',
  ]);
}
