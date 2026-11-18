// Drawing only: the world's state and the current screen in, pixels out.
// The 1280 x 720 logical view is scaled to fit the window; the camera
// follows the player and is clamped to the world. Flat shapes and canvas
// text — no image, font or audio files anywhere.
import {
  BEACH_X, OCEAN_X, PALETTE, ROADS_X, ROADS_Y, ROAD_W, VIEW, WALK_W, WORLD,
} from './config.js';
import { clamp } from './random.js';
import { districtAt } from './city.js';
import { currentMission, missionObjective } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'pause';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, bold) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- The city, in world coordinates ---

  function drawGround(world) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mown stripes, for a little texture on the grass.
    ctx.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < WORLD.height; y += 240) {
      ctx.fillRect(0, y, WORLD.width, 120);
    }
    // Park and plaza.
    const park = world.city.park;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = PALETTE.pond;
    ctx.beginPath();
    ctx.ellipse(world.city.pond.x, world.city.pond.y, world.city.pond.rx, world.city.pond.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    const plaza = world.city.plaza;
    ctx.fillStyle = PALETTE.plaza;
    ctx.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
    ctx.fillStyle = PALETTE.pond;
    circle(world.city.fountain.x, world.city.fountain.y, world.city.fountain.r);
    ctx.fillStyle = '#bfe6f5';
    circle(world.city.fountain.x, world.city.fountain.y, world.city.fountain.r - 12);
    // Beach sand, then ocean with animated wave lines.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(BEACH_X, 0, OCEAN_X - BEACH_X, WORLD.height);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(OCEAN_X, 0, WORLD.width - OCEAN_X, WORLD.height);
    ctx.fillStyle = PALETTE.oceanDeep;
    ctx.fillRect(OCEAN_X + 90, 0, WORLD.width - OCEAN_X - 90, WORLD.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i += 1) {
      const wy = ((i * 260 + world.time * 26) % WORLD.height);
      ctx.beginPath();
      for (let x = OCEAN_X; x <= WORLD.width; x += 40) {
        const y = wy + Math.sin(x / 90 + world.time * 1.4 + i) * 7;
        if (x === OCEAN_X) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawRoads() {
    for (const rx of ROADS_X) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - ROAD_W / 2 - WALK_W, 0, ROAD_W + WALK_W * 2, WORLD.height);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    }
    for (const ry of ROADS_Y) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, ry - ROAD_W / 2 - WALK_W, WORLD.width, ROAD_W + WALK_W * 2);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of ROADS_X) {
      for (let y = 20; y < WORLD.height; y += 64) ctx.fillRect(rx - 3, y, 6, 34);
    }
    for (const ry of ROADS_Y) {
      for (let x = 20; x < WORLD.width; x += 64) ctx.fillRect(x, ry - 3, 34, 6);
    }
  }

  function drawBuildings(world) {
    for (const b of world.city.buildings) {
      // Fake height: a dark side face dropped down-right, then the roof.
      ctx.fillStyle = PALETTE.buildingSide;
      ctx.fillRect(b.x + 7, b.y + b.height, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + 10, b.y + 10, Math.min(26, b.w - 20), 14);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w - 24, b.y + b.h - 24, 14, 14);
    }
  }

  function drawTrees(world) {
    for (const t of world.city.trees) {
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
      ctx.fillStyle = PALETTE.tree;
      circle(t.x, t.y - 4, t.size);
      ctx.fillStyle = PALETTE.treeLight;
      circle(t.x - 4, t.y - 8, t.size * 0.55);
    }
    for (const p of world.city.palms) {
      ctx.strokeStyle = '#7a5a35';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 10);
      ctx.quadraticCurveTo(p.x + 6, p.y - 6, p.x + 2, p.y - 18);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.palm;
      ctx.lineWidth = 4;
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x + 2, p.y - 18);
        ctx.lineTo(p.x + 2 + Math.cos(a) * p.size, p.y - 18 + Math.sin(a) * p.size * 0.6);
        ctx.stroke();
      }
    }
  }

  function drawMarker(world) {
    if (!world.marker) return;
    const m = world.marker;
    const pulse = 1 + Math.sin(world.time * 4) * 0.15;
    ctx.fillStyle = 'rgba(242,194,0,0.13)';
    ctx.fillRect(m.x - 26, 0, 52, WORLD.height);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f2c200';
    const s = 17 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#7a5f00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.strokeStyle = '#f2c200';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCar(car, world) {
    const { w, h } = car.model;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.fillStyle = car.color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#20262e';
    ctx.fillRect(-w / 2 + 9, -h / 2 + 3, 10, h - 6);
    ctx.fillRect(w / 2 - 17, -h / 2 + 3, 8, h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, 4, h - 4);
    if (car.model.name === 'taxi') {
      ctx.fillStyle = '#1d2126';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-w / 2 + 4 + i * 8, -2, 4, 4);
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(-6, -h / 2 - 3, 12, 5);
    }
    if (car.model.name === 'police') {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 5);
      ctx.fillRect(-w / 2 + 2, h / 2 - 7, w - 4, 5);
      const flash = Math.floor(world.time * 4) % 2 === 0 ? '#ff3b30' : '#2f7bff';
      ctx.fillStyle = flash;
      circle(0, -h / 2 + 1, 4);
      ctx.fillStyle = flash === '#ff3b30' ? '#2f7bff' : '#ff3b30';
      circle(0, h / 2 - 1, 4);
    }
    ctx.restore();
  }

  function drawPed(ped) {
    if (ped.state === 'down') {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.color;
      ctx.fillRect(-11, -4, 22, 8);
      ctx.fillStyle = '#e8b98a';
      circle(13, 0, 5);
      ctx.restore();
      return;
    }
    ctx.fillStyle = ped.color;
    circle(ped.x, ped.y, 8);
    ctx.fillStyle = '#e8b98a';
    circle(ped.x, ped.y - 2, 5);
    ctx.fillStyle = '#20262e';
    circle(ped.x + Math.cos(ped.angle) * 9, ped.y + Math.sin(ped.angle) * 9, 2);
  }

  function drawCop(cop) {
    if (cop.state === 'down') {
      ctx.fillStyle = '#1d3a6b';
      ctx.fillRect(cop.x - 11, cop.y - 4, 22, 8);
      return;
    }
    ctx.fillStyle = '#1d3a6b';
    circle(cop.x, cop.y, 9);
    ctx.fillStyle = '#e8b98a';
    circle(cop.x, cop.y - 2, 5);
    ctx.fillStyle = '#f2c200';
    circle(cop.x, cop.y + 4, 2);
  }

  function drawPlayer(world) {
    const p = world.player;
    if (p.car) return;
    // A white ring marks the player among the pedestrians.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d93a2b';
    circle(p.x, p.y, 11);
    ctx.fillStyle = '#e8b98a';
    circle(p.x, p.y - 2, 6);
    ctx.fillStyle = '#20262e';
    ctx.fillRect(p.x - 3, p.y - 12, 6, 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16);
    ctx.stroke();
  }

  // --- HUD, in screen coordinates ---

  function drawHud(world) {
    const p = world.player;
    const mission = currentMission(world);
    ctx.textBaseline = 'alphabetic';
    // Top-left: cash, mission, objective.
    text(`$${p.cash}`, 20, 42, 32, '#ffffff', 'left', true);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 0;
    text(mission ? mission.title : 'Free Roam', 20, 72, 20, '#f2c200', 'left', true);
    ctx.font = `16px ${FONT}`;
    const objLines = wrapText(ctx, missionObjective(world), 430);
    objLines.slice(0, 2).forEach((line, i) => text(line, 20, 96 + i * 20, 16, '#ffffff', 'left', false));
    if (world.missionIndex === 1 && world.missionStep === 1 && !world.missionFailed) {
      text(`TIME ${Math.max(0, Math.ceil(world.missionTimer))}s`, 20, 96 + objLines.slice(0, 2).length * 20, 20, '#ff5a4d', 'left', true);
    }
    if (world.missionFailed) {
      text('FAILED — press ENTER to retry', 20, 96 + objLines.slice(0, 2).length * 20, 18, '#ff5a4d', 'left', true);
    }
    // Top-right: wanted stars.
    for (let i = 0; i < 5; i += 1) {
      text(i < world.wanted ? '★' : '☆', 1260 - i * 30, 40, 28, i < world.wanted ? '#ffd94d' : 'rgba(255,255,255,0.55)', 'right', true);
    }
    drawMinimap(world);
    // Bottom-left: health bar.
    text('HEALTH', 20, 676, 14, '#ffffff', 'left', true);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(20, 684, 200, 16);
    ctx.fillStyle = p.health > 30 ? '#58c96b' : '#ff5a4d';
    ctx.fillRect(22, 686, Math.max(0, 196 * (p.health / 100)), 12);
    // Bottom-right: speedometer while driving.
    if (p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(`${mph}`, 1260, 686, 40, '#ffffff', 'right', true);
      text('mph', 1260, 706, 16, '#ffffff', 'right', false);
    } else {
      text('WASD move · SHIFT run · E enter car · F punch · P pause', 640, 706, 15, 'rgba(255,255,255,0.8)', 'center', false);
    }
    drawDialogue(world);
  }

  function drawMinimap(world) {
    const mx = VIEW.width - 220 - 16;
    const my = 56;
    const mw = 220;
    const mh = 165;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = '#2f7fc4';
    ctx.fillRect(mx + OCEAN_X * sx, my, (WORLD.width - OCEAN_X) * sx, mh);
    ctx.fillStyle = '#e8d39a';
    ctx.fillRect(mx + BEACH_X * sx, my, (OCEAN_X - BEACH_X) * sx, mh);
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = 2;
    for (const rx of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(mx + rx * sx, my);
      ctx.lineTo(mx + rx * sx, my + mh);
      ctx.stroke();
    }
    for (const ry of ROADS_Y) {
      ctx.beginPath();
      ctx.moveTo(mx, my + ry * sy);
      ctx.lineTo(mx + mw, my + ry * sy);
      ctx.stroke();
    }
    if (world.marker) {
      ctx.fillStyle = '#f2c200';
      ctx.save();
      ctx.translate(mx + world.marker.x * sx, my + world.marker.y * sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    for (const car of world.policeCars) {
      ctx.fillStyle = '#ff3b30';
      circle(mx + car.x * sx, my + car.y * sy, 3);
    }
    // The player arrow.
    const p = world.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(districtAt(p.x, p.y), mx + mw / 2, my + mh + 22, 16, '#ffffff', 'center', true);
  }

  function drawDialogue(world) {
    const d = world.dialogue;
    if (!d || !d.lines || d.lines.length === 0) return;
    const line = d.lines[d.index % d.lines.length];
    const boxW = 880;
    const boxX = (VIEW.width - boxW) / 2;
    const boxY = VIEW.height - 118;
    ctx.fillStyle = 'rgba(10,14,20,0.82)';
    ctx.fillRect(boxX, boxY, boxW, 64);
    ctx.strokeStyle = '#f2c200';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, 64);
    ctx.font = `15px ${FONT}`;
    const lines = wrapText(ctx, line, boxW - 32);
    lines.slice(0, 2).forEach((l, i) => text(l, boxX + 16, boxY + 26 + i * 20, 15, '#ffffff', 'left', false));
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text(title, VIEW.width / 2, 240, 72, accent || '#ffffff', 'center', true);
    lines.forEach((line, i) => text(line, VIEW.width / 2, 310 + i * 30, 20, '#e8e8e8', 'center', false));
    if (prompt) text(prompt, VIEW.width / 2, 310 + lines.length * 30 + 40, 24, '#f2c200', 'center', true);
  }

  // --- One frame ---

  function draw(world, screen) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const cam = world.camera;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawGround(world);
    drawRoads();
    drawBuildings(world);
    drawTrees(world);
    drawMarker(world);
    for (const car of world.cars) drawCar(car, world);
    for (const ped of world.peds) drawPed(ped);
    for (const cop of world.footCops) drawCop(cop);
    drawPlayer(world);
    ctx.restore();

    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(8,10,16,0.45)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      text('VICE SHORES', VIEW.width / 2, 190, 84, '#f2c200', 'center', true);
      text('Rico Vega is back in town — and Mama Lou has four jobs for him.', VIEW.width / 2, 240, 20, '#ffffff', 'center', false);
      text('Drive, steal, run, and get paid. The city is yours.', VIEW.width / 2, 270, 20, '#ffffff', 'center', false);
      text('WASD / arrows — move & drive · SHIFT — run · E — enter / exit car', VIEW.width / 2, 330, 18, '#e8e8e8', 'center', false);
      text('F — punch · P — pause · Lose the cops to drop your wanted level', VIEW.width / 2, 358, 18, '#e8e8e8', 'center', false);
      if (world.save) {
        text(`Saved game: $${world.save.cash} · job ${world.save.missionIndex + 1} of 4 — ENTER to continue`, VIEW.width / 2, 420, 20, '#7fd0ff', 'center', true);
      }
      text(world.save ? 'ENTER — continue  ·  N — new game' : 'Press ENTER to start', VIEW.width / 2, 470, 26, '#f2c200', 'center', true);
      return;
    }
    drawHud(world);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for you, Rico.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Vice Shores PD has you, Rico.', `Your cash is safe: $${world.player.cash}.`], 'Press ENTER to get back out there', '#5a9dff');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Rico Vega is down — but not out.', `Your cash is safe: $${world.player.cash}.`], 'Press ENTER to retry', '#ff5a4d');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
