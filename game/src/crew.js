// The crew, rewritten for v5.3: six specialists Rico can hire once he
// has the cash — five hires and one promotion. Each one gives a concrete,
// visible bonus — a driver who makes every car faster, a hacker who can
// jam police dispatch once per job, a lookout who marks the police and
// roadblocks on the minimap, a fixer who launders heat and slows the PD
// down, a wheelman who brings you a fresh getaway car — and, new in
// v5.3, Ivy the Lookout can be PROMOTED to Spotter: once she is a
// Spotter, every police car and every roadblock is marked on the minimap
// live, and the police scanner shows all of them instead of just the
// nearest one. Recruited crew show up as companions on foot in free
// roam. Hiring is a simple menu (C), paid once, saved with the game.
//
// v5.3 adds the promotion: it is a second fee on top of Ivy's hire price,
// bought with the 6 key in the crew menu, and it only opens once Ivy is
// already on the crew. A Spotter Ivy walks with a gold shirt and a gold
// ring, and her minimap range is the whole city — the map never lies
// when she is watching.

import { CFG } from './config.js';
import { clamp, dist } from './random.js';
import { districtAt, nearestRoad } from './city.js';
import { makeGetawayCar } from './entities.js';
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
  {
    id: 'wheelman',
    name: 'Dante the Wheelman',
    cost: 1000,
    blurb: 'Press X once per job: a fresh black getaway car appears ahead of you — climb straight in. Every car is +8% faster with him on the crew.',
    line: 'Dante: One call and the fastest car in Vice Shores is yours, Rico. One call.',
  },
];

// The promotion row in the crew menu: not a hire, an upgrade. Ivy must
// already be on the crew, and the fee is on top of her hire price. Once
// promoted she is a Spotter for the rest of the game.
export const SPOTTER_PROMOTION = {
  id: 'spotter',
  name: 'Ivy the Spotter',
  cost: 500,
  blurb: 'Promote Ivy: every police car and every roadblock is marked live on the minimap, and the scanner shows them all.',
  line: 'Ivy: Spotter now, Rico. Every cop, every cordon — I see them all, and so will you.',
};

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

// Promote Ivy the Lookout to Spotter: a second fee, a live map. Ivy must
// already be hired, and the promotion is once — a Spotter stays a Spotter.
export function promoteSpotter(world) {
  if (!world.crew.lookout) {
    say(world, 'Mama Lou: Hire Ivy the Lookout first — a Spotter starts as a Lookout.');
    return false;
  }
  if (world.crew.spotter) return false;
  const cost = crewCost(world, SPOTTER_PROMOTION);
  if (world.player.cash < cost) {
    say(world, `Mama Lou: Promoting Ivy costs $${cost}. Come back when your pockets are heavier.`);
    return false;
  }
  world.player.cash -= cost;
  world.crew.spotter = true;
  say(world, SPOTTER_PROMOTION.line);
  world.events.recruit = true;
  world.events.cash = -cost;
  world.events.spotter = true;
  // Ivy's companion swaps to her Spotter colours: a gold shirt, so the
  // promotion reads on the street as well as on the map.
  for (const c of world.companions) {
    if (c.crew === 'lookout') c.shirt = '#ffd23c';
  }
  return true;
}

// Is Ivy a Spotter right now? The minimap and the scanner both read this.
export function isSpotter(world) {
  return !!world.crew.spotter;
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
  // A launder cools the heat meter too — the paperwork got lost, and
  // the city forgets a little faster with it.
  world.heat = Math.max(0, (world.heat || 0) - CFG.fixerLaunderStars * CFG.heatPerStar);
  // Foot cops within 400 px lose the trail and stand down.
  world.footCops = world.footCops.filter((c) => dist(c.x, c.y, world.player.x, world.player.y) > 400);
  say(world, `Sal: ${before} stars down to ${world.wanted}. The paperwork got lost.`);
  world.events.launder = true;
  return true;
}

// The wheelman's getaway swap: once per job, a fresh black getaway car
// appears on the nearest road ahead of the player, and Rico climbs
// straight into it. The old car — if he was driving one — is left
// behind, parked where it stood. The getaway car is the fastest thing
// in the city, with fresh tyres and a full tank of nerve.
export function wheelmanSwap(world) {
  if (!world.crew.wheelman) return false;
  if (world.wheelmanUsedThisJob) {
    say(world, 'Dante: Already brought you one car on this job. One swap per job, Rico.');
    return false;
  }
  const player = world.player;
  const body = player.inCar || player;
  // The nearest road ahead of the player's heading, a short drive away.
  const ahead = 160;
  const fx = body.x + Math.cos(body.angle) * ahead;
  const fy = body.y + Math.sin(body.angle) * ahead;
  const road = nearestRoad(fx, fy);
  if (!road) return false;
  // Step out of the old car first: it stays parked where it stood.
  if (player.inCar) {
    const old = player.inCar;
    old.driver = false;
    old.speed = 0;
    player.inCar = null;
  }
  const car = makeGetawayCar(road.x, road.y, world.rng);
  car.angle = road.angle;
  world.cars.push(car);
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = 0;
  world.wheelmanUsedThisJob = true;
  say(world, 'Dante: Your getaway is here, Rico. Black, fast, and nobody saw it coming.');
  world.events.wheelman = true;
  return true;
}

// Is the wheelman's once-per-job swap still available right now?
export function wheelmanReady(world) {
  return !!world.crew.wheelman && !world.wheelmanUsedThisJob;
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

// Top-speed multiplier from Dante the Wheelman: every car runs a little
// faster just by having him on the crew, on top of Mara's bonus.
export function wheelmanTopBonus(world) {
  return world.crew.wheelman ? CFG.wheelmanTopBonus : 1;
}

// A companion is a crew member walking with Rico on foot. They follow at
// a loose distance and keep out of buildings, like a pedestrian with a
// destination: Rico.
export function spawnCompanion(world, roleId) {
  const p = world.player;
  const shirts = {
    driver: '#d03030', hacker: '#30a030', lookout: '#e8a83c', fixer: '#2a2a3a',
    wheelman: '#6a3a8a',
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
// crew fans out instead of stacking on one spot. Six crew now, so six
// slots — the Spotter takes the far corner.
export function stepCompanions(world, dt) {
  const p = world.player;
  const slots = [
    { dx: 52, dy: 52 }, { dx: -52, dy: 52 },
    { dx: 52, dy: -52 }, { dx: -52, dy: -52 },
    { dx: 0, dy: 78 }, { dx: 0, dy: -78 },
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

// Restore companions for crew hired in a loaded save. A Spotter Ivy
// keeps her gold shirt — the promotion travels with the save.
export function restoreCompanions(world) {
  for (const role of CREW_ROLES) {
    if (world.crew[role.id]) spawnCompanion(world, role.id);
  }
  if (world.crew.spotter) {
    for (const c of world.companions) {
      if (c.crew === 'lookout') c.shirt = '#ffd23c';
    }
  }
}
