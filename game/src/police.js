// The wanted system: crimes raise the heat, the heat decays when the
// police lose you, and the police themselves — patrol cars that chase and
// ram, foot cops who grab you on foot. Busted or wasted ends the run.

import { CFG } from './config.js';
import { angleDiff, clamp, dist, pick, rand } from './random.js';
import { makeCar } from './entities.js';
import { collideBuildings, nearestNode, randomRoadPoint } from './city.js';

// A crime happened: raise the wanted level and restart the decay clock.
export function addCrime(world, stars) {
  world.wanted = clamp(world.wanted + stars, 0, 5);
  world.crimeTimer = 0;
  world.quietTimer = 0;
  if (world.wanted > 0) world.events.crime = true;
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

// One tick of the wanted clock: decay after 26 quiet seconds, spawn and
// despawn police to match the level.
export function updateWanted(world, dt) {
  world.crimeTimer += dt;
  const policeNear = world.police.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 500) ||
    world.footCops.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 300);
  if (world.wanted > 0 && !policeNear && world.crimeTimer > CFG.wantedDecaySeconds) {
    world.wanted -= 1;
    world.crimeTimer = 0;
    world.events.wantedDown = true;
  }

  // Spawn police cars up to the level's demand, on roads away from view.
  const wantCars = policeCarsWanted(world);
  while (world.police.length < wantCars) {
    const spot = randomRoadPoint(world.rng, world.city);
    if (dist(spot.x, spot.y, world.player.x, world.player.y) < 420) continue;
    const car = makeCar('police', spot.x, spot.y, rand(world.rng, 0, Math.PI * 2), 'police', world.rng);
    car.speed = 200;
    world.police.push(car);
    world.cars.push(car);
  }
  while (world.police.length > wantCars) {
    const gone = world.police.pop();
    const i = world.cars.indexOf(gone);
    if (i >= 0) world.cars.splice(i, 1);
  }

  // Foot cops spawn near the player, on foot.
  const wantCops = footCopsWanted(world);
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

// A police car chases the player: steer at them, ram to damage.
export function stepPoliceCar(world, car, dt) {
  const player = world.player;
  const target = player.inCar || player;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
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

  // Ramming the player's car hurts the player and slows both cars.
  if (player.inCar && d < (car.len + player.inCar.len) * 0.42) {
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
// 1.4 seconds means BUSTED.
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
    player.heldTimer += dt;
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
