// City generation: road grid, blocks, buildings, beach, park, plaza, trees.
// Everything comes from one seeded RNG, so a seed always builds the same city.
// Buildings are never placed in the beach strip (x >= BEACH_X), the park or
// the plaza.

import {
  WORLD_W, WORLD_H, ROAD_XS, ROAD_YS, ROAD_W, SIDEWALK,
  BEACH_X, OCEAN_X, PARK, PLAZA, BUILDING_COLORS,
} from './config.js';
import { makeRng, clamp } from './random.js';

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const palms = [];

  // Block columns/rows: a block runs from one road's far sidewalk edge to
  // the next road's near sidewalk edge, so buildings never touch a road.
  const colEdges = [0, ...ROAD_XS.map((x) => x + ROAD_W / 2 + SIDEWALK)];
  const colEnds = [...ROAD_XS.map((x) => x - ROAD_W / 2 - SIDEWALK), BEACH_X];
  const rowEdges = [0, ...ROAD_YS.map((y) => y + ROAD_W / 2 + SIDEWALK)];
  const rowEnds = [...ROAD_YS.map((y) => y - ROAD_W / 2 - SIDEWALK), WORLD_H];

  for (let ci = 0; ci < colEdges.length; ci++) {
    for (let ri = 0; ri < rowEdges.length; ri++) {
      const bx = colEdges[ci];
      const by = rowEdges[ri];
      const bw = colEnds[ci] - bx;
      const bh = rowEnds[ri] - by;
      if (bw < 120 || bh < 120) continue;
      const block = { x: bx, y: by, w: bw, h: bh };
      // Park and plaza stay open: no buildings inside them.
      if (rectsOverlap(block, PARK) || rectsOverlap(block, PLAZA)) continue;
      // Some lots stay empty (yard / parking patch).
      if (rng.chance(0.1)) continue;
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const w = rng.range(100, Math.min(165, bw - 30));
        const h = rng.range(100, Math.min(165, bh - 30));
        const x = bx + rng.range(12, Math.max(13, bw - w - 12));
        const y = by + rng.range(12, Math.max(13, bh - h - 12));
        const b = { x, y, w, h, color: rng.pick(BUILDING_COLORS), vent: rng.chance(0.6) };
        // Keep buildings out of each other inside the block.
        if (buildings.some((o) => rectsOverlap(
          { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }, o))) continue;
        buildings.push(b);
      }
    }
  }

  // Scattered trees on grass: not on roads, buildings, beach or water.
  let tries = 0;
  while (trees.length < 90 && tries < 3000) {
    tries++;
    const x = rng.range(40, BEACH_X - 40);
    const y = rng.range(40, WORLD_H - 40);
    if (onRoad(x, y) || nearBuilding(x, y, buildings, 26)) continue;
    if (inRect(x, y, PARK) && rng.chance(0.4)) continue;
    trees.push({ x, y, r: rng.range(9, 15), shade: rng.pick(['#4e8f3e', '#5da24a', '#6cb254']) });
  }
  // Extra trees inside the park.
  for (let i = 0; i < 16; i++) {
    const x = PARK.x + rng.range(20, PARK.w - 20);
    const y = PARK.y + rng.range(20, PARK.h - 20);
    if (distToPond(x, y) < 70) continue;
    trees.push({ x, y, r: rng.range(10, 15), shade: '#5da24a' });
  }
  // Palms along the sand.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(BEACH_X + 24, OCEAN_X - 24);
    const y = rng.range(60, WORLD_H - 60);
    palms.push({ x, y, lean: rng.range(-0.35, 0.35) });
  }

  // Road graph: a node at every crossing, edges to adjacent crossings.
  const nodes = [];
  const nodeIndex = new Map();
  for (const y of ROAD_YS) {
    for (const x of ROAD_XS) {
      nodeIndex.set(`${x},${y}`, nodes.length);
      nodes.push({ x, y, neighbors: [] });
    }
  }
  const cols = ROAD_XS.length;
  const rows = ROAD_YS.length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) link(nodes, i, r * cols + c + 1);
      if (r + 1 < rows) link(nodes, i, (r + 1) * cols + c);
    }
  }

  return { seed, buildings, trees, palms, nodes, nodeIndex };
}

function link(nodes, a, b) {
  nodes[a].neighbors.push(b);
  nodes[b].neighbors.push(a);
}

export function distToPond(x, y) {
  const cx = PARK.x + PARK.w / 2;
  const cy = PARK.y + PARK.h / 2;
  return Math.hypot(x - cx, y - cy);
}

export function onRoad(x, y) {
  const half = ROAD_W / 2 + SIDEWALK;
  if (ROAD_XS.some((rx) => Math.abs(x - rx) <= half)) return true;
  if (ROAD_YS.some((ry) => Math.abs(y - ry) <= half)) return true;
  return false;
}

export function onRoadCentre(x, y) {
  const half = ROAD_W / 2;
  if (ROAD_XS.some((rx) => Math.abs(x - rx) <= half)) return true;
  if (ROAD_YS.some((ry) => Math.abs(y - ry) <= half)) return true;
  return false;
}

export function nearBuilding(x, y, buildings, pad) {
  return buildings.some((b) => (
    x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad
  ));
}

// Circle (x, y, radius) vs every building: push the circle out and report
// whether a hit happened. Used for the player on foot and for cars.
export function collideBuildings(city, x, y, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      x += dx * push;
      y += dy * push;
    } else {
      // Centre inside the building: push out along the smallest overlap.
      const left = x - b.x + radius;
      const right = b.x + b.w - x + radius;
      const top = y - b.y + radius;
      const bottom = b.y + b.h - y + radius;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - radius;
      else if (m === right) x = b.x + b.w + radius;
      else if (m === top) y = b.y - radius;
      else y = b.y + b.h + radius;
    }
  }
  return { x, y, hit };
}

export function inPark(x, y) { return inRect(x, y, PARK); }
export function inPlaza(x, y) { return inRect(x, y, PLAZA); }

export function districtAt(x, y, districts) {
  if (x >= OCEAN_X) return 'Ocean';
  if (x >= BEACH_X) return 'Vice Beach';
  for (const d of districts) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Vice Shores';
}

// A random point on a road centre line (for traffic spawns).
export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(ROAD_XS), y: rng.range(80, WORLD_H - 80) };
  }
  return { x: rng.range(80, BEACH_X - 80), y: rng.pick(ROAD_YS) };
}

// A random point on a sidewalk (for pedestrian targets).
export function randomSidewalkPoint(city, rng) {
  const vertical = rng.chance(0.5);
  const off = ROAD_W / 2 + SIDEWALK / 2 + rng.range(-8, 8);
  if (vertical) {
    const rx = rng.pick(ROAD_XS);
    return { x: rx + (rng.chance(0.5) ? off : -off), y: rng.range(80, WORLD_H - 80) };
  }
  const ry = rng.pick(ROAD_YS);
  return { x: rng.range(80, BEACH_X - 80), y: ry + (rng.chance(0.5) ? off : -off) };
}

export function nearestNode(city, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i++) {
    const n = city.nodes[i];
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
