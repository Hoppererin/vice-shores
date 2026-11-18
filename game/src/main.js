// Vice Shores — boot, fixed-step loop, screens, save/load and the ?shot=
// screenshot mode. The simulation itself lives in world.js; this file only
// wires it to the canvas, the keyboard and localStorage.

import { CFG } from './config.js';
import { createWorld, stepWorld, saveSnapshot, retryAfterArrest, retryFailedMission } from './world.js';
import { drawWorld } from './render.js';
import { createInput, clearPressed, onFirstKey } from './input.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';
import { startMission } from './missions.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 7) || 7;
const shot = params.get('shot');
const audio = createAudio();
const input = createInput();
onFirstKey(() => audio.unlock());

// ---------------------------------------------------------------- save

function loadSave() {
  try {
    const raw = window.localStorage.getItem(CFG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function storeSave(world) {
  try {
    window.localStorage.setItem(CFG.saveKey, JSON.stringify(saveSnapshot(world)));
  } catch {
    // Storage full or blocked: the game still plays.
  }
}

// ---------------------------------------------------------------- boot

const saved = loadSave();
const world = createWorld(seed, saved || {});
world.hasSave = !!saved;
world.saveCash = saved ? saved.cash : 0;
world.saveMission = saved ? saved.missionIndex : 0;

// For automated tests: the live world, one hop away.
window.__viceShores = { world, input };

// Screenshot mode: run the scripted scene, draw one frame, stop. Hide the
// status line so the canvas fills the 1280x720 viewport exactly.
if (shot) {
  if (statusEl) statusEl.style.display = 'none';
  applyShot(world, shot);
  drawWorld(ctx, world);
  document.title = 'Vice Shores — shot ' + shot;
  if (statusEl) statusEl.textContent = 'shot=' + shot + ' seed=' + seed;
  window.__shotDone = true;
} else {
  // Normal play.
  const DT = 1 / 60;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;
    acc += elapsed;

    // Screen transitions, from one-shot keys.
    let consumed = false;
    if (world.screen === 'title' && (input.confirm || input.pointerDown)) {
      world.screen = 'play';
      audio.unlock();
      if (world.missionIndex < 4) startMission(world, world.missionIndex);
      consumed = true;
    } else if (world.screen === 'play' && input.pause) {
      world.screen = 'pause';
      consumed = true;
    } else if (world.screen === 'pause' && input.pause) {
      world.screen = 'play';
      consumed = true;
    } else if ((world.screen === 'busted' || world.screen === 'wasted') && input.confirm) {
      retryAfterArrest(world);
      consumed = true;
    } else if (world.missionFailed && input.confirm && world.screen === 'play') {
      retryFailedMission(world);
      consumed = true;
    }

    // Fixed steps, at most five per frame so a slow frame cannot spiral.
    let steps = 0;
    while (acc >= DT && steps < 5) {
      stepWorld(world, input, DT);
      acc -= DT;
      steps++;
    }
    if (steps === 5) acc = 0;
    // One-shot keys are cleared only once a step (or a transition) has
    // consumed them. Clearing them on a frame that ran no step would drop
    // a quick key press entirely.
    if (steps > 0 || consumed) clearPressed(input);

    // Sound from the events the step raised.
    const ev = world.events;
    if (ev.crash) audio.crash();
    if (ev.punch) audio.punch();
    if (ev.pickup) audio.pickup();
    if (ev.cash) audio.cash();
    if (ev.missionStart || ev.stepDone) audio.mission();
    if (ev.missionFailed) audio.jingle();
    world.events = freshEvents();
    const player = world.player;
    audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / player.inCar.topSpeed : 0);
    audio.siren(world.wanted > 0, world.time);

    // Autosave: on every job payout and every 20 seconds of play.
    world.saveTimer += elapsed;
    if (ev.cash || world.saveTimer >= CFG.saveEverySeconds) {
      storeSave(world);
      world.saveTimer = 0;
    }

    drawWorld(ctx, world);
    if (statusEl) {
      statusEl.textContent =
        '$' + player.cash + ' · ' + (world.missionIndex < 4 ? 'Job ' + (world.missionIndex + 1) + '/4' : 'Free Roam') +
        ' · ' + world.wanted + '★ · ' + world.district;
    }
  }

  requestAnimationFrame(frame);
}

function freshEvents() {
  return {
    crime: false, cash: 0, stepDone: false, missionStart: false,
    missionFailed: false, wantedDown: false, rammed: false, busted: false,
    punch: false, crash: false, pickup: false, enteredCar: false,
  };
}
