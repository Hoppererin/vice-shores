// Mama Lou's four jobs. Each mission knows its briefing lines, its steps,
// its cash reward and where its marker points; the world asks this module
// to start a job and to check, every step, whether the current step is done.
import { MISSION_TIMER } from './config.js';
import { dist } from './random.js';
import { addWanted } from './police.js';

export const MISSIONS = [
  {
    title: 'First Fare',
    reward: 150,
    briefing: [
      "Mama Lou: Rico, baby, you're back. First fare's easy — take the yellow taxi by the plaza.",
      'Mama Lou: Then drive it up to the Neon Mile club. Don\'t scratch my paint.',
    ],
    objective: (w) => (w.missionStep === 0
      ? 'Get in the yellow taxi by the plaza'
      : 'Drive the taxi to the Neon Mile club'),
  },
  {
    title: 'Package Run',
    reward: 300,
    briefing: [
      'Mama Lou: A package is waiting at the Marina docks. Pick it up, no questions.',
      'Mama Lou: Deliver it to the Palm Court hotel. Seventy-five seconds, Rico. Tick tock.',
    ],
    objective: (w) => (w.missionStep === 0
      ? 'Pick up the package at the Marina docks'
      : 'Deliver the package to the Palm Court hotel'),
  },
  {
    title: 'Getaway',
    reward: 500,
    briefing: [
      'Mama Lou: That last job went loud, Rico. The cops are already on you.',
      'Mama Lou: Lose them — all of them — then slip to the safehouse in Old Town.',
    ],
    objective: (w) => (w.missionStep === 0
      ? 'Lose the police — get your wanted level to zero'
      : 'Reach the safehouse in Old Town'),
  },
  {
    title: 'The Big Score',
    reward: 1000,
    briefing: [
      'Mama Lou: One last job, and we eat good. A white sports car, mall lot, no owner in sight.',
      "Mama Lou: Bring it to my garage. That's a thousand in your pocket, Rico.",
    ],
    objective: (w) => (w.missionStep === 0
      ? 'Steal the white sports car from the mall lot'
      : 'Bring the sports car to Mama Lou\'s garage'),
  },
];

export const SPOTS = {
  taxi: { x: 1400, y: 2000 },
  club: { x: 600, y: 1000 },
  package: { x: 2600, y: 200 },
  hotel: { x: 1800, y: 1800 },
  safehouse: { x: 1400, y: 600 },
  mallLot: { x: 2200, y: 1400 },
  garage: { x: 1000, y: 1400 },
};

export function currentMission(world) {
  return world.missionIndex < MISSIONS.length ? MISSIONS[world.missionIndex] : null;
}

export function missionObjective(world) {
  const mission = currentMission(world);
  if (!mission) return 'Free roam — Vice Shores is yours, Rico';
  return mission.objective(world);
}

export function missionMarker(world) {
  const i = world.missionIndex;
  const s = world.missionStep;
  if (i === 0) return s === 0 ? SPOTS.taxi : SPOTS.club;
  if (i === 1) return s === 0 ? SPOTS.package : SPOTS.hotel;
  if (i === 2) return s === 0 ? null : SPOTS.safehouse;
  if (i === 3) return s === 0 ? SPOTS.mallLot : SPOTS.garage;
  return null;
}

function setDialogue(world, lines) {
  world.dialogue = { lines, index: 0, timer: 7 };
}

export function startMission(world, index) {
  world.missionIndex = index;
  world.missionStep = 0;
  world.missionTimer = 0;
  world.missionFailed = false;
  const mission = MISSIONS[index];
  if (!mission) {
    world.marker = null;
    setDialogue(world, ['Mama Lou: That\'s all four jobs, Rico. The city is yours now. Free roam.']);
    return;
  }
  setDialogue(world, mission.briefing);
  if (index === 2) {
    // The getaway starts hot: two stars on the board from the first second.
    world.wanted = 2;
    world.quietTimer = 0;
  }
  world.marker = missionMarker(world);
}

function completeMission(world) {
  const mission = MISSIONS[world.missionIndex];
  world.player.cash += mission.reward;
  world.jobsDone += 1;
  world.saveDue = true;
  world.events.cash = true;
  world.events.mission = true;
  const next = world.missionIndex + 1;
  setDialogue(world, [`Mama Lou: Job done, Rico. $${mission.reward} in your pocket.`]);
  if (next >= MISSIONS.length) {
    world.missionIndex = next;
    world.missionStep = 0;
    world.marker = null;
    setDialogue(world, [
      `Mama Lou: Job done, Rico. $${mission.reward} in your pocket.`,
      "Mama Lou: That's all four jobs. The city is yours now — free roam.",
    ]);
    return;
  }
  startMission(world, next);
}

export function updateMission(world, dt) {
  const mission = currentMission(world);
  if (!mission) return;
  const p = world.player;
  if (world.missionFailed) return;
  const i = world.missionIndex;
  const s = world.missionStep;

  if (i === 0) {
    if (s === 0 && p.car === world.taxi) {
      world.missionStep = 1;
      world.marker = missionMarker(world);
      setDialogue(world, ['Mama Lou: Good. Now the Neon Mile club — north side, follow the marker.']);
    } else if (s === 1 && p.car === world.taxi && dist(p.x, p.y, SPOTS.club.x, SPOTS.club.y) < 100) {
      completeMission(world);
    }
  } else if (i === 1) {
    if (s === 0 && dist(p.x, p.y, SPOTS.package.x, SPOTS.package.y) < 70) {
      world.missionStep = 1;
      world.missionTimer = MISSION_TIMER;
      world.marker = missionMarker(world);
      world.events.pickup = true;
      setDialogue(world, ['Mama Lou: Package secured. Seventy-five seconds — GO!']);
    } else if (s === 1) {
      world.missionTimer -= dt;
      if (dist(p.x, p.y, SPOTS.hotel.x, SPOTS.hotel.y) < 100) {
        completeMission(world);
      } else if (world.missionTimer <= 0) {
        world.missionFailed = true;
        setDialogue(world, ['Mama Lou: Too slow, Rico. The buyer walked. Press ENTER to run it again.']);
      }
    }
  } else if (i === 2) {
    if (s === 0 && world.wanted === 0) {
      world.missionStep = 1;
      world.marker = missionMarker(world);
      setDialogue(world, ['Mama Lou: Clean. Now the safehouse in Old Town — lay low there.']);
    } else if (s === 1 && dist(p.x, p.y, SPOTS.safehouse.x, SPOTS.safehouse.y) < 90) {
      completeMission(world);
    }
  } else if (i === 3) {
    if (s === 0 && p.car === world.sportsCar) {
      world.missionStep = 1;
      world.marker = missionMarker(world);
      setDialogue(world, ['Mama Lou: She\'s yours. Bring her to my garage — easy does it.']);
    } else if (s === 1 && p.car === world.sportsCar && dist(p.x, p.y, SPOTS.garage.x, SPOTS.garage.y) < 100) {
      completeMission(world);
    }
  }

  // Cycle Mama Lou's briefing lines while one is showing.
  if (world.dialogue && world.dialogue.lines.length > 1) {
    world.dialogue.timer -= dt;
    if (world.dialogue.timer <= 0) {
      world.dialogue.index = (world.dialogue.index + 1) % world.dialogue.lines.length;
      world.dialogue.timer = 7;
    }
  }
}

export { addWanted };
