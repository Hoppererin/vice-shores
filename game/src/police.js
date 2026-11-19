// The wanted system, rewritten for v5.3: crimes raise the heat, the
// heat decays when the police lose you, and the police themselves —
// patrol cars that chase and ram, foot cops who grab you on foot, and
// from four stars up, the PIT manoeuvre. Busted or wasted ends the run.
//
// v5.3 changes:
// - The stakeout: at 4+ stars, or when a job's final leg names one, a
//   police car parks near the destination with its lights off and waits.
//   When the player comes within range it bursts out with a radio call
//   and joins the chase at full speed — the last leg of a job is no
//   longer a victory lap. A stakeout stands down after a while, and a
//   busted run clears it with the rest of the heat.
// - The heat meter (dispatch.js) now feeds the decay: a hot player
//   cools down slower, and the police arrive faster, until the heat
//   itself dies down. The wanted stars are the alarm; the heat is the
//   city's memory of you.
// - District events change the response too: a raid sends cars faster
//   and holds the heat longer, a blackout slows everything down.
// - Roadblock avoidance: a chasing police car no longer drives straight
//   into its own side's cordon. If a barrier bar sits ahead of it on
//   its lane, it steers around the end of the bar instead of grinding
//   against it — the chase stays fast and the roadblock stays a
//   roadblock, not a traffic jam of police cars.
// - Five-star ramming: at five stars the police stop trying to catch
//   you and start trying to hit you. Pursuit speed goes up, rams hit
//   harder, and a car closing in from behind gets a burst of speed to
//   make contact — a five-star chase is a demolition derby.
// - Hostile turf: in a district that hates Rico the PD sends one more
//   patrol car and one more foot cop, and they arrive faster. Home turf
//   is the opposite — the locals are slow to call.
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
import { makeCar, makeStakeoutCar } from './entities.js';
import { collideBuildings, randomRoadPoint } from './city.js';
import { fixerSpawnFactor, fixerDecayFactor } from './crew.js';
import { turfOf } from './standing.js';

// ---------------------------------------------------------------- heat

// The wanted heat meter (0-100): the city's memory of Rico. It lives
// between jobs and only fades with quiet driving. Pouring heat in is
// part of addCrime itself, so every crime in the game — a punch, a
// stolen car, a breached roadblock — feeds the meter through the same
// funnel and the heat can never drift out of sync with the stars.
export function pourHeat(world, stars) {
  world.heat = clamp((world.heat || 0) + stars * CFG.heatPerStar + CFG.heatPerCrime, 0, CFG.heatMax);
}

// Is the heat meter over the line? A hot player is on high alert: more
// roadblocks, faster police, slower decay.
export function heatHigh(world) {
  return (world.heat || 0) >= CFG.heatLine;
}

// One tick of the heat meter: it cools while the player stays clean —
// faster with no police near, slower while the chase is still on. The
// heat never resets a job: it is the city's memory, and it only fades
// with quiet driving.
export function updateHeat(world, dt) {
  const policeNear = world.police.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 600) ||
    world.footCops.some((c) => dist(c.x, c.y, world.player.x, world.player.y) < 300);
  const rate = policeNear ? CFG.heatDecayPolice : CFG.heatDecayPerSecond;
  world.heat = Math.max(0, (world.heat || 0) - rate * dt);
}

// A crime happened: raise the wanted level and restart the decay clock.
// The district where it happened thinks less of Rico from now on — and
// the heat meter pours in on top of the stars.
export function addCrime(world, stars) {
  world.wanted = clamp(world.wanted + stars, 0, 5);
  world.crimeTimer = 0;
  world.quietTimer = 0;
  if (world.wanted > 0) world.events.crime = true;
  pourHeat(world, stars);
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

// How many police cars the current level calls for. A hostile district
// sends one more — the locals there call the PD on you.
export function policeCarsWanted(world) {
  if (world.wanted <= 0) return 0;
  const hostile = turfOf(world, world.district) === 'hostile' ? CFG.hostilePoliceBonus : 0;
  return Math.min(CFG.maxPoliceCars + hostile, world.wanted + hostile);
}

// Foot cops join the hunt from level 2. A hostile district sends one more.
export function footCopsWanted(world) {
  if (world.wanted < 2) return 0;
  const hostile = turfOf(world, world.district) === 'hostile' ? CFG.hostileFootCops : 0;
  return Math.min(3 + hostile, world.wanted - 1 + hostile);
}

// The police response factor for the district the player is in right now:
// standing, turf, the heat meter and any district event all stretch or
// shrink it. A number below 1 means the PD is slow; above 1, fast.
export function responseFactor(world) {
  const district = world.district;
  let f = world.standing
    ? 1 - ((world.standing[district] || 0) / CFG.standingPayoutScale)
    : 1;
  if (turfOf(world, district) === 'hostile') f *= CFG.hostileSpawnFactor;
  if ((world.heat || 0) >= CFG.heatLine) f *= CFG.heatSpawnFactor;
  const ev = world.districtEvent;
  if (ev && ev.district === district) {
    if (ev.type === 'raid') f *= CFG.eventRaidSpawnFactor;
    if (ev.type === 'race') f *= CFG.eventRaceSpawnFactor;
    if (ev.type === 'blackout') f *= CFG.eventBlackoutSpawnFactor;
  }
  return f;
}

// One tick of the wanted clock: decay after a quiet stretch, spawn and
// despawn police to match the level. The hacker's jam stops all new
// police, the helicopter pins the wanted level in place (no decay while
// Air-1 is overhead), and the district's standing plus Sal the Fixer
// stretch or shrink the response — liked districts are slow to send cars
// and quick to let the heat die, hated ones the opposite. A hostile
// district sends them sooner still. The heat meter stretches the decay
// clock further while it is high.
export function updateWanted(world, dt) {
  world.crimeTimer += dt;
  const jammed = world.time < (world.jamUntil || 0);
  const heliUp = !!world.heli;
  const response = responseFactor(world);
  // Decay clock: base 26 s, stretched by a hostile district, shrunk by a
  // friendly one and by Sal the Fixer being on the crew — and stretched
  // again while the heat meter is high, or a raid is running.
  let decaySeconds = CFG.wantedDecaySeconds * (2 - response) * fixerDecayFactor(world);
  if ((world.heat || 0) >= CFG.heatLine) decaySeconds *= CFG.heatDecayFactor;
  const ev = world.districtEvent;
  if (ev && ev.type === 'raid' && ev.district === world.district) decaySeconds *= CFG.eventRaidDecayFactor;
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
    // down with the rest once the player has cooled off. A stakeout car
    // is never trimmed by the spawn logic; it stands down on its own
    // timer or when the player is busted.
    let idx = world.police.findIndex((c) => !c.fromRoadblock && !c.stakeout);
    if (idx < 0) {
      if (world.wanted > 0) break;
      idx = world.police.findIndex((c) => !c.stakeout);
      if (idx < 0) break;
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

  // Stakeouts: a parked car with its lights off, waiting near a
  // destination. Trip it by coming close, or let it stand down.
  stepStakeouts(world, dt);
}

// ---------------------------------------------------------------- stakeout

// Place a stakeout car near a destination: parked on the nearest road,
// lights off, facing the approach. Called by a mission's final leg, or
// by the wanted system at 4+ stars. Returns the car, or null.
export function placeStakeout(world, x, y) {
  const car = makeStakeoutCar(world, x, y, rand(world.rng, 0, Math.PI * 2));
  world.police.push(car);
  world.cars.push(car);
  world.events.stakeout = true;
  return car;
}

// One tick of the stakeouts: a car whose hold timer ran out stands down
// and drives off; a car the player comes close to bursts out of hiding
// with a radio call and joins the chase at full speed.
export function stepStakeouts(world, dt) {
  const player = world.player;
  for (const car of [...world.police]) {
    if (!car.stakeout) continue;
    if (world.time > car.stakeoutUntil || world.wanted <= 0) {
      // Stood down: lights on, it becomes a normal patrol car.
      car.stakeout = false;
      car.speed = 200;
      continue;
    }
    const d = dist(car.x, car.y, player.x, player.y);
    if (d < CFG.stakeoutAmbushRange) {
      car.stakeout = false;
      car.speed = CFG.stakeoutBurstSpeed;
      car.fromRoadblock = true; // updateWanted keeps a fresh chaser
      world.events.stakeout = true;
    }
  }
}

// Is a stakeout car waiting right now? The HUD and the scanner use this
// to warn the player that the destination is watched.
export function stakeoutWaiting(world) {
  return world.police.some((c) => c.stakeout);
}

// A police car chases the player: steer at where they are going, ram to
// damage, and at four stars and up, PIT them when the window opens.
// Cars holding a roadblock line stay parked until dispatch breaks them,
// rolling roadblock cars are driven by dispatch, not by this chase, and
// a stakeout car waits for the ambush instead of chasing.
export function stepPoliceCar(world, car, dt) {
  if (car.block) return; // roadblock cars hold the line; dispatch moves them
  if (car.rolling) return; // rolling roadblock cars are dispatch's, not the chase's
  if (car.stakeout) return; // stakeout cars wait for the ambush
  if (car.pitCooldown > 0) car.pitCooldown -= dt;
  const player = world.player;
  const target = player.inCar || player;
  // Intercept: aim at where the player will be in half a second, not
  // where they are. A straight-line getaway gets cut off.
  const lead = 0.5;
  let tx = target.x + Math.cos(target.angle) * (target.speed || 0) * lead;
  let ty = target.y + Math.sin(target.angle) * (target.speed || 0) * lead;
  // Roadblock avoidance: if a barrier bar sits ahead of this car on its
  // lane, steer around the end of the bar instead of driving into the
  // cordon. The bar is 152 px across the road; going around one end by
  // 120 px clears it. v5.1 let chasing cars grind against their own
  // side's roadblocks and stall the chase.
  const dodge = roadblockDodge(world, car, tx, ty);
  if (dodge) { tx = dodge.x; ty = dodge.y; }
  const dx = tx - car.x;
  const dy = ty - car.y;
  const d = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  car.angle += clamp(angleDiff(car.angle, want), -3.4 * dt, 3.4 * dt);
  // Five-star ramming: the pursuit goal speed goes up, and a car closing
  // in from behind the player gets a burst to make contact.
  const dp = dist(car.x, car.y, target.x, target.y);
  const ramming = world.wanted >= CFG.ramBoostStars;
  let goal = d > 90 ? 560 : 420;
  if (ramming) {
    goal = CFG.ramBoostSpeed;
    if (dp < 220 && dp > 60) goal = 680; // closing burst, to make the hit
  }
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
  const dp2 = dist(car.x, car.y, target.x, target.y);

  // The PIT: at 4+ stars, a police car alongside the player's rear
  // quarter steers into it and spins the player out. One PIT per car per
  // cooldown, and never while the player is already spinning.
  if (player.inCar && world.wanted >= CFG.pitMinStars && car.pitCooldown <= 0 &&
      !player.inCar.pitTimer && dp2 < 95) {
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

  // Ramming the player's car hurts the player and slows both cars. At
  // five stars the ram hits harder — the PD has stopped trying to catch
  // you and started trying to wreck you.
  if (player.inCar && dp2 < (car.len + player.inCar.len) * 0.42) {
    if (car.hitCooldown <= 0) {
      player.health -= ramming ? CFG.ramDamage : 8;
      player.inCar.speed *= 0.55;
      car.speed *= 0.5;
      car.hitCooldown = 1.2;
      world.events.rammed = true;
    }
  }
  if (car.hitCooldown > 0) car.hitCooldown -= dt;
}

// Is a barrier roadblock sitting ahead of this police car, on the line
// it is driving? If so, return a dodge target: the intercept point
// shifted sideways past the end of the bar, on the side with more room.
// Returns null when the road ahead is clear.
function roadblockDodge(world, car, tx, ty) {
  for (const rb of world.roadblocks) {
    if (rb.kind !== 'barrier') continue;
    const ox = rb.x - car.x;
    const oy = rb.y - car.y;
    const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
    const side = -ox * Math.sin(car.angle) + oy * Math.cos(car.angle);
    if (ahead <= 0 || ahead > 160 || Math.abs(side) > 70) continue;
    // The bar is ahead and across the lane: go around the nearer end.
    const dodgeSide = side >= 0 ? 1 : -1;
    const lateral = 120 * dodgeSide;
    return {
      x: tx - Math.sin(car.angle) * lateral,
      y: ty + Math.cos(car.angle) * lateral,
    };
  }
  return null;
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
  world.heat = 0; // a busted run cools the heat right off
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
