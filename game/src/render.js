// Canvas drawing for Vice Shores v5.3: the city, the cars and people in
// it, the HUD, the minimap and the screens. Everything is drawn with plain
// canvas shapes — no image, font or audio files anywhere in the game.
//
// v5.3 changes:
// - The police scanner: at 3+ stars the nearest roadblock is ringed on
//   the minimap (a pulsing orange ring) and read out under the radio
//   line — distance and compass bearing, so the driver can plan around
//   the cordon. With Ivy the Spotter on the crew, EVERY roadblock and
//   every police car is ringed live.
// - The wanted heat meter: a thin bar under the wanted stars, orange,
//   showing the 0-100 heat that lives between jobs.
// - District events: a coloured banner on the HUD (gold for a race, red
//   for a raid, dark blue for a blackout) and a tint over the district
//   on the minimap, with the event's name and the seconds left.
// - Stakeout cars: a police car on a stakeout is drawn dark, lights off,
//   until the ambush trips it — then its light bar flashes like any
//   other patrol car.
// - HUD: a turf-flip flash line, and a gold "X — GETAWAY READY" chip
//   while Dante's swap is available. The crew badges list all six.
// - Crew panel: six rows — five hires and Ivy's promotion to Spotter.
//   District panel: a turf column, a note when a hostile board is
//   closed, and the live event for each district.
// - Title screen: twelve jobs, and the controls line names the wheelman
//   and the Spotter promotion.
// - The ROADBLOCK label no longer hides behind the dialogue box: when a
//   roadblock sits near the bottom of the screen, its label is drawn
//   below the bar instead of above it, clear of Mama Lou's lines.
// - Rolling roadblocks get a label of their own, and the second
//   helicopter (Air-2) is drawn with its own beam from the up-right.
// - The lockdown: a red banner on the HUD and a pulsing ring around the
//   locked-down district on the minimap. Hostile districts are tinted
//   red on the minimap, home turf green.

import { CFG } from './config.js';
import { clamp } from './random.js';
import { missionMarker, missionTitle, currentObjective, MISSIONS } from './missions.js';
import { CREW_ROLES, SPOTTER_PROMOTION, crewCost, wheelmanReady, isSpotter } from './crew.js';
import { STANDING_DISTRICTS, standingOf, standingSummary, boardJobs, sideJobObjective, turfLabel, eventKind } from './standing.js';
import { scannerLive, scannerReadout, nearestRoadblock } from './dispatch.js';
import { stakeoutWaiting } from './police.js';
import { noticeBoardAt, districtRect } from './city.js';

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
  drawNoticeBoards(ctx, world, ox, oy);
  drawMarker(ctx, world, ox, oy);
  drawCars(ctx, world, ox, oy);
  drawPeds(ctx, world, ox, oy);
  drawPlayer(ctx, world, ox, oy);
  drawFlares(ctx, world, ox, oy);
  drawRoadblocks(ctx, world, ox, oy);
  drawHeli(ctx, world, world.heli, 'AIR-1', ox, oy, true);
  drawHeli(ctx, world, world.heli2, 'AIR-2', ox, oy, false);
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

// ---------------------------------------------------------------- notice boards (v5.1)

function drawNoticeBoards(ctx, world, ox, oy) {
  for (const b of world.city.boards) {
    const x = b.x - ox;
    const y = b.y - oy;
    if (x < -50 || x > VIEW_W + 50 || y < -50 || y > VIEW_H + 50) continue;
    // A wooden sign on a post: the job board lives here. The current
    // district's board gets a gold frame so it reads at a glance.
    const here = noticeBoardAt(world.city, world.district) === b;
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(x - 2, y, 4, 16);
    ctx.fillStyle = '#a87c4a';
    ctx.fillRect(x - 19, y - 22, 38, 24);
    ctx.strokeStyle = here ? '#ffd23c' : '#5a3a1a';
    ctx.lineWidth = here ? 3 : 2;
    ctx.strokeRect(x - 19, y - 22, 38, 24);
    ctx.fillStyle = '#fff8e8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JOBS', x, y - 7);
    ctx.textAlign = 'left';
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

// ---------------------------------------------------------------- flares, roadblocks & helicopters (v5/v5.1/v5.2)

function drawFlares(ctx, world, ox, oy) {
  for (const f of world.flares) {
    const x = f.x - ox;
    const y = f.y - oy;
    if (x < -40 || x > VIEW_W + 40 || y < -40 || y > VIEW_H + 40) continue;
    // Orange smoke rising from the road, flickering as it burns down.
    const left = Math.max(0, f.until - world.time);
    const alpha = Math.min(0.8, left / 2);
    const r = 12 + Math.sin(world.time * 9 + f.x) * 3;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r * 2.2);
    grad.addColorStop(0, `rgba(255,122,42,${alpha})`);
    grad.addColorStop(1, 'rgba(255,122,42,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Where a roadblock's label goes: above the bar, unless the bar is near
// the bottom of the screen — then the dialogue box (centre-bottom,
// VIEW_H - 108 to VIEW_H - 74) would cover it, so the label goes below
// the bar instead. v5.1 drew it above always, and the chase shot's
// ROADBLOCK label sat half under Mama Lou's lines.
function roadblockLabelY(y) {
  return y > VIEW_H - 130 ? y + 34 : y - 14;
}

function drawRoadblocks(ctx, world, ox, oy) {
  for (const rb of world.roadblocks) {
    const x = rb.x - ox;
    const y = rb.y - oy;
    if (x < -120 || x > VIEW_W + 120 || y < -120 || y > VIEW_H + 120) continue;
    // The bar lies ACROSS the road — a north-south road gets a horizontal
    // bar, an east-west road a vertical one — exactly matching the solid
    // box in dispatch.js. v5 rotated the bar by the road angle, so it
    // ran along the road while the collision ran across it.
    const horizontal = rb.angle !== 0;
    if (rb.kind === 'spike') {
      // A spike strip: a dark flat strip with teeth, no cars, no sign.
      ctx.fillStyle = '#22242a';
      if (horizontal) ctx.fillRect(x - 76, y - 6, 152, 12);
      else ctx.fillRect(x - 6, y - 76, 12, 152);
      ctx.fillStyle = CFG.colors.spike;
      if (horizontal) {
        for (let s = -70; s <= 70; s += 14) {
          ctx.beginPath();
          ctx.moveTo(x + s - 4, y - 6); ctx.lineTo(x + s, y + 6); ctx.lineTo(x + s + 4, y - 6);
          ctx.closePath(); ctx.fill();
        }
      } else {
        for (let s = -70; s <= 70; s += 14) {
          ctx.beginPath();
          ctx.moveTo(x - 6, y + s - 4); ctx.lineTo(x + 6, y + s); ctx.lineTo(x - 6, y + s + 4);
          ctx.closePath(); ctx.fill();
        }
      }
      continue;
    }
    if (rb.kind === 'rolling') {
      // A rolling roadblock: two police cars driving side by side, drawn
      // by drawCars already — here just the label over the pair, clear
      // of the dialogue box like the barrier's.
      ctx.fillStyle = '#ff8c2a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ROLLING ROADBLOCK', x, roadblockLabelY(y));
      ctx.textAlign = 'left';
      continue;
    }
    // Striped barrier bar across the road, with a ROADBLOCK sign above it
    // — or below it, when the bar is near the bottom of the screen.
    ctx.fillStyle = '#f2c230';
    if (horizontal) ctx.fillRect(x - 76, y - 7, 152, 14);
    else ctx.fillRect(x - 7, y - 76, 14, 152);
    ctx.fillStyle = '#222';
    if (horizontal) {
      for (let s = -76; s < 76; s += 24) ctx.fillRect(x + s, y - 7, 12, 14);
    } else {
      for (let s = -76; s < 76; s += 24) ctx.fillRect(x - 7, y + s, 14, 12);
    }
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROADBLOCK', x, roadblockLabelY(y));
    ctx.textAlign = 'left';
  }
}

// A helicopter: a soft pool of light pinned on the player, a faint beam
// from the helicopter down to the pool, and the helicopter itself with
// its call sign. Air-1 hovers up-left, Air-2 up-right, so the two beams
// cross over the player instead of stacking on each other. Only Air-1
// draws the light pool — two pools on the same spot would double the
// brightness and wash the chase out.
function drawHeli(ctx, world, h, label, ox, oy, drawPool) {
  if (!h) return;
  const p = world.player;
  const px = p.x - ox;
  const py = p.y - oy;
  const hx = h.x - ox;
  const hy = h.y - oy;
  // Spotlight beam: a soft wedge from the helicopter to the player.
  ctx.fillStyle = 'rgba(255,244,180,0.10)';
  ctx.beginPath();
  ctx.moveTo(hx - 14, hy + 6);
  ctx.lineTo(hx + 14, hy + 6);
  ctx.lineTo(px + 90, py);
  ctx.lineTo(px - 90, py);
  ctx.closePath();
  ctx.fill();
  if (drawPool) {
    const grad = ctx.createRadialGradient(px, py, 10, px, py, 210);
    grad.addColorStop(0, 'rgba(255,244,180,0.42)');
    grad.addColorStop(1, 'rgba(255,244,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 210, 0, Math.PI * 2);
    ctx.fill();
  }
  // The helicopter itself: a dark body with a spinning rotor and a call
  // sign, big enough to read at a glance.
  if (hx > -60 && hx < VIEW_W + 60 && hy > -60 && hy < VIEW_H + 60) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(4, 5, 24, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#23232a';
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    const spin = world.time * 22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(spin) * 34, Math.sin(spin) * 5);
    ctx.lineTo(-Math.cos(spin) * 34, -Math.sin(spin) * 5);
    ctx.stroke();
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 26);
    ctx.restore();
  }
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
  // Wheels. A car with popped tyres (spike strip) shows flat rear wheels.
  ctx.fillStyle = '#1a1a1a';
  const wl = car.len * 0.28;
  const ww = 7;
  ctx.fillRect(-wl, -car.wid / 2 - 2, 14, ww);
  ctx.fillRect(wl - 4, -car.wid / 2 - 2, 14, ww);
  if (car.tireTimer > 0) {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-wl, car.wid / 2 - 5, 14, ww + 3);
    ctx.fillRect(wl - 4, car.wid / 2 - 5, 14, ww + 3);
  } else {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-wl, car.wid / 2 - 5, 14, ww);
    ctx.fillRect(wl - 4, car.wid / 2 - 5, 14, ww);
  }
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
    // A stakeout car sits dark, lights off, until the ambush trips it —
    // then its light bar flashes like any other patrol car.
    if (!car.stakeout) {
      const flash = Math.floor((time || 0) * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff4040' : '#4080ff';
      ctx.fillRect(-6, -car.wid / 2 - 1, 12, 4);
      ctx.fillStyle = flash ? '#4080ff' : '#ff4040';
      ctx.fillRect(-6, car.wid / 2 - 3, 12, 4);
    }
  }
  if (car.getaway) {
    // Dante's getaway car: a gold stripe down the middle, so it reads
    // as special at a glance — the fastest car in Vice Shores.
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(-car.len / 2 + 4, -2, car.len - 8, 4);
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
  // v5: recruited crew walk with Rico — a gold ring marks them as crew.
  for (const c of world.companions) {
    drawPerson(ctx, c, ox, oy, false);
    const x = c.x - ox;
    const y = c.y - oy;
    if (x < -30 || x > VIEW_W + 30 || y < -30 || y > VIEW_H + 30) continue;
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
  }
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

  // Top-left: cash, mission, objective (a side job's objective while one
  // is running — the story job waits until the side job is done).
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
  ctx.fillText(world.sideJob ? sideJobObjective(world) : currentObjective(world), 26, 80);

  // Top-right: wanted stars, and under them the heat meter (v5.3): a
  // thin orange bar showing the 0-100 heat that lives between jobs.
  panel(ctx, VIEW_W - 232, 12, 220, 40);
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, VIEW_W - 214 + i * 42, 32, 13, i < world.wanted ? '#ffd23c' : '#4a5058');
  }
  const heat = world.heat || 0;
  ctx.fillStyle = '#222';
  ctx.fillRect(VIEW_W - 232, 56, 220, 6);
  if (heat > 0) {
    ctx.fillStyle = heat >= CFG.heatLine ? '#ff5040' : CFG.colors.heat;
    ctx.fillRect(VIEW_W - 232, 56, 220 * (heat / CFG.heatMax), 6);
  }

  // Minimap under the stars.
  drawMinimap(ctx, world, VIEW_W - 232, 68, 220, 165);
  // District name under the minimap, with its standing bar (v5) and its
  // turf label (v5.2): home turf green, hostile red.
  const turf = world.district === 'Ocean' ? 'neutral' : (world.standing ? (world.standing[world.district] >= CFG.turfLoved ? 'home' : world.standing[world.district] <= CFG.turfHated ? 'hostile' : 'neutral') : 'neutral');
  ctx.fillStyle = turf === 'hostile' ? '#ff9080' : turf === 'home' ? '#8ae08a' : '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(world.district + (turf !== 'neutral' ? ' — ' + turfLabel(turf) : ''), VIEW_W - 14, 252);
  ctx.textAlign = 'left';
  const st = standingOf(world, world.district);
  ctx.fillStyle = '#222';
  ctx.fillRect(VIEW_W - 232, 258, 220, 8);
  const mid = VIEW_W - 232 + 110;
  ctx.fillStyle = st >= 0 ? '#5ac83c' : '#d03030';
  if (st >= 0) ctx.fillRect(mid, 258, 110 * (st / 100), 8);
  else ctx.fillRect(mid + 110 * (st / 100), 258, 110 * (-st / 100), 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(st >= 0 ? '+' + st : String(st), VIEW_W - 14, 280);
  ctx.textAlign = 'left';
  // Standing-change flash: its own line below the value, never on top of
  // it — v5 drew both at the same height and they overlapped.
  if (world.standingFlash) {
    ctx.fillStyle = world.standingFlash.delta > 0 ? '#8ae08a' : '#ff9080';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((world.standingFlash.delta > 0 ? '+' : '') + world.standingFlash.delta + ' ' + world.standingFlash.district, VIEW_W - 14, 300);
    ctx.textAlign = 'left';
  }
  // Turf-flip flash: its own line below the standing flash.
  if (world.turfFlash) {
    ctx.fillStyle = world.turfFlash.turf === 'home' ? '#8ae08a' : world.turfFlash.turf === 'hostile' ? '#ff9080' : '#d8d8d8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(world.turfFlash.district + ' is now ' + turfLabel(world.turfFlash.turf), VIEW_W - 14, 320);
    ctx.textAlign = 'left';
  }
  // District-event flash: its own line below the turf flash.
  if (world.eventFlash) {
    const kind = eventKind(world.eventFlash.type);
    ctx.fillStyle = world.eventFlash.type === 'race' ? '#ffd23c' : world.eventFlash.type === 'raid' ? '#ff9080' : '#9ec8ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((kind ? kind.label : 'EVENT') + ' in ' + world.eventFlash.district, VIEW_W - 14, 340);
    ctx.textAlign = 'left';
  }

  // Dispatch radio line (v5): what the PD is saying right now.
  if (world.dispatch && world.dispatch.msg) {
    ctx.font = '13px sans-serif';
    const dw = Math.min(560, ctx.measureText(world.dispatch.msg).width + 32);
    panel(ctx, (VIEW_W - dw) / 2, 12, dw, 28);
    ctx.fillStyle = '#9ec8ff';
    ctx.textAlign = 'center';
    ctx.fillText(world.dispatch.msg, VIEW_W / 2, 31);
    ctx.textAlign = 'left';
  }

  // Police scanner readout (v5.3): under the radio line, the nearest
  // roadblock's distance and bearing — or a note that the scanner is
  // dark in a blackout. A stakeout warning rides on the same line.
  const scan = scannerReadout(world);
  if (scan || stakeoutWaiting(world)) {
    const text = stakeoutWaiting(world) ? 'SCANNER: stakeout ahead — the destination is watched' : scan;
    ctx.font = 'bold 13px sans-serif';
    const sw = Math.min(560, ctx.measureText(text).width + 32);
    panel(ctx, (VIEW_W - sw) / 2, 46, sw, 26);
    ctx.fillStyle = stakeoutWaiting(world) ? '#ff9080' : '#ff8c2a';
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 64);
    ctx.textAlign = 'left';
  }

  // District-event banner (v5.3): the live event, coloured by kind, with
  // the seconds left. It sits below the scanner line so the two never
  // overlap.
  if (world.districtEvent) {
    const ev = world.districtEvent;
    const kind = eventKind(ev.type);
    const left = Math.max(0, ev.until - world.time);
    const text = (kind ? kind.label : 'EVENT') + ' — ' + ev.district + ' (' + left.toFixed(0) + 's)';
    ctx.font = 'bold 14px sans-serif';
    const ew = ctx.measureText(text).width + 32;
    const bg = ev.type === 'race' ? 'rgba(200,160,20,0.85)' : ev.type === 'raid' ? 'rgba(208,48,48,0.85)' : 'rgba(30,40,80,0.9)';
    ctx.fillStyle = bg;
    roundRect(ctx, (VIEW_W - ew) / 2, 78, ew, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 97);
    ctx.textAlign = 'left';
  }

  // Lockdown banner (v5.2): the district the player is in is sealed at
  // five stars. It sits below the event banner so the two never overlap.
  if (world.lockdown) {
    const text = 'LOCKDOWN — ' + world.lockdown.district + ' sealed';
    ctx.font = 'bold 14px sans-serif';
    const lw = ctx.measureText(text).width + 32;
    const pulse = 0.6 + Math.sin(world.time * 5) * 0.15;
    ctx.fillStyle = `rgba(208,48,48,${pulse})`;
    roundRect(ctx, (VIEW_W - lw) / 2, 112, lw, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 131);
    ctx.textAlign = 'left';
  }

  // Crew badges (v5/v5.1/v5.2/v5.3): who is on Rico's side, at a glance —
  // six now, counting Ivy's promotion to Spotter.
  const hired = CREW_ROLES.filter((r) => world.crew[r.id]);
  const badgeNames = hired.map((r) => r.name.split(' ')[0]);
  if (world.crew.spotter) badgeNames.push('Spotter');
  if (badgeNames.length) {
    panel(ctx, 12, 94, 330, 26);
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('CREW: ' + badgeNames.join(' · '), 26, 112);
  }
  // Getaway-ready chip (v5.2): Dante's once-per-job swap is available.
  if (wheelmanReady(world)) {
    panel(ctx, 12, 126, 190, 26);
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('X — GETAWAY READY', 26, 144);
  }

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
    const hint = 'WASD move  ·  SHIFT run  ·  E enter car  ·  F punch  ·  C crew  ·  H hack  ·  G fixer  ·  X getaway  ·  B jobs  ·  V districts  ·  P pause';
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

  // Timed mission clock (the Package Run / Silent Partner delivery).
  const mission = MISSIONS[world.missionIndex];
  const timedStep = mission && mission.steps[world.missionStep];
  if (timedStep && timedStep.timed && world.missionTimer > 0) {
    const left = Math.max(0, timedStep.timed - world.missionTimer);
    ctx.fillStyle = left < 15 ? '#ff5040' : '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TIME ' + left.toFixed(0) + 's', VIEW_W / 2, 156);
    ctx.textAlign = 'left';
    // The checkpoint: while it is still ahead, the HUD says so — the
    // v5.1 checkpoint was easy to miss, and a timed run lives or dies
    // by knowing where the extra seconds are.
    if (timedStep.checkpoint && !world.checkpointHit) {
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((timedStep.checkpoint.name || 'CHECKPOINT') + ' AHEAD: +' + timedStep.checkpoint.bonus + 's', VIEW_W / 2, 178);
      ctx.textAlign = 'left';
    }
  }

  // Side-job clock, under the mission clock when both run (they never
  // run together — a side job waits for the story job — but the line is
  // cheap insurance for the panel's own timer).
  if (world.sideJob && world.sideJob.timed) {
    const left = Math.max(0, world.sideJob.timed - world.sideJob.timer);
    ctx.fillStyle = left < 10 ? '#ff5040' : '#ffd23c';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SIDE JOB ' + left.toFixed(0) + 's', VIEW_W / 2, 182);
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
  // v5.2: turf tints — home turf green, hostile red, drawn under the
  // roads so the map stays readable.
  for (const d of STANDING_DISTRICTS) {
    const r = districtRect(d);
    if (!r) continue;
    const s = standingOf(world, d);
    if (s >= CFG.turfLoved) {
      ctx.fillStyle = CFG.colors.turfHome;
      ctx.fillRect(x + r.x * sx, y + r.y * sy, r.w * sx, r.h * sy);
    } else if (s <= CFG.turfHated) {
      ctx.fillStyle = CFG.colors.turfHostile;
      ctx.fillRect(x + r.x * sx, y + r.y * sy, r.w * sx, r.h * sy);
    }
  }
  // v5.3: district-event tint — the live event's district is washed in
  // its colour (gold for a race, red for a raid, dark blue for a
  // blackout), drawn over the turf tint so the event reads first.
  if (world.districtEvent) {
    const ev = world.districtEvent;
    const r = districtRect(ev.district);
    if (r) {
      ctx.fillStyle = ev.type === 'race' ? CFG.colors.eventRace :
        ev.type === 'raid' ? CFG.colors.eventRaid : CFG.colors.eventBlackout;
      ctx.fillRect(x + r.x * sx, y + r.y * sy, r.w * sx, r.h * sy);
    }
  }
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
  // v5.1: notice boards are brown dots — the job board is findable.
  ctx.fillStyle = '#a87c4a';
  for (const b of world.city.boards) {
    ctx.fillRect(x + b.x * sx - 2, y + b.y * sy - 2, 4, 4);
  }
  // v5.2: the lockdown ring — a pulsing red border around the district
  // that is sealed at five stars.
  if (world.lockdown) {
    const r = districtRect(world.lockdown.district);
    if (r) {
      const pulse = 2 + Math.sin(world.time * 5) * 1;
      ctx.strokeStyle = CFG.colors.lockdown;
      ctx.lineWidth = pulse;
      ctx.strokeRect(x + r.x * sx, y + r.y * sy, r.w * sx, r.h * sy);
    }
  }
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
    if (car.stakeout) continue; // a stakeout car is invisible until it trips
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // v5: roadblocks are orange squares — and with Ivy the Lookout on the
  // crew, the minimap also draws a ring showing how far she can see.
  ctx.fillStyle = '#ff8c2a';
  for (const rb of world.roadblocks) {
    ctx.fillRect(x + rb.x * sx - 4, y + rb.y * sy - 4, 8, 8);
  }
  if (world.crew.lookout) {
    const p0 = world.player;
    ctx.strokeStyle = 'rgba(255,210,60,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + p0.x * sx, y + p0.y * sy, 400 * sx, 0, Math.PI * 2);
    ctx.stroke();
  }
  // v5.3: the scanner ring — at 3+ stars the nearest roadblock is ringed
  // in pulsing orange so it reads at a glance. With Ivy the Spotter on
  // the crew, EVERY roadblock and every police car is ringed instead.
  if (scannerLive(world)) {
    const pulse = 1.5 + Math.sin(world.time * 6) * 0.8;
    ctx.strokeStyle = CFG.colors.scanner;
    ctx.lineWidth = pulse;
    if (isSpotter(world)) {
      for (const rb of world.roadblocks) {
        ctx.beginPath();
        ctx.arc(x + rb.x * sx, y + rb.y * sy, CFG.scannerRingRadius * sx + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const car of world.police) {
        if (car.stakeout) continue;
        ctx.beginPath();
        ctx.arc(x + car.x * sx, y + car.y * sy, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      const rb = nearestRoadblock(world);
      if (rb) {
        ctx.beginPath();
        ctx.arc(x + rb.x * sx, y + rb.y * sy, CFG.scannerRingRadius * sx + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
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

// ---------------------------------------------------------------- overlays (v5/v5.1/v5.2/v5.3)

function drawCrewPanel(ctx, world) {
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, (VIEW_W - 760) / 2, 20, 760, 680);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('YOUR CREW', VIEW_W / 2, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Hire once, keep them for the game. Your cash: $' + world.player.cash.toLocaleString('en-US'), VIEW_W / 2, 100);
  ctx.textAlign = 'left';
  CREW_ROLES.forEach((role, i) => {
    const y = 124 + i * 84;
    const hired = !!world.crew[role.id];
    const cost = crewCost(world, role);
    panel(ctx, (VIEW_W - 700) / 2, y, 700, 76);
    ctx.fillStyle = hired ? '#5ac83c' : '#ffd23c';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText((i + 1) + '. ' + role.name + (hired ? '  —  HIRED' : '  —  $' + cost), (VIEW_W - 700) / 2 + 24, y + 32);
    ctx.fillStyle = '#d8d8d8';
    ctx.font = '15px sans-serif';
    ctx.fillText(role.blurb, (VIEW_W - 700) / 2 + 24, y + 58);
    if (!hired && world.player.cash < cost) {
      ctx.fillStyle = '#ff9080';
      ctx.fillText('Not enough cash yet.', (VIEW_W - 700) / 2 + 24, y + 72);
    }
  });
  // v5.3: the sixth row — Ivy's promotion to Spotter. Only open once Ivy
  // is hired; once promoted it reads HIRED like the rest.
  const py = 124 + CREW_ROLES.length * 84;
  const promoted = !!world.crew.spotter;
  const hasIvy = !!world.crew.lookout;
  const pcost = crewCost(world, SPOTTER_PROMOTION);
  panel(ctx, (VIEW_W - 700) / 2, py, 700, 76);
  ctx.fillStyle = promoted ? '#5ac83c' : hasIvy ? '#ffd23c' : '#8a8f98';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('6. ' + SPOTTER_PROMOTION.name + (promoted ? '  —  HIRED' : hasIvy ? '  —  $' + pcost : '  —  needs Ivy hired first'), (VIEW_W - 700) / 2 + 24, py + 32);
  ctx.fillStyle = '#d8d8d8';
  ctx.font = '15px sans-serif';
  ctx.fillText(SPOTTER_PROMOTION.blurb, (VIEW_W - 700) / 2 + 24, py + 58);
  if (hasIvy && !promoted && world.player.cash < pcost) {
    ctx.fillStyle = '#ff9080';
    ctx.fillText('Not enough cash yet.', (VIEW_W - 700) / 2 + 24, py + 72);
  }
  ctx.fillStyle = '#d8d8d8';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Press 1 / 2 / 3 / 4 / 5 to hire, 6 to promote Ivy, C to close. Standing in your district makes hiring cheaper.', VIEW_W / 2, 676);
  ctx.textAlign = 'left';
}

function drawDistrictPanel(ctx, world) {
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, (VIEW_W - 760) / 2, 70, 760, 540);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('DISTRICT STANDING', VIEW_W / 2, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Finish jobs to be loved. Commit crimes to be hated. At +60 a district is home turf; at -60 it turns hostile.', VIEW_W / 2, 158);
  ctx.textAlign = 'left';
  STANDING_DISTRICTS.forEach((d, i) => {
    const y = 190 + i * 62;
    const sum = standingSummary(world, d);
    ctx.fillStyle = sum.turf === 'hostile' ? '#ff9080' : sum.turf === 'home' ? '#8ae08a' : '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(d, (VIEW_W - 700) / 2 + 24, y + 22);
    // Standing bar, -100..+100 around a centre line.
    const bx = (VIEW_W - 700) / 2 + 240;
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, y + 6, 220, 12);
    ctx.fillStyle = sum.standing >= 0 ? '#5ac83c' : '#d03030';
    if (sum.standing >= 0) ctx.fillRect(bx + 110, y + 6, 110 * (sum.standing / 100), 12);
    else ctx.fillRect(bx + 110 + 110 * (sum.standing / 100), y + 6, 110 * (-sum.standing / 100), 12);
    ctx.fillStyle = '#d8d8d8';
    ctx.font = '14px sans-serif';
    const turfNote = sum.turf === 'home' ? '  ·  HOME TURF' : sum.turf === 'hostile' ? '  ·  HOSTILE — board closed' : '';
    const ev = world.districtEvent && world.districtEvent.district === d ? world.districtEvent : null;
    const evNote = ev ? '  ·  ' + (eventKind(ev.type) ? eventKind(ev.type).label : 'EVENT') : '';
    ctx.fillText((sum.standing >= 0 ? '+' : '') + sum.standing + '  ·  ' + d + ' ' + sum.mood + '  ·  payout ' + (sum.pay >= 0 ? '+' : '') + sum.pay + '%' + turfNote + evNote, bx + 240, y + 18);
  });
  ctx.fillStyle = '#d8d8d8';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Press V to close.', VIEW_W / 2, 586);
  ctx.textAlign = 'left';
}

// v5.1: the job board — side jobs for the district the player is standing
// in. A board opens once the district likes Rico (+20 standing); until
// then the jobs are listed but locked. v5.2: a hostile district's board
// is locked shut, whatever it used to offer. v5.3: a district event pays
// a bonus on the board too — the payout shown already includes it.
function drawJobBoardPanel(ctx, world) {
  const district = world.district;
  const standing = standingOf(world, district);
  const jobs = boardJobs(world, district);
  const hostile = jobs.length > 0 && jobs[0].hostile;
  const open = standing >= CFG.jobBoardStandingNeeded && !hostile;
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, (VIEW_W - 760) / 2, 90, 760, 480);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('JOB BOARD — ' + district.toUpperCase(), VIEW_W / 2, 148);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText(hostile
    ? 'This district is HOSTILE — its board is closed until you win it back.'
    : open
      ? 'Side work for a district that knows you. One job at a time — finish it for cash and standing.'
      : 'This district does not know you yet. Reach +' + CFG.jobBoardStandingNeeded + ' standing here to open its board (now ' + (standing >= 0 ? '+' : '') + standing + ').', VIEW_W / 2, 178);
  ctx.textAlign = 'left';
  jobs.forEach((job, i) => {
    const y = 210 + i * 108;
    panel(ctx, (VIEW_W - 700) / 2, y, 700, 92);
    ctx.fillStyle = open ? '#ffd23c' : '#8a8f98';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText((i + 1) + '. ' + job.name + (open ? '  —  $' + job.payout : '  —  LOCKED'), (VIEW_W - 700) / 2 + 24, y + 34);
    ctx.fillStyle = '#d8d8d8';
    ctx.font = '15px sans-serif';
    ctx.fillText(job.text, (VIEW_W - 700) / 2 + 24, y + 62);
    ctx.fillStyle = '#9ec8ff';
    ctx.fillText('Deliver within ' + job.timed + 's  ·  +' + CFG.sideJobStandingGain + ' standing on completion', (VIEW_W - 700) / 2 + 24, y + 84);
  });
  ctx.fillStyle = '#d8d8d8';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(open ? 'Press 1 / 2 to take a job, B to close.' : 'Finish story jobs in this district to raise its standing, then come back.', VIEW_W / 2, 452);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- screens

function drawScreens(ctx, world) {
  if (world.screen === 'play' && !world.overlay) return;
  if (world.screen === 'play' && world.overlay === 'crew') return drawCrewPanel(ctx, world);
  if (world.screen === 'play' && world.overlay === 'districts') return drawDistrictPanel(ctx, world);
  if (world.screen === 'play' && world.overlay === 'jobs') return drawJobBoardPanel(ctx, world);
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
    ctx.fillText('Press ENTER to start', VIEW_W / 2, 410);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#d8d8d8';
    ctx.fillText('WASD / arrows — move & drive   E — enter / exit car   F — punch   SHIFT — run   P — pause', VIEW_W / 2, 452);
    ctx.fillText('C — hire a crew   H — hacker jam   G — fixer launder   X — wheelman getaway   B — job board   V — district standing', VIEW_W / 2, 478);
    ctx.fillText('Steal cars, run ' + MISSIONS.length + ' jobs for Mama Lou, build your crew and your name in every district.', VIEW_W / 2, 504);
    if (world.hasSave) {
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('Saved progress found — press ENTER to continue ($' + world.saveCash + ', job ' + (world.saveMission + 1) + ' of ' + MISSIONS.length + ')', VIEW_W / 2, 556);
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
