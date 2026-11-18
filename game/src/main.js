// Vice Shores — boot, fixed-step loop, screens, save/load, ?shot= scenes.
// The canvas is a fixed 1280x720 logical view scaled to the window.

import { VIEW_W, VIEW_H } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld, stepWorld, saveGame, loadSave, applySave } from './world.js';
import { startMission } from './missions.js';
import { drawWorld, drawHUD, drawTitle, drawPause, drawBusted, drawWasted } from './render.js';
import { runShot } from './shots.js';

const DT = 1 / 60;

function fitCanvas(canvas) {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}

function playSounds(audio, world) {
  for (const e of world.events) {
    if (e.type === 'pickup') audio.pickup();
    else if (e.type === 'cash') audio.cash();
    else if (e.type === 'punch') audio.punch();
    else if (e.type === 'crash') audio.crash();
    else if (e.type === 'mission') audio.mission();
    else if (e.type === 'busted') audio.busted();
  }
  const speedNorm = world.player.car
    ? Math.abs(world.player.car.speed) / world.player.car.model.top
    : 0;
  audio.engine(world.state === 'play' ? speedNorm : 0);
  audio.siren(world.state === 'play' && world.wanted > 0, DT);
  if (world.state === 'play') audio.music(DT);
}

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const input = createInput();
  input.attach();
  const audio = createAudio();
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 7) || 7;

  // --- ?shot= scenes: run the real sim once, draw one frame, stop. ---
  const shot = params.get('shot');
  if (shot) {
    // A shot must not read or write the player's real save: clear any save
    // a previous shot in this browser session may have written.
    try { localStorage.removeItem('vice-shores.save.v1'); } catch { /* ignore */ }
    const world = runShot(shot, seed);
    fitCanvas(canvas);
    drawWorld(ctx, world);
    if (shot === 'start') {
      drawTitle(ctx, world, null);
    } else {
      drawHUD(ctx, world);
    }
    window.VICE = { world, shot };
    return;
  }

  // --- Normal game ---
  const world = createWorld(seed);
  const save = loadSave();
  world.save = save;
  fitCanvas(canvas);
  window.addEventListener('resize', () => fitCanvas(canvas));
  window.VICE = { world, input };

  document.addEventListener('keydown', (e) => {
    audio.resume();
    if (e.code === 'Enter') {
      if (world.state === 'title') {
        if (save) applySave(world, save);
        else startMission(world, 0);
        world.state = 'play';
      } else if (world.state === 'busted' || world.state === 'wasted') {
        // Retry: fresh world, same cash and mission progress kept.
        const cash = world.player.cash;
        const missionIndex = world.missionIndex;
        const jobsDone = world.jobsDone;
        const fresh = createWorld(seed);
        fresh.player.cash = cash;
        fresh.jobsDone = jobsDone;
        startMission(fresh, Math.min(missionIndex, 3));
        Object.assign(world, fresh);
        world.state = 'play';
      } else if (world.state === 'play' && world.missionFailed) {
        startMission(world, world.missionIndex);
        world.state = 'play';
      }
    }
    if (e.code === 'KeyP' && (world.state === 'play' || world.state === 'pause')) {
      world.state = world.state === 'play' ? 'pause' : 'play';
    }
  });

  let acc = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;
    if (world.state === 'play') {
      acc += elapsed;
      while (acc >= DT) {
        stepWorld(world, input, DT);
        input.endFrame();
        acc -= DT;
      }
      playSounds(audio, world);
    } else {
      input.endFrame();
    }
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawWorld(ctx, world);
    if (world.state === 'title') {
      drawTitle(ctx, world, save);
    } else {
      drawHUD(ctx, world);
      if (world.state === 'pause') drawPause(ctx);
      else if (world.state === 'busted') drawBusted(ctx, world);
      else if (world.state === 'wasted') drawWasted(ctx, world);
    }
  }
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
