// The wanted system, rewritten for v5.1: crimes raise the heat, the
// heat decays when the police lose you, and the police themselves —
// patrol cars that chase and ram, foot cops who grab you on foot, and
// from four stars up, the PIT manoeuvre. Busted or wasted ends the run.
//
// v5.1 changes:
// - PIT: a police car that pulls alongside the player's rear quarter
//   steers into it and spins the player's car out (steering locked for
//   about a second, speed bled off, a little damage). It only happens at
//   4+ stars, one car at a time, with a cooldown — a PIT every frame
//   would be unplayable.
// - Interception: police cars no longer chase where the player is, they
//   chase where the player is going — the target is the player's
//   position half a second ahead. A fast car in a straight line gets cut
//   off instead of trailed forever.
// - Decay: the wanted level only falls when no police car is within
//   600 px and the helicopter is gone, and the clock is stretched or
//   shrunk by the district's standing and by Sal the Fixer's crew bonus.
//   Hiding properly is the way out; the helicopter pins the heat in
//   place until it leaves.
// - Tackle: two foot cops grabbing the player at once fill the hold
//   meter twice as fast — being swarmed on foot is now properly scary.

import { CFG } from './config.js';
import { angleDiff, clamp, dist, rand } from './random.js';
import { makeCar } from './entities.js';
import { collideBuildings, randomRoadPoint } from './city.js';
import { fixerSpawnFactor, fixerDecayFactor } from './crew.js';

// A crime happened: raise the wanted level and restart the decay clock.
// The district where it happened thinks less of Rico from now on.
export function addCrime(world, stars) {
  world.wanted = clamp(world.wanted + stars, 0, 5);
  world.crimeTimer = 0;
  world.quietTimer = 0;
  if (world.wanted > 0) world.events.crime = true;
  if (world.standing) {
    const d = world.district || 'Neon Mile';
    const before = world.standing[d];
    if (before !== undefined) {
      world.standing[d] = clamp(before - CFG.standingCrimeLoss, -100, 100);
      if (world.standing[d] !== before) {
        world.standingFlash = { district: d, delta: world.standing[d] - before, until: world.time + 4 };
      }
    }
  }
}

// How many police cars the current level calls for.
export function policeCarsWanted(world) {
  if (world.wanted <= 0) return 0;
  return Math.min(CFG.maxPoliceCars, world.wanted);
}

// Foot cops join the hunt from level 2.
export function footCopsWanted(world) {
  if (world.wanted < 2) return 0;
  return Math.min(3, world.wanted - 1);
}

// One tick of the wanted clock: decay after a quiet stretch, spawn and
// despawn police to match the level. The hacker's jam stops all new
// police, the helicopter pins the wanted level in place (no decay while
// Air-1 is overhead), and the district's standing plus Sal the Fixer
// stretch or shrink the response — liked districts are slow to send cars
// and quick to let the heat die, hated ones the opposite.
export function updateWanted(world, dt) {
  world.crimeTimer += dt;
  const jammed = world.time < (world.jamUntil || 0);
  const heliUp = !!world.heli;
  const district = world.district;
  const response = world.standing
    ? 1 - ((world.standing[district] || 0) / CFG.standingPayoutScale)
    : 1;
  // Decay clock: base 26 s, stretched by a hostile district, shrunk by a
  // friendly one and by Sal the Fixer being on the crew.
  const decaySeconds = CFG.wantedDecaySeconds * (2 - response) * fixerDecayFactor(world);
  const policeNear = world.police.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 600) ||
    world.footCops.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 300);
  if (world.wanted > 0 && !policeNear && !heliUp && world.crimeTimer > decaySeconds) {
    world.wanted -= 1;
    world.crimeTimer = 0;
    world.events.wantedDown = true;
  }

  // Spawn police cars up to the level's demand, on roads away from view.
  // Jammed dispatch sends nobody; a hated district sends them sooner and
  // Sal the Fixer slows the whole response down.
  const wantCars = jammed ? 0 : policeCarsWanted(world);
  world.spawnTimer = (world.spawnTimer || 0) + dt;
  const spawnGap = 1.2 * response * fixerSpawnFactor(world);
  while (world.police.length < wantCars && world.spawnTimer >= spawnGap) {
    world.spawnTimer = 0;
    const spot = randomRoadPoint(world.rng, world.city);
    if (dist(spot.x, spot.y, world.player.x, world.player.y) < 420) continue;
    const car = makeCar('police', spot.x, spot.y, rand(world.rng, 0, Math.PI * 2), 'police', world.rng);
    car.speed = 200;
    world.police.push(car);
    world.cars.push(car);
  }
  while (world.police.length > wantCars) {
    // Prefer removing a regular patrol car. A roadblock car that just
    // joined the chase stays while the heat is on — popping it the frame
    // after the breach would undo the roadblock entirely — and stands
    // down with the rest once the player has cooled off.
    let idx = world.police.findIndex((c) => !c.fromRoadblock);
    if (idx < 0) {
      if (world.wanted > 0) break;
      idx = world.police.length - 1;
    }
    const gone = world.police.splice(idx, 1)[0];
    const i = world.cars.indexOf(gone);
    if (i >= 0) world.cars.splice(i, 1);
  }

  // Foot cops spawn near the player, on foot. None while jammed.
  const wantCops = jammed ? 0 : footCopsWanted(world);
  while (world.footCops.length < wantCops) {
    const a = rand(world.rng, 0, Math.PI * 2);
    const r = rand(world.rng, 260, 380);
    world.footCops.push({
      x: clamp(world.player.x + Math.cos(a) * r, 40, CFG.worldW - 40),
      y: clamp(world.player.y + Math.sin(a) * r, 40, CFG.worldH - 40),
      angle: 0, speed: 0, downTimer: 0, cop: true,
      shirt: '#2a4a8a', skin: '#e8b88a', walkPhase: 0,
    });
  }
  while (world.footCops.length > wantCops) world.footCops.pop();
}

// A police car chases the player: steer at where they are going, ram to
// damage, and at four stars and up, PIT them when the window opens.
// Cars holding a roadblock line stay parked until dispatch breaks them.
export function stepPoliceCar(world, car, dt) {
  if (car.block) return; // roadblock cars hold the line; dispatch moves them
  if (car.pitCooldown > 0) car.pitCooldown -= dt;
  const player = world.player;
  const target = player.inCar || player;
  // Intercept: aim at where the player will be in half a second, not
  // where they are. A straight-line getaway gets cut off.
  const lead = 0.5;
  const tx = target.x + Math.cos(target.angle) * (target.speed || 0) * lead;
  const ty = target.y + Math.sin(target.angle) * (target.speed || 0) * lead;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const d = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  car.angle += clamp(angleDiff(car.angle, want), -3.4 * dt, 3.4 * dt);
  const goal = d > 90 ? 560 : 420;
  car.speed += clamp(goal - car.speed, -500 * dt, 380 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, CFG.worldW - 30);
  car.y = clamp(car.y, 30, CFG.worldH - 30);
  collideBuildings(world.city, car, car.wid * 0.6);

  // Distance to the player themself, after moving — NOT to the intercept
  // point. The PIT and the ram are about contact with the player's car,
  // and the intercept point sits half a second ahead of it, so measuring
  // against it would mean the cop never actually touches the player.
  const dp = dist(car.x, car.y, target.x, target.y);

  // The PIT: at 4+ stars, a police car alongside the player's rear
  // quarter steers into it and spins the player out. One PIT per car per
  // cooldown, and never while the player is already spinning.
  if (player.inCar && world.wanted >= CFG.pitMinStars && car.pitCooldown <= 0 &&
      !player.inCar.pitTimer && dp < 95) {
    const rear = Math.atan2(
      player.inCar.y - car.y, player.inCar.x - car.x);
    const behind = Math.abs(angleDiff(player.inCar.angle, rear)) < 1.1;
    if (behind) {
      car.pitCooldown = CFG.pitCooldown;
      player.inCar.pitTimer = CFG.pitSpinSeconds;
      player.inCar.speed *= 0.45;
      player.health -= CFG.pitDamage;
      world.events.pit = true;
    }
  }

  // Ramming the player's car hurts the player and slows both cars.
  if (player.inCar && dp < (car.len + player.inCar.len) * 0.42) {
    if (car.hitCooldown <= 0) {
      player.health -= 8;
      player.inCar.speed *= 0.55;
      car.speed *= 0.5;
      car.hitCooldown = 1.2;
      world.events.rammed = true;
    }
  }
  if (car.hitCooldown > 0) car.hitCooldown -= dt;
}

// A foot cop chases the player on foot. Grabbing the player on foot for
// 1.4 seconds means BUSTED — and two cops holding at once fill the meter
// twice as fast, so being swarmed is properly scary.
export function stepFootCop(world, cop, dt) {
  const player = world.player;
  if (cop.downTimer > 0) { cop.downTimer -= dt; return; }
  const d = dist(cop.x, cop.y, player.x, player.y);
  const want = Math.atan2(player.y - cop.y, player.x - cop.x);
  cop.angle += clamp(angleDiff(cop.angle, want), -6 * dt, 6 * dt);
  const speed = player.inCar ? 300 : 235; // cops sprint after a car, run after a runner
  cop.x += Math.cos(cop.angle) * speed * dt;
  cop.y += Math.sin(cop.angle) * speed * dt;
  collideBuildings(world.city, cop, 12);
  cop.walkPhase += dt * 11;

  if (!player.inCar && d < 26) {
    const holders = world.footCops.filter((c) => c.downTimer <= 0 &&
      dist(c.x, c.y, player.x, player.y) < 26).length;
    player.heldTimer += dt * (holders >= 2 ? 2 : 1);
    if (player.heldTimer >= CFG.bustHoldSeconds) {
      world.screen = 'busted';
      world.events.busted = true;
    }
  } else {
    player.heldTimer = Math.max(0, player.heldTimer - dt * 2);
  }
}

// The player just got busted or wasted: reset the run, keep the cash.
export function resetAfterArrest(world) {
  const player = world.player;
  player.health = CFG.playerHealth;
  player.heldTimer = 0;
  world.wanted = 0;
  world.crimeTimer = 0;
  // Clear the police presence.
  for (const car of world.police) {
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  }
  world.police = [];
  world.footCops = [];
  // On foot again, back at Mama Lou's corner.
  if (player.inCar) player.inCar = null;
  player.x = 1400;
  player.y = 2000;
  player.angle = -Math.PI / 2;
  player.speed = 0;
  world.screen = 'play';
}
