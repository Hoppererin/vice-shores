// The city of Vice Shores, rewritten for v5.3: a fixed road grid, blocks
// of pastel buildings, a beach and ocean on the east edge, a park with a
// pond, a plaza with a fountain, and the road graph the traffic drives
// on. Everything is built from the world's seeded RNG, so a seed always
// builds the same city.
//
// v5.2 changes: the building slots in a block are shuffled with the
// seeded shuffle() helper now (the manual swap loop is gone), and there
// is a districtRect() helper — the minimap draws the turf tint and the
// lockdown ring over a district's rectangle, so the city hands it out.
// v5.3 adds districtCenter() and randomDistrictName(): the district
// events need a centre to gather around (the street-race crowd) and a
// way to pick a district that is not already mid-event.

import { CFG, NOTICE_BOARDS } from './config.js';
import { chance, clamp, mulberry32, pick, rand, randInt, shuffle } from './random.js';

// Build the whole city for a seed (or a ready rng stream). Returns the city
// object the world keeps.
export function buildCity(seed) {
  const stream = typeof seed === 'function' ? seed : mulberry32(typeof seed === 'number' ? seed : 7);
  const city = {
    seed,
    buildings: [],
    trees: [],
    palms: [],
    nodes: [],
    edges: [],
    blocks: 0,
    boards: NOTICE_BOARDS.map((b) => ({ ...b })),
  };

  buildRoadGraph(city);
  buildBlocks(city, stream);
  scatterTrees(city, stream);
  plantPalms(city, stream);
  return city;
}

// Intersections at every road crossing, edges between neighbours.
function buildRoadGraph(city) {
  const { roadXs, roadYs } = CFG;
  const index = new Map();
  for (const y of roadYs) {
    for (const x of roadXs) {
      const id = city.nodes.length;
      city.nodes.push({ id, x, y, links: [] });
      index.set(x + ',' + y, id);
    }
  }
  const link = (a, b) => {
    city.nodes[a].links.push(b);
    city.nodes[b].links.push(a);
    city.edges.push([a, b]);
  };
  for (let j = 0; j < roadYs.length; j++) {
    for (let i = 0; i < roadXs.length; i++) {
      const here = index.get(roadXs[i] + ',' + roadYs[j]);
      if (i + 1 < roadXs.length) link(here, index.get(roadXs[i + 1] + ',' + roadYs[j]));
      if (j + 1 < roadYs.length) link(here, index.get(roadXs[i] + ',' + roadYs[j + 1]));
    }
  }
}

// One block sits between four roads. Fill it with 1-4 buildings, or leave
// it an empty lot. The park and plaza blocks get their features instead.
function buildBlocks(city, rng) {
  const { roadXs, roadYs, walkHalf, park, plaza } = CFG;
  const roofColors = CFG.colors.buildingRoof;
  for (let j = 0; j < roadYs.length - 1; j++) {
    for (let i = 0; i < roadXs.length - 1; i++) {
      const x0 = roadXs[i] + walkHalf;
      const x1 = roadXs[i + 1] - walkHalf;
      const y0 = roadYs[j] + walkHalf;
      const y1 = roadYs[j + 1] - walkHalf;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      city.blocks++;
      if (Math.abs(cx - park.x) < 200 && Math.abs(cy - park.y) < 200) continue; // park
      if (Math.abs(cx - plaza.x) < 200 && Math.abs(cy - plaza.y) < 200) continue; // plaza
      if (chance(rng, 0.12)) continue; // empty lot: yard / parking patch
      const count = randInt(rng, 1, 4);
      // 2x2 sub-grid slots inside the block, shuffled by the stream so
      // the same seed always fills the same slots, in the same order.
      const slots = shuffle(rng, [
        [x0 + 8, y0 + 8], [x1 - 8, y0 + 8],
        [x0 + 8, y1 - 8], [x1 - 8, y1 - 8],
      ]);
      for (let n = 0; n < count; n++) {
        const [ax, ay] = slots[n];
        const w = rand(rng, 72, 108);
        const h = rand(rng, 72, 108);
        const bx = clamp(ax - w / 2, x0, x1 - w);
        const by = clamp(ay - h / 2, y0, y1 - h);
        city.buildings.push({
          x: bx, y: by, w, h,
          color: pick(rng, roofColors),
          lift: randInt(rng, 9, 17), // fake-height drop, down-right
          ventX: rand(rng, 0.2, 0.6),
          ventY: rand(rng, 0.2, 0.6),
        });
      }
    }
  }
}

// About ninety ordinary trees on grass, never on a road or in a building.
function scatterTrees(city, rng) {
  let placed = 0;
  let guard = 0;
  while (placed < 90 && guard++ < 3000) {
    const x = rand(rng, 60, CFG.sandX - 60);
    const y = rand(rng, 60, CFG.worldH - 60);
    if (onRoad(x, y)) continue;
    if (insideBuilding(city, x, y, 20)) continue;
    if (nearParkOrPlaza(x, y, 30)) continue;
    city.trees.push({ x, y, r: rand(rng, 9, 15), shade: rand(rng, 0, 1) });
    placed++;
  }
  // A ring of trees around the park pond.
  for (let n = 0; n < 14; n++) {
    const a = (n / 14) * Math.PI * 2 + rand(rng, -0.2, 0.2);
    const r = rand(rng, 95, 150);
    city.trees.push({
      x: CFG.park.x + Math.cos(a) * r,
      y: CFG.park.y + Math.sin(a) * r,
      r: rand(rng, 10, 15), shade: rand(rng, 0, 1),
    });
  }
}

// Palm trees in a line down the sand strip.
function plantPalms(city, rng) {
  for (let y = 120; y < CFG.worldH - 80; y += rand(rng, 130, 220)) {
    city.palms.push({ x: rand(rng, 2860, 2990), y, r: rand(rng, 11, 15) });
  }
}

// Is a point on asphalt (within the road bands)?
export function onRoad(x, y) {
  const { roadXs, roadYs, roadHalf } = CFG;
  for (const rx of roadXs) if (Math.abs(x - rx) <= roadHalf) return true;
  for (const ry of roadYs) if (Math.abs(y - ry) <= roadHalf) return true;
  return false;
}

// Is a point inside a building (with a margin)?
export function insideBuilding(city, x, y, margin = 0) {
  for (const b of city.buildings) {
    if (x > b.x - margin && x < b.x + b.w + margin &&
        y > b.y - margin && y < b.y + b.h + margin) return true;
  }
  return false;
}

function nearParkOrPlaza(x, y, margin) {
  const { park, plaza } = CFG;
  const inRect = (r) => x > r.x - r.w / 2 - margin && x < r.x + r.w / 2 + margin &&
    y > r.y - r.h / 2 - margin && y < r.y + r.h / 2 + margin;
  return inRect(park) || inRect(plaza);
}

// Push a circle out of every building it overlaps. Returns true on contact.
export function collideBuildings(city, body, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(body.x, b.x, b.x + b.w);
    const cy = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * radius;
      body.y = cy + (dy / d) * radius;
    } else {
      // Dead centre: shove out along the smallest penetration axis.
      const left = body.x - b.x + radius;
      const right = b.x + b.w - body.x + radius;
      const top = body.y - b.y + radius;
      const bottom = b.y + b.h - body.y + radius;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - radius;
      else if (m === right) body.x = b.x + b.w + radius;
      else if (m === top) body.y = b.y - radius;
      else body.y = b.y + b.h + radius;
    }
  }
  return hit;
}

// A random point on the asphalt, biased to intersections.
export function randomRoadPoint(rng, city) {
  const node = pick(rng, city.nodes);
  return { x: node.x + rand(rng, -20, 20), y: node.y + rand(rng, -20, 20) };
}

// A random point on a sidewalk: beside a road, just off the asphalt.
export function randomSidewalkPoint(rng, city) {
  const vertical = chance(rng, 0.5);
  if (vertical) {
    const rx = pick(rng, CFG.roadXs);
    const side = chance(rng, 0.5) ? 1 : -1;
    return {
      x: rx + side * (CFG.roadHalf + 13),
      y: rand(rng, 80, CFG.worldH - 80),
    };
  }
  const ry = pick(rng, CFG.roadYs);
  const side = chance(rng, 0.5) ? 1 : -1;
  return {
    x: rand(rng, 80, CFG.sandX - 80),
    y: ry + side * (CFG.roadHalf + 13),
  };
}

// District name for a world position.
export function districtAt(x, y) {
  for (const d of CFG.districts) {
    if (d.test(x, y)) return d.name;
  }
  return 'Vice Shores';
}

// The rectangle of a district on the map, or null for places with no
// rectangle (Ocean is the whole east edge, drawn as its own strip).
// The minimap uses this for the turf tint and the lockdown ring.
export function districtRect(name) {
  return CFG.districtRects[name] || null;
}

// The centre of a district, for district events: the street-race crowd
// gathers near it, and the event banner names the district around it.
// Falls back to the middle of the map for places with no centre.
export function districtCenter(name) {
  const c = CFG.districtCentres[name];
  if (c) return { x: c.x, y: c.y };
  return { x: CFG.worldW / 2, y: CFG.worldH / 2 };
}

// A random district name from the six standing districts, excluding any
// in the skip list. The district-event scheduler uses this so an event
// never lands on a district that is already mid-event.
export function randomDistrictName(rng, skip = []) {
  const names = ['Porto Verde', 'Old Town', 'Neon Mile', 'Marina Bay', 'Palm Court', 'Vice Beach'];
  const open = names.filter((n) => !skip.includes(n));
  if (!open.length) return null;
  return pick(rng, open);
}

// The notice board of a district, or null. The job board panel opens for
// the district the player is standing in; the board in the world is the
// sign that marks the spot.
export function noticeBoardAt(city, district) {
  return city.boards.find((b) => b.district === district) || null;
}

// Nearest road-graph node to a point.
export function nearestNode(city, x, y) {
  let best = city.nodes[0];
  let bestD = Infinity;
  for (const n of city.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// The nearest road line to a point: the road's centre and its direction
// (0 for an east-west road, PI/2 for a north-south one), plus how far the
// point is from the line. Dispatch uses this to drop roadblocks on the
// road the player is travelling, not in a block or a yard.
export function nearestRoad(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of CFG.roadXs) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 120, CFG.worldH - 120), angle: Math.PI / 2 }; }
  }
  for (const ry of CFG.roadYs) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 120, CFG.sandX - 120), y: ry, angle: 0 }; }
  }
  return { ...best, dist: bestD };
}
