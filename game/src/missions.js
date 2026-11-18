// The four jobs from Mama Lou: briefing lines, steps, rewards, timers.
// A mission is a small state machine: current step index, an optional
// countdown, and a marker position the HUD and minimap point at.

import { MISSION_REWARDS } from './config.js';
import { dist } from './random.js';

export const MISSIONS = [
  {
    id: 0,
    title: 'First Fare',
    reward: MISSION_REWARDS[0],
    briefing: [
      "Mama Lou: Rico, you're back. Good. I got a fare waiting.",
      'Mama Lou: Yellow taxi by the plaza. Take it to the Neon Mile club.',
    ],
    steps: [
      { text: 'Get in the yellow taxi by the plaza', x: 1400, y: 2000, radius: 60, kind: 'enter', car: 'taxi' },
      { text: 'Drive to the Neon Mile club', x: 600, y: 1000, radius: 70, kind: 'reach' },
    ],
  },
  {
    id: 1,
    title: 'Package Run',
    reward: MISSION_REWARDS[1],
    briefing: [
      'Mama Lou: A package is waiting at the Marina docks. No questions.',
      'Mama Lou: Deliver it to the Palm Court hotel. Fast. Seventy-five seconds.',
    ],
    steps: [
      { text: 'Pick up the package at the Marina docks', x: 2600, y: 200, radius: 70, kind: 'reach' },
      { text: 'Deliver to the Palm Court hotel (75s)', x: 1800, y: 1800, radius: 70, kind: 'reach', timer: 75 },
    ],
  },
  {
    id: 2,
    title: 'Getaway',
    reward: MISSION_REWARDS[2],
    briefing: [
      'Mama Lou: The cops are on you, Rico. Lose them first.',
      'Mama Lou: Then get to the safehouse in Old Town. Do not get busted.',
    ],
    steps: [
      { text: 'Lose the police (get your wanted level to zero)', x: null, y: null, radius: 0, kind: 'loseHeat' },
      { text: 'Reach the safehouse in Old Town', x: 1400, y: 600, radius: 70, kind: 'reach' },
    ],
    startWanted: 2,
  },
  {
    id: 3,
    title: 'The Big Score',
    reward: MISSION_REWARDS[3],
    briefing: [
      'Mama Lou: One last job. A white sports car sits in the mall lot.',
      'Mama Lou: Bring it to my garage. No scratches, Rico. Well — few scratches.',
    ],
    steps: [
      { text: 'Steal the white sports car from the mall lot', x: 2200, y: 1400, radius: 60, kind: 'enter', car: 'sports' },
      { text: 'Bring it to Mama Lou\'s garage', x: 1000, y: 1400, radius: 70, kind: 'reach' },
    ],
  },
];

export function currentMission(world) {
  if (world.missionIndex >= MISSIONS.length) return null;
  return MISSIONS[world.missionIndex];
}

export function currentStep(world) {
  const m = currentMission(world);
  if (!m) return null;
  return m.steps[world.missionStep] || null;
}

export function missionObjectiveText(world) {
  const m = currentMission(world);
  if (!m) return 'Free Roam';
  const s = currentStep(world);
  return s ? s.text : m.title;
}

export function missionMarker(world) {
  const s = currentStep(world);
  if (!s || s.x == null) return null;
  return { x: s.x, y: s.y };
}

// Start a mission: reset its step, apply its opening wanted level, and
// queue its briefing lines as dialogue.
export function startMission(world, index) {
  const m = MISSIONS[index];
  if (!m) return;
  world.missionIndex = index;
  world.missionStep = 0;
  world.missionTimer = 0;
  world.missionFailed = false;
  if (m.startWanted) {
    world.wanted = m.startWanted;
    world.lastCrimeAt = world.time;
  }
  world.dialogue = [...m.briefing];
  world.dialogueTimer = 0;
  world.events.push({ type: 'mission' });
}

// Advance the mission state machine. Returns 'done' | 'failed' | null.
export function stepMission(world, dt) {
  const m = currentMission(world);
  if (!m) return null;
  const s = currentStep(world);
  if (!s) return null;
  const p = world.player;

  if (s.kind === 'loseHeat') {
    if (world.wanted <= 0) {
      world.missionStep++;
      world.dialogue = ['Mama Lou: Clean. Now get to the safehouse.'];
      world.dialogueTimer = 0;
    }
    return null;
  }

  if (s.kind === 'enter') {
    // Completed by world.tryEnterCar when the player enters the right car.
    return null;
  }

  if (s.kind === 'reach') {
    if (s.timer && world.missionStep > 0) {
      world.missionTimer += dt;
      if (world.missionTimer > s.timer) {
        world.missionFailed = true;
        world.dialogue = ['Mama Lou: Too slow, Rico. Come back and try again. Press ENTER.'];
        world.dialogueTimer = 0;
        return 'failed';
      }
    }
    if (dist(p.x, p.y, s.x, s.y) < s.radius) {
      return advanceStep(world);
    }
  }
  return null;
}

export function advanceStep(world) {
  const m = currentMission(world);
  world.missionStep++;
  world.missionTimer = 0;
  if (world.missionStep >= m.steps.length) {
    // Job done: pay out, save, and start the next one (or free roam).
    world.player.cash += m.reward;
    world.jobsDone++;
    world.events.push({ type: 'cash' });
    world.dialogue = [`Mama Lou: Job done. $${m.reward} is yours, Rico.`];
    world.dialogueTimer = 0;
    world.missionIndex++;
    world.missionStep = 0;
    world.missionTimer = 0;
    if (world.missionIndex < MISSIONS.length) {
      const next = MISSIONS[world.missionIndex];
      world.dialogue.push(...next.briefing);
      if (next.startWanted) {
        world.wanted = next.startWanted;
        world.lastCrimeAt = world.time;
      }
    }
    world.saveDue = true;
    return 'done';
  }
  world.events.push({ type: 'pickup' });
  return null;
}

// Called when the player enters a car: completes an 'enter' step if it is
// the car this step asks for.
export function onEnterCar(world, car) {
  const s = currentStep(world);
  if (!s || s.kind !== 'enter') return;
  if (s.car && car.model.name !== s.car) return;
  if (dist(world.player.x, world.player.y, s.x, s.y) > s.radius + 80) return;
  advanceStep(world);
}
