// Mama Lou's twelve jobs, rewritten for v5.3. Each mission is a small
// state machine: a briefing (shown as dialogue), a chain of steps with a
// world position to reach, and a cash reward. Completing a job advances
// the story; failing the timed delivery lets the player retry the same
// job with ENTER.
//
// v5.3 changes: two new jobs close the story. The Scanner Job (job 11)
// is built around dispatch's police scanner — three scripted spike
// strips wait on the route, and the scanner reads them out as the player
// approaches, so the job teaches the driver to read the map instead of
// the road. The Blackout (job 12) is the finale: a blackout falls over
// Neon Mile as the job starts — no helicopters, no scanner, no new
// roadblocks — but the PD has a stakeout waiting at the final
// destination, and the last leg runs five stops across the whole city.
// After the twelfth job: free roam.

import { CFG } from './config.js';
import { dist } from './random.js';
import { districtAt } from './city.js';
import { changeStanding, payoutMultiplier, setStanding, startDistrictEvent } from './standing.js';
import { clearScriptedRoadblocks } from './dispatch.js';
import { placeStakeout } from './police.js';

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
  {
    name: 'The Silent Partner',
    reward: 700,
    briefing: [
      'Mama Lou: A quiet one, Rico. Pick up a package at the Neon Mile club, take it to the Marina docks.',
      'Mama Lou: Word is the PD set a roadblock on the main drag. Got a hacker? Now is the time. If not — take the long way round.',
    ],
    steps: [
      { text: 'Pick up the package at the Neon Mile club', at: { x: 600, y: 1000 }, radius: 60 },
      {
        text: 'Deliver the package to the Marina docks in 75 seconds',
        at: { x: 2600, y: 200 }, radius: 70, timed: 75,
        checkpoint: { x: 1800, y: 600, radius: 80, bonus: 15, name: 'Marina checkpoint' },
      },
    ],
  },
  {
    name: 'The Long Con',
    reward: 1200,
    briefing: [
      'Mama Lou: The big one, Rico. Four stops, one night, no mistakes.',
      'Mama Lou: Pick up Mara at the safehouse, hit the Old Town bank, then the Palm Court hotel, then bring it all home to my garage.',
    ],
    steps: [
      { text: 'Pick up Mara at the safehouse in Old Town', at: { x: 1400, y: 600 }, radius: 70 },
      { text: 'Hit the Old Town bank', at: { x: 600, y: 600 }, radius: 70 },
      { text: 'Collect from the Palm Court hotel', at: { x: 1800, y: 1800 }, radius: 70 },
      { text: 'Bring it all home to Mama Lou\'s garage', at: { x: 1000, y: 1400 }, radius: 70 },
    ],
  },
  {
    name: 'The Clean Getaway',
    reward: 900,
    briefing: [
      'Mama Lou: Three stars, Rico, and a package that has to reach the beach. Lose the heat first.',
      'Mama Lou: Got Sal the Fixer? Press G and watch two stars vanish. If not — drive like you mean it.',
    ],
    steps: [
      { text: 'Lose the police (get your wanted level to zero)', at: null, loseHeat: true },
      { text: 'Pick up the package at the Neon Mile club', at: { x: 600, y: 1000 }, radius: 60 },
      { text: 'Deliver the package to Vice Beach in 90 seconds', at: { x: 2900, y: 1200 }, radius: 70, timed: 90 },
    ],
  },
  {
    name: 'The Vice Shores Job',
    reward: 2000,
    briefing: [
      'Mama Lou: The last one, Rico. Five stops, one night, the whole city.',
      'Mama Lou: Bank, casino, docks, hotel, then home. The PD knows something is happening — expect spike strips on the main drag. Bring the crew.',
    ],
    steps: [
      { text: 'Hit the Old Town bank', at: { x: 600, y: 600 }, radius: 70 },
      { text: 'Collect from the Neon Mile casino', at: { x: 600, y: 1400 }, radius: 70 },
      { text: 'Pick up at the Marina docks', at: { x: 2600, y: 200 }, radius: 70 },
      { text: 'Collect from the Palm Court hotel', at: { x: 1800, y: 1800 }, radius: 70 },
      { text: 'Bring it all home to Mama Lou\'s garage', at: { x: 1000, y: 1400 }, radius: 70 },
    ],
  },
  {
    name: 'The Wheelman Run',
    reward: 1500,
    briefing: [
      'Mama Lou: The casino has a sports car with your name on it, Rico. Take it, then run three drops against the clock.',
      'Mama Lou: Got Dante the Wheelman? Press X mid-run and he brings you a fresh getaway car. If not — the one you stole will have to do.',
    ],
    steps: [
      { text: 'Steal the getaway sports car from the Neon Mile casino', at: { x: 600, y: 1400 }, needCar: 'sports', radius: 60 },
      { text: 'Drop the package at the Marina docks in 120 seconds', at: { x: 2600, y: 200 }, radius: 70, timed: 120 },
      { text: 'Drop the package at the Palm Court hotel', at: { x: 1800, y: 1800 }, radius: 70 },
      { text: 'Bring the getaway car home to Mama Lou\'s garage', at: { x: 1000, y: 1400 }, radius: 70 },
    ],
  },
  {
    name: 'The Turf War',
    reward: 2500,
    briefing: [
      'Mama Lou: The Old Town crew turned on us, Rico. They hate you now, and the PD is thick on their streets.',
      'Mama Lou: Four stops, and the last leg runs straight through hostile Old Town. Bring the crew, bring Dante, and do not stop for anything.',
    ],
    steps: [
      { text: 'Hit the Old Town bank', at: { x: 600, y: 600 }, radius: 70 },
      { text: 'Collect from the Neon Mile casino', at: { x: 600, y: 1400 }, radius: 70 },
      { text: 'Reach the safehouse through hostile Old Town', at: { x: 1400, y: 600 }, radius: 70 },
      { text: 'Bring it all home to Mama Lou\'s garage', at: { x: 1000, y: 1400 }, radius: 70 },
    ],
  },
  {
    name: 'The Scanner Job',
    reward: 1800,
    briefing: [
      'Mama Lou: The PD laid spike strips all over the east side, Rico. Three of them, on your route.',
      'Mama Lou: Watch the scanner under the radio line — it reads the nearest strip out for you. Slow down for the spikes, or go around. The package goes to the docks, then the hotel, in 120 seconds.',
    ],
    steps: [
      { text: 'Pick up the package at the Neon Mile casino', at: { x: 600, y: 1400 }, radius: 60 },
      {
        text: 'Deliver the package to the Marina docks in 120 seconds',
        at: { x: 2600, y: 200 }, radius: 70, timed: 120,
        checkpoint: { x: 2200, y: 1000, radius: 80, bonus: 20, name: 'Docks checkpoint' },
      },
      { text: 'Deliver the package to the Palm Court hotel', at: { x: 1800, y: 1800 }, radius: 70 },
    ],
  },
  {
    name: 'The Blackout',
    reward: 3000,
    briefing: [
      'Mama Lou: The lights are out in Neon Mile, Rico — a blackout, right on cue. No helicopters, no scanner, no roadblocks. Just us and the dark.',
      'Mama Lou: Five stops across the city, and the PD has a stakeout waiting at the garage. They know where you are going. Make them regret it.',
    ],
    steps: [
      { text: 'Hit the Old Town bank in the dark', at: { x: 600, y: 600 }, radius: 70 },
      { text: 'Collect from the Neon Mile casino', at: { x: 600, y: 1400 }, radius: 70 },
      { text: 'Pick up at the Marina docks', at: { x: 2600, y: 200 }, radius: 70 },
      { text: 'Collect from the Palm Court hotel', at: { x: 1800, y: 1800 }, radius: 70 },
      { text: 'Bring it all home to Mama Lou\'s garage — past the stakeout', at: { x: 1000, y: 1400 }, radius: 70 },
    ],
  },
];

// The mission the player is on now, or null once all twelve are done.
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

// Where the pulsing marker sits in the world, or null. A timed step's
// checkpoint shows as the marker until it is hit, then the delivery
// point takes over.
export function missionMarker(world) {
  const m = currentMission(world);
  if (!m) return null;
  const step = m.steps[world.missionStep];
  if (!step || !step.at) return null;
  if (step.checkpoint && !world.checkpointHit) {
    return { x: step.checkpoint.x, y: step.checkpoint.y };
  }
  return { x: step.at.x, y: step.at.y };
}

// Start a mission: briefing dialogue, step zero, heat for the getaway
// jobs. The finale also scripts a spike strip on the main drag.
export function startMission(world, index) {
  const m = MISSIONS[index];
  if (!m) return;
  world.missionIndex = index;
  world.missionStep = 0;
  world.missionTimer = 0;
  world.missionFailed = false;
  world.checkpointHit = false;
  world.jamUsedThisJob = false; // the hacker's jam refreshes each job
  world.fixerUsedThisJob = false; // so does the fixer's launder
  world.wheelmanUsedThisJob = false; // and the wheelman's swap
  if (index === 2) {
    world.wanted = 2; // the getaway job starts hot
    world.crimeTimer = 0;
  }
  if (index === 4) {
    // The Silent Partner: the PD already has a roadblock on the direct
    // route (the x=1400 road at the y=1000 crossing). world.js places it;
    // the player jams it with the hacker or drives around it.
    world.wantRoadblockAt = { x: 1400, y: 1000, angle: Math.PI / 2, kind: 'barrier' };
  }
  if (index === 6) {
    world.wanted = 3; // The Clean Getaway starts hotter than the getaway
    world.crimeTimer = 0;
  }
  if (index === 7) {
    // The Vice Shores Job: a spike strip waits on the main drag (the
    // x=1800 road at the y=1400 crossing), right on the casino-to-docks
    // leg. world.js places it; slow down or go around.
    world.wantRoadblockAt = { x: 1800, y: 1400, angle: 0, kind: 'spike' };
  }
  if (index === 8) {
    // The Wheelman Run: a spike strip waits on the casino-to-docks leg
    // (the x=1800 road at the y=600 crossing), right where the getaway
    // car wants to run. Dante's swap is the answer if the tyres go.
    world.wantRoadblockAt = { x: 1800, y: 600, angle: Math.PI / 2, kind: 'spike' };
  }
  if (index === 9) {
    // The Turf War: Old Town turns hostile as the job starts — the crew
    // there turned on Rico, and the PD is thick on their streets. The
    // last leg runs straight through it, past a barrier on the direct
    // route (the x=1000 road at the y=600 crossing).
    setStanding(world, 'Old Town', CFG.turfHated);
    world.wantRoadblockAt = { x: 1000, y: 600, angle: 0, kind: 'barrier' };
  }
  if (index === 10) {
    // The Scanner Job: three spike strips wait on the route — one on
    // each leg of the run. The scanner reads them out as the player
    // approaches, so the job teaches the driver to read the map. The
    // strips are scripted, so dispatch never sweeps them away.
    world.wantRoadblockAt = { x: 1800, y: 1000, angle: Math.PI / 2, kind: 'spike' };
    world.wantRoadblockAt2 = { x: 2200, y: 1400, angle: 0, kind: 'spike' };
    world.wantRoadblockAt3 = { x: 1400, y: 1800, angle: Math.PI / 2, kind: 'spike' };
  }
  if (index === 11) {
    // The Blackout: a blackout falls over Neon Mile as the job starts —
    // no helicopters, no scanner, no new roadblocks while it lasts. And
    // the PD has a stakeout waiting at the garage, the final stop: a
    // dark police car, lights off, that bursts out when Rico arrives.
    startDistrictEvent(world, 'Neon Mile', 'blackout', CFG.mission12Time + 60);
    world.wantStakeoutAt = { x: 1000, y: 1400 };
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

  // Timed delivery: the clock runs from the pickup step on. A checkpoint
  // on the route adds its bonus once, then the marker moves to the drop.
  if (step.timed) {
    world.missionTimer += dt;
    if (step.checkpoint && !world.checkpointHit) {
      const here = player.inCar || player;
      const cp = step.checkpoint;
      if (dist(here.x, here.y, cp.x, cp.y) <= cp.radius) {
        world.checkpointHit = true;
        world.missionTimer = Math.max(0, world.missionTimer - cp.bonus);
        say(world, `Mama Lou: ${cp.name || 'Checkpoint'} — ${cp.bonus} seconds back on the clock. Keep moving.`);
        world.events.stepDone = true;
      }
    }
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
      world.checkpointHit = false;
      say(world, `Mama Lou: Clock is running. ${next.timed} seconds, Rico. Move!`);
    } else if (world.missionIndex === 1) {
      say(world, 'Mama Lou: Package secured. Now the hotel — quick, quick.');
    } else if (world.missionIndex === 2) {
      say(world, 'Mama Lou: Clean. Now the safehouse, before they find you again.');
    } else if (world.missionIndex === 3) {
      say(world, "Mama Lou: That's my car. Bring her home to the garage.");
    } else if (world.missionIndex === 4) {
      say(world, 'Mama Lou: Package secured. Docks, fast — and mind the roadblock.');
    } else if (world.missionIndex === 5) {
      const stops = ['Mama Lou: Mara is in. Now the bank — in and out.', 'Mama Lou: Bank done. The hotel is waiting.', 'Mama Lou: Last stop — bring it home to my garage.'];
      say(world, stops[Math.min(world.missionStep - 1, stops.length - 1)]);
    } else if (world.missionIndex === 6) {
      if (world.missionStep === 1) say(world, 'Mama Lou: Clean. Package is at the club — beach, fast.');
      else say(world, 'Mama Lou: Package secured. Ninety seconds to the beach. Go.');
    } else if (world.missionIndex === 7) {
      const stops = [
        'Mama Lou: Bank done. The casino is waiting.',
        'Mama Lou: Casino done. Docks next — mind the spike strips.',
        'Mama Lou: Docks done. The hotel, then home.',
        'Mama Lou: Last stop — bring it all home to my garage.',
      ];
      say(world, stops[Math.min(world.missionStep - 1, stops.length - 1)]);
    } else if (world.missionIndex === 8) {
      const stops = [
        'Mama Lou: The getaway car is yours. Docks, fast — the clock is running.',
        'Mama Lou: Docks done. The hotel is waiting.',
        'Mama Lou: Last stop — bring the car home to my garage.',
      ];
      say(world, stops[Math.min(world.missionStep - 1, stops.length - 1)]);
    } else if (world.missionIndex === 9) {
      const stops = [
        'Mama Lou: Bank done. The casino is waiting.',
        'Mama Lou: Casino done. Now the safehouse — straight through hostile Old Town. Do not stop.',
        'Mama Lou: You made it through. Bring it all home to my garage.',
      ];
      say(world, stops[Math.min(world.missionStep - 1, stops.length - 1)]);
    } else if (world.missionIndex === 10) {
      const stops = [
        'Mama Lou: Package secured. The scanner is live — watch for the spikes on the way to the docks.',
        'Mama Lou: Docks done. The hotel is waiting — one more strip on the way.',
      ];
      say(world, stops[Math.min(world.missionStep - 1, stops.length - 1)]);
    } else if (world.missionIndex === 11) {
      const stops = [
        'Mama Lou: Bank done. The casino, in the dark.',
        'Mama Lou: Casino done. Docks next — the blackout covers you.',
        'Mama Lou: Docks done. The hotel, then home — and mind the stakeout at the garage.',
        'Mama Lou: Last stop — the garage. They are waiting for you, Rico. Do not stop.',
      ];
      say(world, stops[Math.min(world.missionStep - 1, stops.length - 1)]);
    }
    world.events.stepDone = true;
    return;
  }
  // Job done: pay the player. The payout scales with the district's
  // standing where the job ends, and the district likes Rico a little
  // more for a job well done.
  const lastStep = m.steps[m.steps.length - 1];
  const payDistrict = lastStep.at ? districtAt(lastStep.at.x, lastStep.at.y) : world.district;
  const mult = payoutMultiplier(world, payDistrict);
  const payout = Math.round(m.reward * mult);
  world.player.cash += payout;
  world.jobsDone++;
  world.events.cash = payout;
  if (world.standing) changeStanding(world, payDistrict, CFG.standingJobGain);
  say(world, `Mama Lou: $${payout} in your pocket${mult > 1.01 ? ' — ' + payDistrict + ' pays a bonus for a friend' : ''}. ${world.missionIndex + 1 < MISSIONS.length ? 'Next job when you are ready.' : 'Vice Shores is yours now, Rico.'}`);
  // The job is done, so its scripted roadblock stands down too.
  clearScriptedRoadblocks(world);
  world.missionIndex++;
  world.missionStep = 0;
  world.missionTimer = 0;
  world.checkpointHit = false;
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
  world.checkpointHit = false;
  // A scripted roadblock is part of the job: if the failed attempt broke
  // it or jammed it away, put it back for the retry.
  if (world.missionIndex === 4 && !world.roadblocks.some((r) => r.scripted)) {
    world.wantRoadblockAt = { x: 1400, y: 1000, angle: Math.PI / 2, kind: 'barrier' };
  }
  if (world.missionIndex === 7 && !world.roadblocks.some((r) => r.scripted)) {
    world.wantRoadblockAt = { x: 1800, y: 1400, angle: 0, kind: 'spike' };
  }
  if (world.missionIndex === 8 && !world.roadblocks.some((r) => r.scripted)) {
    world.wantRoadblockAt = { x: 1800, y: 600, angle: Math.PI / 2, kind: 'spike' };
  }
  if (world.missionIndex === 9 && !world.roadblocks.some((r) => r.scripted)) {
    world.wantRoadblockAt = { x: 1000, y: 600, angle: 0, kind: 'barrier' };
  }
  if (world.missionIndex === 10 && !world.roadblocks.some((r) => r.scripted)) {
    world.wantRoadblockAt = { x: 1800, y: 1000, angle: Math.PI / 2, kind: 'spike' };
    world.wantRoadblockAt2 = { x: 2200, y: 1400, angle: 0, kind: 'spike' };
    world.wantRoadblockAt3 = { x: 1400, y: 1800, angle: Math.PI / 2, kind: 'spike' };
  }
  if (world.missionIndex === 11) {
    if (!world.police.some((c) => c.stakeout)) {
      world.wantStakeoutAt = { x: 1000, y: 1400 };
    }
    if (!world.districtEvent || world.districtEvent.type !== 'blackout') {
      startDistrictEvent(world, 'Neon Mile', 'blackout', CFG.mission12Time + 60);
    }
  }
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
