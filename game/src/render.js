// Canvas drawing for Vice Shores: the city, the cars and people in it, the
// HUD, the minimap and the screens. Everything is drawn with plain canvas
// shapes — no image, font or audio files anywhere in the game.

import { CFG } from './config.js';
import { clamp } from './random.js';
import { missionMarker, missionTitle, currentObjective } from './missions.js';

const VIEW_W = CFG.viewW;
const VIEW_H = CFG.viewH;

// Draw one frame. ctx is a 2d context already sized 1280x720.
export function drawWorld(ctx, world) {
  const cam = world.camera;
  const ox = Math.round(cam.x - VIEW_W / 2);
  const oy = Math.round(cam.y - VIEW_H / 2);

  ctx.save();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawGround(ctx, world, ox, oy);
  drawRoads(ctx, ox, oy);
  drawParkAndPlaza(ctx, world, ox, oy);
  drawBuildings(ctx, world, ox, oy);
  drawTrees(ctx, world, ox, oy);
  drawMarker(ctx, world, ox, oy);
  drawCars(ctx, world, ox, oy);
  drawPeds(ctx, world, ox, oy);
  drawPlayer(ctx, world, ox, oy);
  ctx.restore();

  drawHUD(ctx, world);
  drawScreens(ctx, world);
}

// ---------------------------------------------------------------- ground

function drawGround(ctx, world, ox, oy) {
  // Grass everywhere.
  ctx.fillStyle = CFG.colors.grass;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Mow stripes for a little texture.
  ctx.fillStyle = CFG.colors.grassDark;
  const stripe = 200;
  const first = Math.floor(oy / stripe) * stripe;
  for (let y = first; y < oy + VIEW_H + stripe; y += stripe * 2) {
    ctx.fillRect(0, y - oy, VIEW_W, stripe);
  }
  // Sand strip, then ocean, on the east edge.
  const sandX = CFG.sandX - ox;
  const oceanX = CFG.oceanX - ox;
  if (sandX < VIEW_W) {
    ctx.fillStyle = CFG.colors.sand;
    ctx.fillRect(Math.max(0, sandX), 0, VIEW_W, VIEW_H);
  }
  if (oceanX < VIEW_W) {
    ctx.fillStyle = CFG.colors.ocean;
    ctx.fillRect(Math.max(0, oceanX), 0, VIEW_W, VIEW_H);
    // Animated wave lines rolling in.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    const t = world.time;
    for (let row = 0; row < 8; row++) {
      const wy = ((row * 340 + t * 26) % 2600) - 100;
      ctx.beginPath();
      for (let x = oceanX + 8; x < VIEW_W; x += 26) {
        const y = wy + Math.sin((x + t * 40) / 55) * 7;
        if (x === oceanX + 8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- roads

function drawRoads(ctx, ox, oy) {
  const { roadXs, roadYs, roadHalf } = CFG;
  // Sidewalks first (a pale band wider than the asphalt).
  ctx.fillStyle = CFG.colors.sidewalk;
  for (const x of roadXs) ctx.fillRect(x - roadHalf - 26 - ox, 0, (roadHalf + 26) * 2, VIEW_H);
  for (const y of roadYs) ctx.fillRect(0, y - roadHalf - 26 - oy, VIEW_W, (roadHalf + 26) * 2);
  // Asphalt.
  ctx.fillStyle = CFG.colors.road;
  for (const x of roadXs) ctx.fillRect(x - roadHalf - ox, 0, roadHalf * 2, VIEW_H);
  for (const y of roadYs) ctx.fillRect(0, y - roadHalf - oy, VIEW_W, roadHalf * 2);
  // Dashed centre lines.
  ctx.strokeStyle = CFG.colors.line;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (const x of roadXs) { ctx.moveTo(x - ox, -oy); ctx.lineTo(x - ox, VIEW_H - oy); }
  for (const y of roadYs) { ctx.moveTo(-ox, y - oy); ctx.lineTo(VIEW_W - ox, y - oy); }
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------- park / plaza

function drawParkAndPlaza(ctx, world, ox, oy) {
  const { park, plaza } = CFG;
  // Park: deeper grass and a round pond.
  ctx.fillStyle = CFG.colors.parkGrass;
  ctx.fillRect(park.x - park.w / 2 - ox, park.y - park.h / 2 - oy, park.w, park.h);
  ctx.fillStyle = CFG.colors.pond;
  ctx.beginPath();
  ctx.arc(park.x - ox, park.y - oy, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(park.x - ox, park.y - oy, 48 + Math.sin(world.time * 1.4) * 4, 0, Math.PI * 2);
  ctx.stroke();
  // Plaza: paving and a fountain.
  ctx.fillStyle = CFG.colors.plaza;
  ctx.fillRect(plaza.x - plaza.w / 2 - ox, plaza.y - plaza.h / 2 - oy, plaza.w, plaza.h);
  ctx.fillStyle = CFG.colors.fountain;
  ctx.beginPath();
  ctx.arc(plaza.x - ox, plaza.y - oy, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8f6ff';
  ctx.beginPath();
  ctx.arc(plaza.x - ox, plaza.y - oy, 14 + Math.sin(world.time * 2.2) * 3, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- buildings

function drawBuildings(ctx, world, ox, oy) {
  for (const b of world.city.buildings) {
    const x = b.x - ox;
    const y = b.y - oy;
    if (x > VIEW_W || y > VIEW_H || x + b.w < 0 || y + b.h < 0) continue;
    // Fake height: a dark side face dropped down-right.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + b.lift, y + b.lift, b.w, b.h);
    // Roof.
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, b.w - 3, b.h - 3);
    // Vent and skylight.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + b.w * b.ventX, y + b.h * b.ventY, 16, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + b.w * (1 - b.ventX) - 18, y + b.h * (1 - b.ventY) - 14, 18, 14);
  }
}

// ---------------------------------------------------------------- trees

function drawTrees(ctx, world, ox, oy) {
  for (const t of world.city.trees) {
    const x = t.x - ox;
    const y = t.y - oy;
    if (x < -30 || x > VIEW_W + 30 || y < -30 || y > VIEW_H + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x + 4, y + 5, t.r, t.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.shade > 0.5 ? CFG.colors.tree : CFG.colors.treeDark;
    ctx.beginPath(); ctx.arc(x, y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x - t.r * 0.3, y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  // Palms: a trunk line and a star of fronds.
  for (const p of world.city.palms) {
    const x = p.x - ox;
    const y = p.y - oy;
    if (x < -40 || x > VIEW_W + 40 || y < -40 || y > VIEW_H + 40) continue;
    ctx.strokeStyle = CFG.colors.trunk;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 3, y - 6); ctx.stroke();
    ctx.fillStyle = CFG.colors.palm;
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(x + 3 + Math.cos(a) * p.r * 0.8, y - 8 + Math.sin(a) * p.r * 0.8, p.r * 0.85, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- marker

function drawMarker(ctx, world, ox, oy) {
  const m = missionMarker(world);
  if (!m || world.screen === 'title') return;
  const x = m.x - ox;
  const y = m.y - oy;
  const pulse = 26 + Math.sin(world.time * 4) * 6;
  ctx.strokeStyle = '#ffd23c';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,210,60,0.25)';
  ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill();
  // A beacon arrow above the spot.
  const bob = Math.sin(world.time * 3) * 6;
  ctx.fillStyle = '#ffd23c';
  ctx.beginPath();
  ctx.moveTo(x, y - 46 + bob);
  ctx.lineTo(x - 10, y - 64 + bob);
  ctx.lineTo(x + 10, y - 64 + bob);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- cars

function drawCars(ctx, world, ox, oy) {
  for (const car of world.cars) drawCar(ctx, car, ox, oy, false, world.time);
}

function drawCar(ctx, car, ox, oy, isPlayer, time) {
  const x = car.x - ox;
  const y = car.y - oy;
  if (x < -80 || x > VIEW_W + 80 || y < -80 || y > VIEW_H + 80) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid, 8);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1a1a1a';
  const wl = car.len * 0.28;
  const ww = 7;
  ctx.fillRect(-wl, -car.wid / 2 - 2, 14, ww);
  ctx.fillRect(wl - 4, -car.wid / 2 - 2, 14, ww);
  ctx.fillRect(-wl, car.wid / 2 - 5, 14, ww);
  ctx.fillRect(wl - 4, car.wid / 2 - 5, 14, ww);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 8);
  ctx.stroke();
  // Windshield and rear window.
  ctx.fillStyle = 'rgba(20,40,60,0.75)';
  ctx.fillRect(car.len * 0.08, -car.wid / 2 + 3, car.len * 0.22, car.wid - 6);
  ctx.fillRect(-car.len * 0.34, -car.wid / 2 + 3, car.len * 0.14, car.wid - 6);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(car.len / 2 - 3, -car.wid / 2 + 3, 3, 5);
  ctx.fillRect(car.len / 2 - 3, car.wid / 2 - 8, 3, 5);
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -car.wid / 2 - 5);
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(-8, -car.wid / 2 - 2, 16, 4);
  }
  if (car.kind === 'police') {
    const flash = Math.floor((time || 0) * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4080ff';
    ctx.fillRect(-6, -car.wid / 2 - 1, 12, 4);
    ctx.fillStyle = flash ? '#4080ff' : '#ff4040';
    ctx.fillRect(-6, car.wid / 2 - 3, 12, 4);
  }
  ctx.restore();
  if (isPlayer) {
    // Thin gold outline so the player's car reads at a glance.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 2;
    roundRect(ctx, -car.len / 2 - 2, -car.wid / 2 - 2, car.len + 4, car.wid + 4, 9);
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- people

function drawPeds(ctx, world, ox, oy) {
  for (const ped of world.peds) drawPerson(ctx, ped, ox, oy, false);
  for (const cop of world.footCops) drawPerson(ctx, cop, ox, oy, true);
}

function drawPerson(ctx, p, ox, oy, isCop) {
  const x = p.x - ox;
  const y = p.y - oy;
  if (x < -30 || x > VIEW_W + 30 || y < -30 || y > VIEW_H + 30) return;
  ctx.save();
  ctx.translate(x, y);
  if (p.downTimer > 0) {
    // Lying down: a flat shape, still visible.
    ctx.rotate(p.angle);
    ctx.fillStyle = p.shirt;
    roundRect(ctx, -13, -6, 26, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(15, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  // Shadow, body, head.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 5, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(p.walkPhase) * 1.5;
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.arc(0, bob * 0.4, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, -3 + bob * 0.4, 6.5, 0, Math.PI * 2); ctx.fill();
  if (isCop) {
    ctx.fillStyle = '#16233d';
    ctx.beginPath(); ctx.arc(0, -4 + bob * 0.4, 6.5, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx, world, ox, oy) {
  const player = world.player;
  if (player.inCar) {
    drawCar(ctx, player.inCar, ox, oy, true, world.time);
    return;
  }
  const x = player.x - ox;
  const y = player.y - oy;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 6, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(player.walkPhase) * 2;
  // Rico: white tee, dark jeans, red cap — readable at any zoom.
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath(); ctx.arc(0, bob * 0.4, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a3a';
  ctx.beginPath(); ctx.arc(0, 4 + bob * 0.4, 7, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath(); ctx.arc(0, -3 + bob * 0.4, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d03030';
  ctx.beginPath(); ctx.arc(0, -5 + bob * 0.4, 7, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(-7, -6 + bob * 0.4, 14, 3);
  // Facing tick.
  ctx.strokeStyle = '#d03030';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(Math.cos(player.angle) * 10, Math.sin(player.angle) * 10);
  ctx.lineTo(Math.cos(player.angle) * 17, Math.sin(player.angle) * 17);
  ctx.stroke();
  // Punch swing.
  if (player.punchTimer > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 26, player.angle - 0.7, player.angle + 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- HUD

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

function drawHUD(ctx, world) {
  if (world.screen === 'title') return;
  const player = world.player;

  // Top-left: cash, mission, objective.
  panel(ctx, 12, 12, 330, 74);
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('$' + player.cash.toLocaleString('en-US'), 26, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(missionTitle(world), 26, 64);
  ctx.fillStyle = '#d8d8d8';
  ctx.font = '13px sans-serif';
  ctx.fillText(currentObjective(world), 26, 80);

  // Top-right: wanted stars.
  panel(ctx, VIEW_W - 232, 12, 220, 40);
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, VIEW_W - 214 + i * 42, 32, 13, i < world.wanted ? '#ffd23c' : '#4a5058');
  }

  // Minimap under the stars.
  drawMinimap(ctx, world, VIEW_W - 232, 60, 220, 165);
  // District name under the minimap.
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(world.district, VIEW_W - 14, 244);
  ctx.textAlign = 'left';

  // Bottom-left: health bar.
  panel(ctx, 12, VIEW_H - 52, 220, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('HEALTH', 22, VIEW_H - 36);
  ctx.fillStyle = '#222';
  ctx.fillRect(22, VIEW_H - 30, 200, 12);
  const hp = clamp(player.health / 100, 0, 1);
  ctx.fillStyle = hp > 0.5 ? '#5ac83c' : hp > 0.25 ? '#e8a83c' : '#d03030';
  ctx.fillRect(22, VIEW_H - 30, 200 * hp, 12);

  // Bottom-right: speed while driving.
  if (player.inCar) {
    panel(ctx, VIEW_W - 132, VIEW_H - 52, 120, 40);
    const mph = Math.round(Math.abs(player.inCar.speed) * 0.09);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(mph), VIEW_W - 52, VIEW_H - 22);
    ctx.font = '13px sans-serif';
    ctx.fillText('mph', VIEW_W - 22, VIEW_H - 22);
    ctx.textAlign = 'left';
  }

  // Controls hint while on foot.
  if (!player.inCar && world.screen === 'play') {
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    const hint = 'WASD move  ·  SHIFT run  ·  E enter car  ·  F punch  ·  P pause';
    ctx.font = '13px sans-serif';
    const w = ctx.measureText(hint).width + 24;
    roundRect(ctx, (VIEW_W - w) / 2, VIEW_H - 34, w, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(hint, VIEW_W / 2, VIEW_H - 16);
    ctx.textAlign = 'left';
  }

  // Dialogue box, centre-bottom.
  if (world.dialogue) {
    ctx.font = '15px sans-serif';
    const w = Math.min(760, ctx.measureText(world.dialogue.text).width + 32);
    panel(ctx, (VIEW_W - w) / 2, VIEW_H - 108, w, 34);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(world.dialogue.text, VIEW_W / 2, VIEW_H - 85);
    ctx.textAlign = 'left';
  }

  // Timed mission clock (the Package Run delivery).
  if (world.missionIndex === 1 && world.missionStep === 1 && world.missionTimer > 0) {
    const left = Math.max(0, 75 - world.missionTimer);
    ctx.fillStyle = left < 15 ? '#ff5040' : '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TIME ' + left.toFixed(0) + 's', VIEW_W / 2, 120);
    ctx.textAlign = 'left';
  }
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMinimap(ctx, world, x, y, w, h) {
  const sx = w / CFG.worldW;
  const sy = h / CFG.worldH;
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // Ocean and sand.
  ctx.fillStyle = CFG.colors.ocean;
  ctx.fillRect(x + CFG.oceanX * sx, y, w, h);
  ctx.fillStyle = CFG.colors.sand;
  ctx.fillRect(x + CFG.sandX * sx, y, (CFG.oceanX - CFG.sandX) * sx, h);
  // Roads.
  ctx.strokeStyle = '#8a8f98';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const rx of CFG.roadXs) { ctx.moveTo(x + rx * sx, y); ctx.lineTo(x + rx * sx, y + h); }
  for (const ry of CFG.roadYs) { ctx.moveTo(x, y + ry * sy); ctx.lineTo(x + w, y + ry * sy); }
  ctx.stroke();
  // Mission marker.
  const m = missionMarker(world);
  if (m) {
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.arc(x + m.x * sx, y + m.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police dots.
  ctx.fillStyle = '#5aa0ff';
  for (const car of world.police) {
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = world.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ff4040';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------- screens

function drawScreens(ctx, world) {
  if (world.screen === 'play') return;
  ctx.fillStyle = 'rgba(8,10,16,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (world.screen === 'title') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('VICE SHORES', VIEW_W / 2, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px sans-serif';
    ctx.fillText('An open-world crime story in the spirit of GTA', VIEW_W / 2, 296);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#d8d8d8';
    ctx.fillText('Rico Vega is back in town. Mama Lou has work. The police have questions.', VIEW_W / 2, 326);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Press ENTER to start', VIEW_W / 2, 420);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#d8d8d8';
    ctx.fillText('WASD / arrows — move & drive   E — enter / exit car   F — punch   SHIFT — run   P — pause', VIEW_W / 2, 462);
    ctx.fillText('Steal cars, run jobs for Mama Lou, and stay out of the Vice Shores PD.', VIEW_W / 2, 488);
    if (world.hasSave) {
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('Saved progress found — press ENTER to continue ($' + world.saveCash + ', job ' + (world.saveMission + 1) + ' of 4)', VIEW_W / 2, 540);
    }
    ctx.textAlign = 'left';
    return;
  }

  ctx.textAlign = 'center';
  if (world.screen === 'pause') {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 330);
    ctx.font = '18px sans-serif';
    ctx.fillText('Press P to resume', VIEW_W / 2, 380);
  } else if (world.screen === 'busted') {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('BUSTED!', VIEW_W / 2, 330);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText('The Vice Shores PD caught up with you. Your cash is safe — for now.', VIEW_W / 2, 380);
    ctx.fillText('Press ENTER to get back out there', VIEW_W / 2, 412);
  } else if (world.screen === 'wasted') {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('WASTED', VIEW_W / 2, 330);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText('Rico went down. Mama Lou is not happy.', VIEW_W / 2, 380);
    ctx.fillText('Press ENTER to try again', VIEW_W / 2, 412);
  }
  ctx.textAlign = 'left';
}
