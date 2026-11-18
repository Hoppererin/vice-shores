// Canvas drawing: the city, the actors, the mission marker, the HUD,
// the minimap and the title / pause / busted / wasted screens.
// Pure drawing from world state — no simulation happens here.

import {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, ROAD_XS, ROAD_YS, ROAD_W, SIDEWALK,
  BEACH_X, OCEAN_X, PARK, PLAZA, COLORS, DISTRICTS,
} from './config.js';
import { districtAt, distToPond } from './city.js';
import { missionObjectiveText, missionMarker, currentMission } from './missions.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, world) {
  const cam = world.camera;
  const t = world.time;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  drawGround(ctx, world, t);
  drawBuildings(ctx, world);
  drawTrees(ctx, world);
  drawCars(ctx, world);
  drawPeds(ctx, world);
  drawPlayer(ctx, world);
  drawMarker(ctx, world, t);

  ctx.restore();
}

function drawGround(ctx, world, t) {
  const city = world.city;
  // Grass base.
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Park and plaza.
  ctx.fillStyle = COLORS.park;
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.fillStyle = COLORS.pond;
  ctx.beginPath();
  ctx.arc(PARK.x + PARK.w / 2, PARK.y + PARK.h / 2, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.plaza;
  ctx.fillRect(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h);
  ctx.fillStyle = COLORS.fountain;
  ctx.beginPath();
  ctx.arc(PLAZA.x + PLAZA.w / 2, PLAZA.y + PLAZA.h / 2, 34, 0, Math.PI * 2);
  ctx.fill();

  // Sidewalks (pale band around each road).
  ctx.fillStyle = COLORS.sidewalk;
  for (const x of ROAD_XS) ctx.fillRect(x - ROAD_W / 2 - SIDEWALK, 0, ROAD_W + SIDEWALK * 2, WORLD_H);
  for (const y of ROAD_YS) ctx.fillRect(0, y - ROAD_W / 2 - SIDEWALK, WORLD_W, ROAD_W + SIDEWALK * 2);

  // Roads.
  ctx.fillStyle = COLORS.road;
  for (const x of ROAD_XS) ctx.fillRect(x - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const y of ROAD_YS) ctx.fillRect(0, y - ROAD_W / 2, WORLD_W, ROAD_W);

  // Lane dashes.
  ctx.fillStyle = COLORS.lane;
  for (const x of ROAD_XS) {
    for (let y = 24; y < WORLD_H; y += 56) {
      if (ROAD_YS.some((ry) => Math.abs(y - ry) < 60)) continue;
      ctx.fillRect(x - 2, y, 4, 26);
    }
  }
  for (const y of ROAD_YS) {
    for (let x = 24; x < BEACH_X; x += 56) {
      if (ROAD_XS.some((rx) => Math.abs(x - rx) < 60)) continue;
      ctx.fillRect(x, y - 2, 26, 4);
    }
  }

  // Beach sand and ocean, with animated wave lines.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(BEACH_X, 0, OCEAN_X - BEACH_X, WORLD_H);
  ctx.fillStyle = COLORS.ocean;
  ctx.fillRect(OCEAN_X, 0, WORLD_W - OCEAN_X, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  for (let y = 80; y < WORLD_H; y += 170) {
    const wob = Math.sin(t * 1.4 + y * 0.02) * 14;
    ctx.beginPath();
    ctx.arc(OCEAN_X + 130 + wob, y, 46, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  // Wet sand line at the water edge.
  ctx.fillStyle = 'rgba(120,90,40,0.25)';
  ctx.fillRect(OCEAN_X - 10, 0, 10, WORLD_H);

  // Palms on the sand.
  for (const palm of city.palms) drawPalm(ctx, palm.x, palm.y, palm.lean, t);
}

function drawBuildings(ctx, world) {
  for (const b of world.city.buildings) {
    // Fake height: a dark side face dropped down-right, then the roof.
    ctx.fillStyle = COLORS.buildingSide;
    ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
    // Vent and skylight.
    if (b.vent) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.6, 18, 14);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.22, 26, 18);
  }
}

function drawTrees(ctx, world) {
  for (const tree of world.city.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(tree.x + 4, tree.y + 5, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tree.shade;
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(tree.x - tree.r * 0.3, tree.y - tree.r * 0.3, tree.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPalm(ctx, x, y, lean, t) {
  const sway = Math.sin(t * 1.1 + y * 0.01) * 0.06;
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y + 14);
  ctx.quadraticCurveTo(x + lean * 20, y, x + lean * 26, y - 16);
  ctx.stroke();
  ctx.fillStyle = '#3f9e4d';
  const tx = x + lean * 26;
  const ty = y - 16;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + sway;
    ctx.beginPath();
    ctx.ellipse(tx + Math.cos(a) * 12, ty + Math.sin(a) * 7, 13, 4.5, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCarShape(ctx, car) {
  const { len, wid } = car.model;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 6);
  ctx.fill();
  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  // Windshield and rear window.
  ctx.fillStyle = 'rgba(20,30,44,0.85)';
  ctx.fillRect(len * 0.14, -wid / 2 + 3, 10, wid - 6);
  ctx.fillRect(-len * 0.32, -wid / 2 + 3, 8, wid - 6);
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
  ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
  if (car.model.name === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.isPolice) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-len * 0.08, -wid / 2, 8, wid);
    ctx.fillStyle = '#d23b3b';
    ctx.fillRect(-len * 0.08, -wid / 2, 8, 4);
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(-len * 0.08, wid / 2 - 4, 8, 4);
  }
  ctx.restore();
}

function drawCars(ctx, world) {
  for (const car of world.cars) drawCarShape(ctx, car);
}

function drawPeds(ctx, world) {
  for (const ped of world.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(14, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(0, -2, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const cop of world.footCops) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d2f55';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8c25a';
    ctx.fillRect(-6, -3, 12, 3);
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(0, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.car) return; // the car drawing already shows the player driving
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rico: red jacket, dark hair.
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2118';
  ctx.beginPath();
  ctx.arc(Math.cos(p.angle) * 2, Math.sin(p.angle) * 2 - 3, 6, 0, Math.PI * 2);
  ctx.fill();
  if (p.punchAnim > 0) {
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 22, Math.sin(p.angle) * 22, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMarker(ctx, world, t) {
  const m = missionMarker(world);
  if (!m) return;
  const pulse = 1 + Math.sin(t * 4) * 0.12;
  const r = 34 * pulse;
  ctx.save();
  ctx.strokeStyle = COLORS.marker;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x, m.y - r - 14);
  ctx.lineTo(m.x - 9, m.y - r + 4);
  ctx.lineTo(m.x + 9, m.y - r + 4);
  ctx.closePath();
  ctx.fillStyle = COLORS.marker;
  ctx.fill();
  ctx.restore();
}

// --- HUD -------------------------------------------------------------------

export function drawHUD(ctx, world) {
  const m = currentMission(world);
  ctx.save();
  // Top-left: cash, mission title, objective.
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(12, 12, 330, 86);
  ctx.fillStyle = COLORS.hudGold;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`$${world.player.cash}`, 24, 18);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(m ? m.title : 'Free Roam', 24, 54);
  ctx.fillStyle = COLORS.hudMuted;
  ctx.font = '15px sans-serif';
  ctx.fillText(missionObjectiveText(world), 24, 76);

  // Top-right: wanted stars.
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(VIEW_W - 212, 12, 200, 44);
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < world.wanted ? COLORS.starOn : COLORS.starOff;
    ctx.fillText('★', VIEW_W - 192 + i * 38, 20);
  }

  drawMinimap(ctx, world);

  // District name under the minimap.
  const district = districtAt(world.player.x, world.player.y, DISTRICTS);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(district, VIEW_W - 14, 240);

  // Bottom-left: health bar.
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(12, VIEW_H - 44, 220, 32);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 20, VIEW_H - 40);
  ctx.fillStyle = '#222';
  ctx.fillRect(20, VIEW_H - 24, 200, 10);
  ctx.fillStyle = world.player.health > 30 ? '#69c24a' : '#d23b3b';
  ctx.fillRect(20, VIEW_H - 24, 200 * Math.max(0, world.player.health / 100), 10);

  // Bottom-right: speed while driving.
  if (world.player.car) {
    const mph = Math.round(Math.abs(world.player.car.speed) * 0.12);
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(VIEW_W - 132, VIEW_H - 52, 120, 40);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${mph}`, VIEW_W - 52, VIEW_H - 46);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = COLORS.hudMuted;
    ctx.fillText('mph', VIEW_W - 20, VIEW_H - 38);
  }

  // Mission timer for the timed delivery.
  const step = m ? m.steps[world.missionStep] : null;
  if (step && step.timer && world.missionStep > 0) {
    const left = Math.max(0, step.timer - world.missionTimer);
    ctx.fillStyle = left < 15 ? '#d23b3b' : COLORS.hudText;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(left)}s`, VIEW_W / 2, 16);
  }

  // Centre-bottom dialogue box.
  if (world.dialogue.length > 0 && world.dialogueLine < world.dialogue.length) {
    const line = world.dialogue[world.dialogueLine];
    ctx.font = '17px sans-serif';
    const w = Math.min(860, ctx.measureText(line).width + 36);
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect((VIEW_W - w) / 2, VIEW_H - 108, w, 40);
    ctx.fillStyle = COLORS.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(line, VIEW_W / 2, VIEW_H - 96);
  }

  // Controls hint while on foot.
  if (!world.player.car && world.state === 'play') {
    ctx.fillStyle = COLORS.hudBg;
    ctx.font = '14px sans-serif';
    const hint = 'WASD move · SHIFT run · E enter car · F punch · P pause';
    const w = ctx.measureText(hint).width + 28;
    ctx.fillRect((VIEW_W - w) / 2, VIEW_H - 36, w, 26);
    ctx.fillStyle = COLORS.hudMuted;
    ctx.textAlign = 'center';
    ctx.fillText(hint, VIEW_W / 2, VIEW_H - 29);
  }
  ctx.restore();
}

function drawMinimap(ctx, world) {
  const mw = 220;
  const mh = 165;
  const mx = VIEW_W - mw - 12;
  const my = 64;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,16,0.85)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#5a5f6e';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  // Water + sand.
  ctx.fillStyle = '#2f7fa8';
  ctx.fillRect(mx + OCEAN_X * sx, my, (WORLD_W - OCEAN_X) * sx, mh);
  ctx.fillStyle = '#e6cf9a';
  ctx.fillRect(mx + BEACH_X * sx, my, (OCEAN_X - BEACH_X) * sx, mh);
  // Roads.
  ctx.strokeStyle = '#c8c2b2';
  ctx.lineWidth = 2;
  for (const x of ROAD_XS) {
    ctx.beginPath();
    ctx.moveTo(mx + x * sx, my);
    ctx.lineTo(mx + x * sx, my + mh);
    ctx.stroke();
  }
  for (const y of ROAD_YS) {
    ctx.beginPath();
    ctx.moveTo(mx, my + y * sy);
    ctx.lineTo(mx + mw, my + y * sy);
    ctx.stroke();
  }
  // Mission marker.
  const marker = missionMarker(world);
  if (marker) {
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(mx + marker.x * sx, my + marker.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police dots.
  ctx.fillStyle = '#5aa0ff';
  for (const car of world.policeCars) {
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = mx + world.player.x * sx;
  const py = my + world.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(world.player.angle);
  ctx.fillStyle = '#ff5a4a';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// --- Screens ---------------------------------------------------------------

function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(6,8,14,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function centredText(ctx, text, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, VIEW_W / 2, y);
}

export function drawTitle(ctx, world, save) {
  dim(ctx, 0.45);
  centredText(ctx, 'VICE SHORES', 170, 'bold 96px sans-serif', COLORS.hudGold);
  centredText(ctx, 'An open-world crime story in the spirit of GTA', 290, '24px sans-serif', COLORS.hudText);
  centredText(ctx, 'Rico Vega is back in town. Mama Lou has work. The police have questions.', 326, '18px sans-serif', COLORS.hudMuted);
  if (save) {
    centredText(ctx, `Saved progress: $${save.cash} · ${save.jobsDone} job${save.jobsDone === 1 ? '' : 's'} done — ENTER to continue`, 400, '18px sans-serif', '#9fe08a');
  }
  centredText(ctx, 'Press ENTER to start', 448, 'bold 26px sans-serif', COLORS.hudText);
  centredText(ctx, 'WASD / arrows — move & drive   E — enter / exit car   F — punch   SHIFT — run   P — pause', 512, '17px sans-serif', COLORS.hudMuted);
  centredText(ctx, 'Steal cars, run jobs for Mama Lou, and stay out of the Vice Shores PD.', 544, '17px sans-serif', COLORS.hudMuted);
}

export function drawPause(ctx) {
  dim(ctx, 0.6);
  centredText(ctx, 'PAUSED', 300, 'bold 64px sans-serif', COLORS.hudText);
  centredText(ctx, 'Press P to resume', 390, '20px sans-serif', COLORS.hudMuted);
}

export function drawBusted(ctx, world) {
  dim(ctx, 0.65);
  centredText(ctx, 'BUSTED', 280, 'bold 72px sans-serif', '#5aa0ff');
  centredText(ctx, 'The Vice Shores PD caught up with Rico.', 370, '20px sans-serif', COLORS.hudText);
  centredText(ctx, `You keep your $${world.player.cash}.`, 404, '20px sans-serif', COLORS.hudMuted);
  centredText(ctx, 'Press ENTER to try again', 460, 'bold 22px sans-serif', COLORS.hudText);
}

export function drawWasted(ctx, world) {
  dim(ctx, 0.65);
  centredText(ctx, 'WASTED', 280, 'bold 72px sans-serif', '#d23b3b');
  centredText(ctx, 'Rico went down hard in Vice Shores.', 370, '20px sans-serif', COLORS.hudText);
  centredText(ctx, `You keep your $${world.player.cash}.`, 404, '20px sans-serif', COLORS.hudMuted);
  centredText(ctx, 'Press ENTER to try again', 460, 'bold 22px sans-serif', COLORS.hudText);
}
