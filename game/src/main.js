// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, pause, busted and wasted.
//
// ?seed=N fixes the city. ?shot=chase|drive|street|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { AUTOSAVE_SECONDS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, stepWorld } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, createRenderer,
} from './render.js';
import { runShot } from './shots.js';
import { startMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

let world = createWorld(seed);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const save = {
      cash: world.player.cash,
      missionIndex: Math.min(3, world.missionIndex),
      jobsDone: world.jobsDone,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    world.save = save;
  } catch {
    // Storage can be off (private windows): the game still plays.
  }
}

world.save = readSave();

// The tests (and anyone debugging) can reach the live world here.
window.VICE = { world };

function runShotMode(name) {
  world = runShot(name, seed);
  world.save = readSave();
  window.VICE.world = world;
  const screen = name === 'start' ? SCREEN_TITLE : SCREEN_PLAY;
  let painted = 0;
  function paint() {
    renderer.draw(world, screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let autosaveTimer = 0;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSave) {
    if (continueSave && world.save) {
      world.player.cash = world.save.cash;
      world.jobsDone = world.save.jobsDone || 0;
      startMission(world, Math.min(3, world.save.missionIndex));
    } else {
      world.player.cash = 0;
      world.jobsDone = 0;
      startMission(world, 0);
    }
    world.player.health = 100;
    world.wanted = 0;
    world.state = 'play';
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce('Playing. Vice Shores is yours, Rico.');
  }

  function retryAfterEnd() {
    // Busted or wasted: keep the cash and the job, lose the heat.
    for (const car of world.policeCars) car.gone = true;
    world.cars = world.cars.filter((c) => !c.gone);
    world.policeCars = [];
    world.footCops = [];
    world.wanted = 0;
    world.quietTimer = 0;
    world.player.health = 100;
    world.player.car = null;
    world.player.x = 1061;
    world.player.y = 1450;
    world.player.angle = -Math.PI / 2;
    world.state = 'play';
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce('Back on the street, Rico.');
  }

  function handleActions() {
    if (screen === SCREEN_TITLE) {
      if (input.wasPressed('Enter') || input.wasPressed('Space')) startGame(true);
      else if (input.wasPressed('KeyN')) startGame(false);
    } else if (screen === SCREEN_PLAY) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        screen = SCREEN_PAUSED;
        world.state = 'pause';
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasPressed('Enter')) {
        screen = SCREEN_PLAY;
        world.state = 'play';
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (input.wasPressed('Enter') || input.wasPressed('Space')) retryAfterEnd();
    }
  }

  function consumeEvents() {
    const e = world.events;
    if (e.pickup) audio.pickup();
    if (e.cash) audio.cash();
    if (e.punch) audio.punch();
    if (e.crash) audio.crash();
    if (e.mission) audio.mission();
    if (e.busted) audio.busted();
    world.events = {};
  }

  function step() {
    stepWorld(world, input, STEP);
    if (world.state === 'busted' && screen === SCREEN_PLAY) {
      screen = SCREEN_BUSTED;
      world.events.busted = true;
      announce('Busted.');
    } else if (world.state === 'wasted' && screen === SCREEN_PLAY) {
      screen = SCREEN_WASTED;
      world.events.busted = true;
      announce('Wasted.');
    }
    consumeEvents();
    // Save on every job completion, and every AUTOSAVE_SECONDS of play.
    if (screen === SCREEN_PLAY) {
      autosaveTimer += STEP;
      if (world.saveDue || autosaveTimer >= AUTOSAVE_SECONDS) {
        writeSave();
        world.saveDue = false;
        autosaveTimer = 0;
      }
    }
    audio.update(STEP, world.player.car ? Math.abs(world.player.car.speed) : 0, world.wanted);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen);
    input.endFrame();
  }

  window.addEventListener('keydown', () => audio.unlock());
  window.addEventListener('pointerdown', () => audio.unlock());

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      world.state = 'pause';
      announce('Paused.');
    }
  });

  announce('Vice Shores. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShotMode(shot);
else runGame();
