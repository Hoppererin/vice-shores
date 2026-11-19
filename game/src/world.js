// The world, rewritten for v5.1: one state object and one fixed-step
// function tying the city, the player, the traffic, the police, the
// dispatch, the crew, the standing and the missions together. This module
// never touches the DOM, so Node can import it for smoke tests.
//
// v5.1 changes:
// - Sal the Fixer (G key) launders heat once per job; B opens the
//   district job board; 4 recruits (keys 1-4).
// - Side jobs from the job boards run alongside the story jobs.
// - Flares burn over fresh roadblocks; spike strips bite fast cars.
// - Pedestrians keep to the sidewalks when the heat is on (v5 let them
//   wander into the road mid-chase and raise the wanted level).
// - Standing drifts toward zero once a minute; the fixer and the hacker
//   refresh their once-per-job abilities when a story job starts.
// - A busted run clears roadblocks, the helicopter, flares and side jobs.

import { CFG } from './config.js';
import { mulberry32, clamp, dist } from './random.js';
import { buildCity, collideBuildings, districtAt } from './city.js';
import {
  makePlayer, makeTaxi, makeSportsCar, spawnTraffic, spawnParked,
  spawnPeds, stepTrafficCar, stepPed, stepDrivenCar, collideCars, nearestCar,
} from './entities.js';
import { addCrime, updateWanted, stepPoliceCar, stepFootCop, resetAfterArrest } from './police.js';
import { currentMission, updateMissions, startMission, retryMission, say } from './missions.js';
import { updateDispatch, spawnRoadblockAt, collideRoadblock } from './dispatch.js';
import { recruitCrew, hackJam, fixerLaunder, stepCompanions, restoreCompanions, CREW_ROLES } from './crew.js';
import { freshStanding, driftStanding, startSideJob, updateSideJob } from './standing.js';

// Build a fresh world. opts: { cash, missionIndex, jobsDone, crew, standing } restores a save.
export function createWorld(seed = 7, opts = {}) {
  const rng = mulberry32(seed);
  const city = buildCity(rng);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    screen: 'title', // title | play | pause | busted | wasted
    overlay: null, // null | 'crew' | 'districts' | 'jobs': a panel over a paused game
    player: makePlayer(1350, 2000),
    cars: [],
    peds: [],
    police: [],
    footCops: [],
    wanted: 0,
    crimeTimer: 0,
    spawnTimer: 0,
    missionIndex: opts.missionIndex || 0,
    missionStep: 0,
    missionTimer: 0,
    missionFailed: false,
    checkpointHit: false,
    jobsDone: opts.jobsDone || 0,
    dialogue: null,
    dialogueQueue: [],
    camera: { x: 1350, y: 2000 },
    district: 'Neon Mile',
    saveTimer: 0,
    driftTimer: 0,
    // v5/v5.1: dispatch (roadblocks + helicopter), crew, district standing.
    roadblocks: [],
    flares: [],
    heli: null,
    heliLocked: false, // a scripted scene (chase shot) keeps Air-1 in frame
    dispatch: { msg: null, until: 0, cooldown: 0 },
    dispatchLog: [],
    crew: { driver: false, hacker: false, lookout: false, fixer: false, ...(opts.crew || {}) },
    companions: [],
    jamUntil: 0,
    jamUsedThisJob: false,
    fixerUsedThisJob: false,
    wantRoadblockAt: null,
    standing: { ...freshStanding(), ...(opts.standing || {}) },
    standingFlash: null,
    sideJob: null,
    events: freshEvents(),
  };
  world.player.cash = opts.cash || 0;

  world.cars.push(...spawnTraffic(world));
  world.cars.push(...spawnParked(world));
  world.cars.push(makeTaxi(1400, 2000, rng));
  world.cars.push(makeSportsCar(2200, 1400, rng));
  world.peds = spawnPeds(world);
  world.district = districtAt(world.player.x, world.player.y);
  if (opts.crew) restoreCompanions(world);
  return world;
}

function freshEvents() {
  return {
    crime: false, cash: 0, stepDone: false, missionStart: false,
    missionFailed: false, wantedDown: false, rammed: false, busted: false,
    punch: false, crash: false, pickup: false, enteredCar: false,
    roadblock: false, roadblockBreak: false, hack: false, recruit: false,
    pit: false, spike: false, launder: false, sidejob: false,
  };
}

// One fixed step (dt seconds, normally 1/60).
export function stepWorld(world, input, dt) {
  world.time += dt;
  const player = world.player;

  // The city lives even on the title screen: traffic and pedestrians move.
  for (const car of world.cars) {
    if (car.kind === 'traffic') stepTrafficCar(world, car, dt);
  }
  for (const ped of world.peds) stepPed(world, ped, dt);
  stepCompanions(world, dt);

  if (world.screen !== 'play') {
    updateCamera(world);
    return;
  }

  // A crew, district or job-board panel pauses the action (the city
  // keeps living behind it, same as the pause screen).
  if (world.overlay) {
    if (input.crew) { input.crew = false; world.overlay = null; }
    if (input.districts) { input.districts = false; world.overlay = null; }
    if (input.jobs) { input.jobs = false; world.overlay = null; }
    if (input.pause) { input.pause = false; world.overlay = null; }
    if (world.overlay === 'crew') {
      if (input.recruit1) { input.recruit1 = false; recruitCrew(world, CREW_ROLES[0].id); }
      if (input.recruit2) { input.recruit2 = false; recruitCrew(world, CREW_ROLES[1].id); }
      if (input.recruit3) { input.recruit3 = false; recruitCrew(world, CREW_ROLES[2].id); }
      if (input.recruit4) { input.recruit4 = false; recruitCrew(world, CREW_ROLES[3].id); }
    }
    if (world.overlay === 'jobs') {
      if (input.recruit1) { input.recruit1 = false; takeBoardJob(world, 0); }
      if (input.recruit2) { input.recruit2 = false; takeBoardJob(world, 1); }
    }
    updateCamera(world);
    return;
  }

  // v5/v5.1 one-shot keys: C opens the crew menu, V the district panel,
  // B the job board for this district, H fires the hacker's dispatch jam,
  // G spends the fixer's once-per-job launder.
  if (input.crew) { input.crew = false; world.overlay = 'crew'; updateCamera(world); return; }
  if (input.districts) { input.districts = false; world.overlay = 'districts'; updateCamera(world); return; }
  if (input.jobs) { input.jobs = false; world.overlay = 'jobs'; updateCamera(world); return; }
  if (input.hack) { input.hack = false; hackJam(world); }
  if (input.fixer) { input.fixer = false; fixerLaunder(world); }

  // A mission asked for a scripted roadblock: place it now, on the
  // direct route, before the player gets there. The job names its kind —
  // a barrier for the Silent Partner, a spike strip for the finale.
  if (world.wantRoadblockAt) {
    const at = world.wantRoadblockAt;
    world.wantRoadblockAt = null;
    spawnRoadblockAt(world, at.x, at.y, at.angle, at.kind || 'barrier');
  }

  // --- player ------------------------------------------------------------
  if (player.punchCooldown > 0) player.punchCooldown -= dt;

  if (player.inCar) {
    stepPlayerCar(world, input, dt);
  } else {
    stepPlayerOnFoot(world, input, dt);
  }

  // Roadblock barriers are solid: the player's car and the player on foot
  // both get pushed out of the striped bar. Spike strips are flat — the
  // bite is handled in stepRoadblock, not here.
  if (world.roadblocks.length) {
    const body = player.inCar || player;
    if (collideRoadblock(world, body, player.inCar ? body.wid * 0.6 : CFG.playerRadius)) {
      if (player.inCar) {
        player.inCar.speed *= 0.6;
        world.events.crash = true;
      }
    }
  }

  // --- collisions between cars ------------------------------------------
  // Police cars are excluded: their contact with the player is the ram in
  // stepPoliceCar (damage + slowdown on a cooldown), and the PIT in
  // particular. Letting the generic bumper drag run on a chasing cop would
  // grind both cars to a halt while it rides the player's bumper.
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    if (cars[i].kind === 'police') continue;
    for (let j = i + 1; j < cars.length; j++) {
      if (cars[j].kind === 'police') continue;
      collideCars(cars[i], cars[j]);
    }
  }

  // --- the player car vs pedestrians ------------------------------------
  // Only a fast car hurts: at 200 px/s a pedestrian on the road is a
  // crime. v5.1 keeps pedestrians on the sidewalks while the heat is on,
  // so a chase down a road does not turn into a wanted-level farm.
  if (player.inCar && Math.abs(player.inCar.speed) > 200) {
    for (const ped of world.peds) {
      if (ped.downTimer > 0) continue;
      if (dist(ped.x, ped.y, player.inCar.x, player.inCar.y) < 26) {
        ped.downTimer = 5;
        addCrime(world, 1);
        world.events.crash = true;
        say(world, 'Mama Lou: Watch the pedestrians, Rico. The cops saw that.');
      }
    }
    for (const cop of world.footCops) {
      if (cop.downTimer > 0) continue;
      if (dist(cop.x, cop.y, player.inCar.x, player.inCar.y) < 26) {
        cop.downTimer = 5;
        addCrime(world, 1);
        world.events.crash = true;
      }
    }
  }

  // --- police, dispatch, missions and side jobs -------------------------
  updateWanted(world, dt);
  updateDispatch(world, dt);
  for (const car of world.police) stepPoliceCar(world, car, dt);
  for (const cop of world.footCops) stepFootCop(world, cop, dt);
  updateMissions(world, dt);
  updateSideJob(world, dt);

  // --- standing drift, health, dialogue, camera ------------------------
  world.driftTimer += dt;
  if (world.driftTimer >= CFG.standingDriftSeconds) {
    world.driftTimer = 0;
    driftStanding(world);
  }
  if (player.health <= 0) {
    player.health = 0;
    world.screen = 'wasted';
  }
  if (world.dialogue && world.time > world.dialogue.until) {
    world.dialogue = world.dialogueQueue.length
      ? { text: world.dialogueQueue.shift(), until: world.time + 6 }
      : null;
  }
  if (world.standingFlash && world.time > world.standingFlash.until) world.standingFlash = null;
  world.district = districtAt(player.x, player.y);
  updateCamera(world);
}

// Take a side job from the board of the district the player is in. A
// story job takes priority, and one side job at a time.
function takeBoardJob(world, index) {
  if (currentMission(world)) {
    say(world, 'Mama Lou: Finish my job first, Rico. Side work waits.');
    return false;
  }
  if (world.sideJob) {
    say(world, 'Mama Lou: One side job at a time. Finish it or drop it.');
    return false;
  }
  const ok = startSideJob(world, world.district, index);
  if (ok) {
    const job = world.sideJob;
    say(world, `Mama Lou: Side job — ${job.name}. Pick it up at the marker, then deliver. $${job.reward} if you are quick.`);
  } else {
    say(world, 'Mama Lou: That board is closed to you. This district does not know you well enough yet.');
  }
  return ok;
}

// On foot: WASD/arrows, Shift to run, E to enter a car, F to punch.
function stepPlayerOnFoot(world, input, dt) {
  const player = world.player;
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    const speed = input.run ? CFG.runSpeed : CFG.walkSpeed;
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
    player.angle = Math.atan2(dy, dx);
    player.walkPhase += dt * (input.run ? 13 : 9);
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  player.x = clamp(player.x, 24, CFG.worldW - 24);
  player.y = clamp(player.y, 24, CFG.worldH - 24);
  collideBuildings(world.city, player, CFG.playerRadius);

  if (input.enter) { input.enter = false; tryEnterCar(world); }
  if (input.punch) { input.punch = false; tryPunch(world); }
}

// Driving: the car answers to W/S and steering, E steps out. A PIT spin
// locks the steering and bleeds the speed until the car straightens out.
function stepPlayerCar(world, input, dt) {
  const player = world.player;
  const car = player.inCar;
  if (car.pitTimer > 0) {
    car.pitTimer -= dt;
    car.angle += 6 * dt; // the car spins out
    car.speed *= (1 - 1.4 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 30, CFG.worldW - 30);
    car.y = clamp(car.y, 30, CFG.worldH - 30);
    if (car.pitTimer <= 0) car.pitTimer = 0;
    if (input.enter) { input.enter = false; }
    return;
  }
  const result = stepDrivenCar(world, car, input, dt);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;
  if (result === 'crash') {
    world.events.crash = true;
    if (car.hitCooldown <= 0) {
      player.health -= 5;
      car.hitCooldown = 1.0;
    }
  }
  if (car.hitCooldown > 0) car.hitCooldown -= dt;
  if (input.enter) { input.enter = false; exitCar(world); }
}

// E near a car: climb in. Stealing a parked car or yanking a driver out is
// a crime. The taxi and the sports car are mission cars, not traffic.
function tryEnterCar(world) {
  const player = world.player;
  const car = nearestCar(world, player.x, player.y, 46);
  if (!car) return;
  if (car.driver) {
    // Yank the driver out: they become a pedestrian, on foot and annoyed.
    car.driver = false;
    const driver = {
      x: car.x + 30, y: car.y + 30, angle: 0, speed: 0,
      target: null, downTimer: 0, fleeing: false,
      shirt: '#c0c0c0', skin: '#e8b88a', walkPhase: 0, cop: false,
    };
    world.peds.push(driver);
  }
  addCrime(world, 1);
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  world.events.enteredCar = true;
  world.events.pickup = true;
}

// E while driving: step out to the car's left side.
function exitCar(world) {
  const player = world.player;
  const car = player.inCar;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * (car.wid / 2 + 16);
  player.y = car.y + Math.sin(side) * (car.wid / 2 + 16);
  player.x = clamp(player.x, 24, CFG.worldW - 24);
  player.y = clamp(player.y, 24, CFG.worldH - 24);
  collideBuildings(world.city, player, CFG.playerRadius);
  player.inCar = null;
  player.speed = 0;
}

// F: punch the nearest person in front of the player.
function tryPunch(world) {
  const player = world.player;
  if (player.punchCooldown > 0) return;
  player.punchCooldown = 0.45;
  player.punchTimer = 0.25;
  world.events.punch = true;
  const reach = 46;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  const targets = [...world.peds, ...world.footCops];
  for (const t of targets) {
    if (t.downTimer > 0) continue;
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > reach) continue;
    if ((dx * fx + dy * fy) / (d || 1) < 0.3) continue; // must be roughly ahead
    t.downTimer = 4;
    addCrime(world, t.cop ? 2 : 1);
    return;
  }
}

// Camera follows the player (or their car), clamped to the world.
function updateCamera(world) {
  const p = world.player;
  world.camera.x = clamp(p.x, CFG.viewW / 2, CFG.worldW - CFG.viewW / 2);
  world.camera.y = clamp(p.y, CFG.viewH / 2, CFG.worldH - CFG.viewH / 2);
}

// Snapshot for the save file (localStorage), restored by createWorld opts.
// v5/v5.1: the crew (all four) and the district standing travel with the
// save. Side jobs are not saved — a side job is for one session.
export function saveSnapshot(world) {
  return {
    cash: world.player.cash,
    missionIndex: world.missionIndex,
    jobsDone: world.jobsDone,
    crew: { ...world.crew },
    standing: { ...world.standing },
  };
}

// Busted / wasted retry: same as the police module's reset, re-exported
// here so callers only import from world.js. A busted run also clears
// the roadblocks, the helicopter, the flares and any side job — the PD
// stands down and the board forgets the run.
export function retryAfterArrest(world) {
  resetAfterArrest(world);
  for (const rb of world.roadblocks) {
    for (const car of rb.cars) {
      const i = world.cars.indexOf(car);
      if (i >= 0) world.cars.splice(i, 1);
    }
  }
  world.roadblocks = [];
  world.flares = [];
  world.heli = null;
  world.dispatch.msg = null;
  world.sideJob = null;
}

// Retry the failed timed delivery.
export function retryFailedMission(world) {
  retryMission(world);
}

// Queue a dialogue line behind the one showing (missions.js uses say()).
export function queueDialogue(world, text) {
  if (!world.dialogue) {
    world.dialogue = { text, until: world.time + 6 };
  } else {
    world.dialogueQueue.push(text);
  }
}
