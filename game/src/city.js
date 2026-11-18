// The city of Vice Shores: a fixed road grid, the blocks between the roads,
// the beach and ocean on the east edge, a park and a plaza, and the road
// graph traffic drives on. Everything comes from one seeded RNG, so a seed
// always builds the same city.
import {
  BEACH_X, DISTRICTS, OCEAN_X, PALETTE, PARK, PLAZA, ROADS_X, ROADS_Y, ROAD_W, WALK_W, WORLD,
} from './config.js';
import { clamp, dist } from './random.js';

const HALF_ROAD = ROAD_W / 2;

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function onRoadStrip(x, y, margin) {
  for (const rx of ROADS_X) {
    if (Math.abs(x - rx) < HALF_ROAD + WALK_W + margin) return true;
  }
  for (const ry of ROADS_Y) {
    if (Math.abs(y - ry) < HALF_ROAD + WALK_W + margin) return true;
  }
  return false;
}

function buildRoadGraph() {
  const nodes = [];
  for (let row = 0; row < ROADS_Y.length; row += 1) {
    for (let col = 0; col < ROADS_X.length; col += 1) {
      nodes.push({ x: ROADS_X[col], y: ROADS_Y[row], neighbors: [] });
    }
  }
  const cols = ROADS_X.length;
  const index = (row, col) => row * cols + col;
  for (let row = 0; row < ROADS_Y.length; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const here = index(row, col);
      if (col > 0) nodes[here].neighbors.push(index(row, col - 1));
      if (col < cols - 1) nodes[here].neighbors.push(index(row, col + 1));
      if (row > 0) nodes[here].neighbors.push(index(row - 1, col));
      if (row < ROADS_Y.length - 1) nodes[here].neighbors.push(index(row + 1, col));
    }
  }
  return nodes;
}

function buildBuildings(rng) {
  const buildings = [];
  const keepOut = [
    { x: PARK.x - 20, y: PARK.y - 20, w: PARK.w + 40, h: PARK.h + 40 },
    { x: PLAZA.x - 20, y: PLAZA.y - 20, w: PLAZA.w + 40, h: PLAZA.h + 40 },
  ];
  const edgeX = [WALK_W, ...ROADS_X.map((x) => x + HALF_ROAD + WALK_W)];
  const edgeY = [WALK_W, ...ROADS_Y.map((y) => y + HALF_ROAD + WALK_W)];
  const farX = [...ROADS_X.map((x) => x - HALF_ROAD - WALK_W), BEACH_X - WALK_W];
  const farY = [...ROADS_Y.map((y) => y - HALF_ROAD - WALK_W), WORLD.height - WALK_W];
  for (let col = 0; col < ROADS_X.length; col += 1) {
    for (let row = 0; row < ROADS_Y.length; row += 1) {
      const bx0 = edgeX[col];
      const bx1 = farX[col];
      const by0 = edgeY[row];
      const by1 = farY[row];
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 90 || bh < 90) continue;
      // Split a big block into up to four lots; small blocks get one or two.
      const cols2 = bw > 230 ? 2 : 1;
      const rows2 = bh > 230 ? 2 : 1;
      for (let sx = 0; sx < cols2; sx += 1) {
        for (let sy = 0; sy < rows2; sy += 1) {
          if (rng.chance(0.22)) continue; // empty lot: yard or parking patch
          const lotW = bw / cols2;
          const lotH = bh / rows2;
          const w = Math.round(rng.range(70, Math.max(80, lotW - 24)));
          const h = Math.round(rng.range(70, Math.max(80, lotH - 24)));
          const x = Math.round(bx0 + sx * lotW + rng.range(8, Math.max(9, lotW - w - 8)));
          const y = Math.round(by0 + sy * lotH + rng.range(8, Math.max(9, lotH - h - 8)));
          const building = {
            x, y, w, h,
            color: rng.pick(PALETTE.roofs),
            height: rng.int(10, 26),
          };
          if (keepOut.some((zone) => rectsOverlap(building, zone))) continue;
          if (building.x + building.w > BEACH_X) continue;
          buildings.push(building);
        }
      }
    }
  }
  return buildings;
}

function buildTrees(rng, buildings) {
  const trees = [];
  const palms = [];
  let guard = 0;
  while (trees.length < 90 && guard < 900) {
    guard += 1;
    const x = rng.range(40, BEACH_X - 40);
    const y = rng.range(40, WORLD.height - 40);
    if (onRoadStrip(x, y, 4)) continue;
    if (buildings.some((b) => x > b.x - 14 && x < b.x + b.w + 14 && y > b.y - 14 && y < b.y + b.h + 14)) continue;
    trees.push({ x: Math.round(x), y: Math.round(y), size: rng.range(13, 20) });
  }
  // Park trees, kept out of the pond.
  for (let i = 0; i < 12; i += 1) {
    const x = PARK.x + rng.range(20, PARK.w - 20);
    const y = PARK.y + rng.range(20, PARK.h - 20);
    if (dist(x, y, PARK.x + PARK.w / 2, PARK.y + PARK.h / 2) < 90) continue;
    trees.push({ x: Math.round(x), y: Math.round(y), size: rng.range(14, 20) });
  }
  // Palms marching down the sand.
  for (let y = 120; y < WORLD.height - 80; y += rng.range(90, 150)) {
    palms.push({ x: Math.round(rng.range(2865, 2995)), y: Math.round(y), size: rng.range(15, 21) });
  }
  return { trees, palms };
}

export function generateCity(rng) {
  const nodes = buildRoadGraph();
  const buildings = buildBuildings(rng);
  const { trees, palms } = buildTrees(rng, buildings);
  return {
    nodes, buildings, trees, palms,
    park: PARK,
    plaza: PLAZA,
    pond: { x: PARK.x + PARK.w / 2, y: PARK.y + PARK.h / 2, rx: 72, ry: 50 },
    fountain: { x: PLAZA.x + PLAZA.w / 2, y: PLAZA.y + PLAZA.h / 2, r: 42 },
  };
}

// Push a circle out of every building it overlaps. Returns true on a hit.
export function collideBuildings(city, body, radius) {
  let hit = false;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const b of city.buildings) {
      const nearX = clamp(body.x, b.x, b.x + b.w);
      const nearY = clamp(body.y, b.y, b.y + b.h);
      const dx = body.x - nearX;
      const dy = body.y - nearY;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = nearX + (dx / d) * radius;
        body.y = nearY + (dy / d) * radius;
      } else {
        // Centre inside the rect: shove out along the shallowest side.
        const left = body.x - b.x + radius;
        const right = b.x + b.w - body.x + radius;
        const top = body.y - b.y + radius;
        const bottom = b.y + b.h - body.y + radius;
        const min = Math.min(left, right, top, bottom);
        if (min === left) body.x = b.x - radius;
        else if (min === right) body.x = b.x + b.w + radius;
        else if (min === top) body.y = b.y - radius;
        else body.y = b.y + b.h + radius;
      }
    }
  }
  return hit;
}

export function nearestNode(city, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i += 1) {
    const d = (city.nodes[i].x - x) ** 2 + (city.nodes[i].y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// A random point on a road centre line.
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(ROADS_X), y: rng.range(60, WORLD.height - 60) };
  }
  return { x: rng.range(60, BEACH_X - 60), y: rng.pick(ROADS_Y) };
}

// A random point on a sidewalk, just off a road.
export function randomSidewalkPoint(rng) {
  if (rng.chance(0.5)) {
    const side = rng.chance(0.5) ? 1 : -1;
    return {
      x: rng.pick(ROADS_X) + side * (HALF_ROAD + WALK_W / 2),
      y: rng.range(60, WORLD.height - 60),
    };
  }
  const side = rng.chance(0.5) ? 1 : -1;
  return {
    x: rng.range(60, BEACH_X - 60),
    y: rng.pick(ROADS_Y) + side * (HALF_ROAD + WALK_W / 2),
  };
}

export function districtAt(x, y) {
  if (x >= OCEAN_X) return 'Ocean';
  if (x >= BEACH_X) return 'Vice Beach';
  for (const zone of DISTRICTS) {
    if (x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h) return zone.name;
  }
  return 'Vice Shores';
}
