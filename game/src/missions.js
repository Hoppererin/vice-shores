// Mama Lou's four jobs. Each mission is a small state machine: a briefing
// (shown as dialogue), a chain of steps with a world position to reach, and
// a cash reward. Completing a job advances the story; failing the timed
// delivery lets the player retry the same job with ENTER.

import { CFG } from './config.js';
import { dist } from './random.js';

export const MISSIONS = [
  {
    name: 'First Fare',
    reward: 150,
    briefing: [
      "Mama Lou: Rico, baby, you're back. First fare's easy — take the yellow taxi by the plaza.",
      'Mama Lou: Drive it up to the Neon Mile club. No scratching the paint, you hear me?',
    ],
    steps: [
      { text: 'Get in the yellow taxi by the plaza', at: { x: 1400, y: 2000 }, needCar: 'taxi', radius: 60 },
      { text: 'Drive to the Neon Mile club', at: { x: 600, y: 1000 }, radius: 70 },
    ],
  },
  {
    name: 'Package Run',
    reward: 300,
    briefing: [
      'Mama Lou: A package is waiting at the Marina docks. No questions, no peeking.',
      'Mama Lou: Get it to the Palm Court hotel in 75 seconds. The client hates waiting.',
    ],
    steps: [
      { text: 'Pick up the package at the Marina docks', at: { x: 2600, y: 200 }, radius: 60 },
      { text: 'Deliver the package to the Palm Court hotel', at: { x: 1800, y: 1800 }, radius: 70, timed: 75 },
    ],
  },
  {
    name: 'Getaway',
    reward: 500,
    briefing: [
      'Mama Lou: The job went loud, Rico. Two stars and every cop in Vice Shores knows your face.',
      'Mama Lou: Lose them first, then slip to the safehouse in Old Town. Do not get busted.',
    ],
    steps: [
      { text: 'Lose the police (get your wanted level to zero)', at: null, loseHeat: true },
      { text: 'Reach the safehouse in Old Town', at: { x: 1400, y: 600 }, radius: 70 },
    ],
  },
  {
    name: 'The Big Score',
    reward: 1000,
    briefing: [
      'Mama Lou: Last one, and it pays. A white sports car is sitting in the mall lot, keys and all.',
      'Mama Lou: Bring it to my garage. Then we are square, and Vice Shores is yours.',
    ],
    steps: [
      { text: 'Steal the white sports car from the mall lot', at: { x: 2200, y: 1400 }, needCar: 'sports', radius: 60 },
      { text: 'Bring the sports car to Mama Lou\'s garage', at: { x: 1000, y: 1400 }, radius: 70 },
    ],
  },
];

// The mission the player is on now, or null once all four are done.
export function currentMission(world) {
  return world.missionIndex < MISSIONS.length ? MISSIONS[world.missionIndex] : null;
}

// Short title for the HUD: mission name, or Free Roam.
export function missionTitle(world) {
  const m = currentMission(world);
  return m ? m.name : 'Free Roam';
}

// The objective line for the HUD.
export function currentObjective(world) {
  const m = currentMission(world);
  if (!m) return 'Vice Shores is yours — drive and explore.';
  return m.steps[world.missionStep].text;
}

// Where the pulsing marker sits in the world, or null.
export function missionMarker(world) {
  const m = currentMission(world);
  if (!m) return null;
  const step = m.steps[world.missionStep];
  if (!step || !step.at) return null;
  return { x: step.at.x, y: step.at.y };
}

// Start a mission: briefing dialogue, step zero, heat for the getaway.
export function startMission(world, index) {
  const m = MISSIONS[index];
  if (!m) return;
  world.missionIndex = index;
  world.missionStep = 0;
  world.missionTimer = 0;
  world.missionFailed = false;
  if (index === 2) {
    world.wanted = 2; // the getaway job starts hot
    world.crimeTimer = 0;
  }
  say(world, m.briefing[0]);
  world.events.missionStart = true;
}

// One tick of the mission state machine.
export function updateMissions(world, dt) {
  const m = currentMission(world);
  if (!m) return;
  const step = m.steps[world.missionStep];
  const player = world.player;

  if (world.missionFailed) return; // waiting for ENTER to retry

  if (step.loseHeat) {
    if (world.wanted === 0) {
      advanceStep(world, m);
    }
    return;
  }

  // Timed delivery: the clock runs from the pickup step on.
  if (step.timed) {
    world.missionTimer += dt;
    if (world.missionTimer > step.timed) {
      world.missionFailed = true;
      say(world, "Mama Lou: Too slow, Rico. The client walked. Press ENTER and we try it again.");
      world.events.missionFailed = true;
      return;
    }
  }

  const at = step.at;
  if (!at) return;
  const here = player.inCar || player;
  const d = dist(here.x, here.y, at.x, at.y);
  if (d > (step.radius || 70)) return;

  if (step.needCar) {
    // The step completes only while driving the right car.
    if (player.inCar && player.inCar.kind === step.needCar) {
      if (world.missionStep === 0 && step.needCar === 'taxi') say(world, "Mama Lou: Good. Now the club, nice and easy.");
      advanceStep(world, m);
    }
    return;
  }
  advanceStep(world, m);
}

// Move to the next step, or pay out and start the next job.
function advanceStep(world, m) {
  world.missionStep++;
  if (world.missionStep < m.steps.length) {
    const next = m.steps[world.missionStep];
    if (next.timed) {
      world.missionTimer = 0;
      say(world, 'Mama Lou: Clock is running. 75 seconds, Rico. Move!');
    } else if (world.missionIndex === 1) {
      say(world, 'Mama Lou: Package secured. Now the hotel — quick, quick.');
    } else if (world.missionIndex === 2) {
      say(world, 'Mama Lou: Clean. Now the safehouse, before they find you again.');
    } else if (world.missionIndex === 3) {
      say(world, "Mama Lou: That's my car. Bring her home to the garage.");
    }
    world.events.stepDone = true;
    return;
  }
  // Job done: pay the player.
  world.player.cash += m.reward;
  world.jobsDone++;
  world.events.cash = m.reward;
  say(world, `Mama Lou: $${m.reward} in your pocket. ${world.missionIndex + 1 < MISSIONS.length ? 'Next job when you are ready.' : 'Vice Shores is yours now, Rico.'}`);
  world.missionIndex++;
  world.missionStep = 0;
  world.missionTimer = 0;
  if (world.missionIndex < MISSIONS.length) {
    startMission(world, world.missionIndex);
  }
}

// Retry the failed timed delivery from its pickup step.
export function retryMission(world) {
  const m = currentMission(world);
  if (!m || !world.missionFailed) return;
  world.missionFailed = false;
  world.missionTimer = 0;
  world.missionStep = 0;
  say(world, "Mama Lou: Alright, fresh start. Package is at the docks again.");
}

// Put a line in the dialogue box for a few seconds. If a line is already
// showing, queue behind it so a payout message is not lost to a briefing.
export function say(world, text) {
  if (!world.dialogue) {
    world.dialogue = { text, until: world.time + 6 };
  } else {
    world.dialogueQueue.push(text);
  }
}
