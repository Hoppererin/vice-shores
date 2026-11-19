// The crew, rewritten for v5.1: four specialists Rico can hire once he
// has the cash. Each one gives a concrete, visible bonus — a driver who
// makes every car faster, a hacker who can jam police dispatch once per
// job, a lookout who marks the police and roadblocks on the minimap, and
// a fixer who launders heat and slows the PD down. Recruited crew show
// up as companions on foot in free roam. Hiring is a simple menu (C),
// paid once, saved with the game.
//
// v5.1 adds Sal the Fixer: press G once per job and Sal makes two wanted
// stars vanish (the PD's paperwork gets lost), clears the foot cops
// nearby, and — just by being on the crew — the police are slower to
// send cars and the heat dies faster. He costs the most because he is
// worth the most when the whole city is after you.

import { CFG } from './config.js';
import { clamp, dist } from './random.js';
import { districtAt } from './city.js';
import { say } from './missions.js';

export const CREW_ROLES = [
  {
    id: 'driver',
    name: 'Mara the Driver',
    cost: 400,
    blurb: 'Getaway cars feel faster: +12% top speed, sharper steering.',
    line: 'Mara: You drive, I make it sing. Keys are yours, Rico.',
  },
  {
    id: 'hacker',
    name: 'Zero the Hacker',
    cost: 600,
    blurb: 'Press H once per job: police dispatch goes dark for 20 seconds.',
    line: 'Zero: Cameras, radios, dispatch — I own them for twenty seconds. Use it well.',
  },
  {
    id: 'lookout',
    name: 'Ivy the Lookout',
    cost: 300,
    blurb: 'Police and roadblocks are marked on the minimap, further out.',
    line: 'Ivy: I see everything, Rico. The map never lies when I am watching.',
  },
  {
    id: 'fixer',
    name: 'Sal the Fixer',
    cost: 800,
    blurb: 'Press G once per job: two wanted stars vanish, foot cops walk away. Police are slower to respond while he is on the crew.',
    line: 'Sal: Two stars, gone. The paperwork got lost, Rico. It happens.',
  },
];

// The price of a role here and now: the district you are standing in
// knocks the price down when it likes you.
export function crewCost(world, role) {
  const d = districtAt(world.player.x, world.player.y);
  const standing = (world.standing && world.standing[d]) || 0;
  const discount = Math.max(0, Math.floor(standing / CFG.standingDiscountDiv));
  return Math.max(100, role.cost - discount);
}

// Hire a crew member: pay once, get the bonus for the rest of the game.
export function recruitCrew(world, roleId) {
  const role = CREW_ROLES.find((r) => r.id === roleId);
  if (!role || world.crew[roleId]) return false;
  const cost = crewCost(world, role);
  if (world.player.cash < cost) {
    say(world, `Mama Lou: ${role.name} costs $${cost}. Come back when your pockets are heavier.`);
    return false;
  }
  world.player.cash -= cost;
  world.crew[roleId] = true;
  say(world, role.line);
  world.events.recruit = true;
  world.events.cash = -cost;
  spawnCompanion(world, roleId);
  return true;
}

// The hacker's jam: dispatch goes dark for 20 seconds, once per job.
// While it runs, no new roadblocks, no helicopter, no fresh police.
export function hackJam(world) {
  if (!world.crew.hacker) return false;
  if (world.jamUsedThisJob) {
    say(world, 'Zero: Already burned the jam on this job. One per job, Rico.');
    return false;
  }
  if (world.time < (world.jamUntil || 0)) return false;
  world.jamUntil = world.time + CFG.jamSeconds;
  world.jamUsedThisJob = true;
  say(world, 'Zero: Dispatch is dark for twenty seconds. Move, move, move!');
  world.events.hack = true;
  return true;
}

// The fixer's launder: two wanted stars vanish, once per job, and the
// foot cops nearby give up and walk away. Nothing to lose if the heat
// is already low — it still counts as used, so save it for a real chase.
export function fixerLaunder(world) {
  if (!world.crew.fixer) return false;
  if (world.fixerUsedThisJob) {
    say(world, 'Sal: Already spent the favour on this job. One launder per job.');
    return false;
  }
  if (world.wanted <= 0) {
    say(world, 'Sal: No heat to launder right now. Save it, Rico.');
    return false;
  }
  world.fixerUsedThisJob = true;
  const before = world.wanted;
  world.wanted = clamp(world.wanted - CFG.fixerLaunderStars, 0, 5);
  world.crimeTimer = 0;
  // Foot cops within 400 px lose the trail and stand down.
  world.footCops = world.footCops.filter((c) => dist(c.x, c.y, world.player.x, world.player.y) > 400);
  say(world, `Sal: ${before} stars down to ${world.wanted}. The paperwork got lost.`);
  world.events.launder = true;
  return true;
}

// How much slower the police are to send cars while Sal is on the crew.
// Applied to the spawn gap in police.js: a bigger gap means fewer cars.
export function fixerSpawnFactor(world) {
  return world.crew.fixer ? CFG.fixerSpawnSlow : 1;
}

// How much faster the wanted level decays while Sal is on the crew.
// Applied to the decay clock in police.js: fewer seconds per star.
export function fixerDecayFactor(world) {
  return world.crew.fixer ? CFG.fixerDecayBonus : 1;
}

// Top-speed multiplier for the car the player is driving right now.
export function driverTopBonus(world) {
  return world.crew.driver ? CFG.driverTopBonus : 1;
}

// Steering multiplier for the car the player is driving right now.
export function driverTurnBonus(world) {
  return world.crew.driver ? CFG.driverTurnBonus : 1;
}

// A companion is a crew member walking with Rico on foot. They follow at
// a loose distance and keep out of buildings, like a pedestrian with a
// destination: Rico.
export function spawnCompanion(world, roleId) {
  const p = world.player;
  const shirts = {
    driver: '#d03030', hacker: '#30a030', lookout: '#e8a83c', fixer: '#2a2a3a',
  };
  world.companions.push({
    x: p.x + 40, y: p.y + 40, angle: 0, speed: 0,
    target: null, downTimer: 0, fleeing: false,
    shirt: shirts[roleId] || '#e0e0e0', skin: '#e8b88a',
    walkPhase: 0, cop: false, crew: roleId,
  });
}

// Step the companions: drift toward a spot near Rico, never too close,
// never through a wall. Each companion takes a different offset so the
// crew fans out instead of stacking on one spot.
export function stepCompanions(world, dt) {
  const p = world.player;
  const slots = [
    { dx: 52, dy: 52 }, { dx: -52, dy: 52 },
    { dx: 52, dy: -52 }, { dx: -52, dy: -52 },
  ];
  for (let i = 0; i < world.companions.length; i++) {
    const c = world.companions[i];
    if (p.inCar) {
      // Riding along: keep up by teleporting near the car when far behind.
      const d = dist(c.x, c.y, p.x, p.y);
      if (d > 700) { c.x = p.x + 60; c.y = p.y + 60; }
      continue;
    }
    const slot = slots[i % slots.length];
    const wantX = p.x + slot.dx;
    const wantY = p.y + slot.dy;
    const d = dist(c.x, c.y, wantX, wantY);
    if (d > 26) {
      const a = Math.atan2(wantY - c.y, wantX - c.x);
      c.angle = a;
      c.speed = clamp(d * 2.2, 60, 250);
      c.x += Math.cos(a) * c.speed * dt;
      c.y += Math.sin(a) * c.speed * dt;
      c.walkPhase += dt * 10;
    } else {
      c.speed = 0;
    }
    c.x = clamp(c.x, 40, CFG.worldW - 40);
    c.y = clamp(c.y, 40, CFG.worldH - 40);
  }
}

// Restore companions for crew hired in a loaded save.
export function restoreCompanions(world) {
  for (const role of CREW_ROLES) {
    if (world.crew[role.id]) spawnCompanion(world, role.id);
  }
}
