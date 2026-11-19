// District standing, rewritten for v5.1: what each part of Vice Shores
// thinks of Rico, and — new in v5.1 — the job boards. Finishing jobs in
// a district raises its standing; committing crimes there lowers it.
// Standing is not a score to admire — it changes the game: better
// payouts and cheaper crew where you are liked, and a slower police
// response; the opposite where you are hated. Every district starts at
// zero and the scale runs from -100 (hated) to +100 (loved).
//
// The job boards are the v5.1 addition: once a district likes you
// (standing 20 or better), its notice board offers side jobs — small
// deliveries with a payout that scales with standing. Taking one starts
// a side job in the world (a pickup and a drop-off, timed); finishing it
// pays out and lifts the district's standing further. Side jobs are the
// way to grind a district from liked to loved without waiting for a
// story job to pass through it.
//
// Standing also drifts: left alone, a district slowly forgets Rico and
// its standing eases back toward zero, one point a minute. Fame fades.

import { CFG } from './config.js';
import { clamp, pick } from './random.js';

export const STANDING_DISTRICTS = [
  'Porto Verde', 'Old Town', 'Neon Mile', 'Marina Bay', 'Palm Court', 'Vice Beach',
];

// Standing tiers: a name and the flavour line for each band of the scale.
// The tier is what the district panel shows; the number is what the game
// uses.
export const STANDING_TIERS = [
  { min: 60, name: 'loved', mood: 'loves you' },
  { min: 20, name: 'liked', mood: 'likes you' },
  { min: -20, name: 'unknown', mood: 'does not know you yet' },
  { min: -60, name: 'distrusted', mood: 'distrusts you' },
  { min: -100, name: 'hated', mood: 'hates you' },
];

export function standingTier(standing) {
  for (const t of STANDING_TIERS) {
    if (standing >= t.min) return t;
  }
  return STANDING_TIERS[STANDING_TIERS.length - 1];
}

// A fresh standing table: every district at zero.
export function freshStanding() {
  const s = {};
  for (const d of STANDING_DISTRICTS) s[d] = 0;
  return s;
}

// Standing for a district name, or 0 for places with no standing (Ocean).
export function standingOf(world, district) {
  return (world.standing && world.standing[district]) || 0;
}

// Move a district's standing, clamped to the scale, and flash the change
// on the HUD so the player sees cause and effect.
export function changeStanding(world, district, delta) {
  if (!world.standing || !(district in world.standing)) return 0;
  const before = world.standing[district];
  const after = clamp(before + delta, -100, 100);
  world.standing[district] = after;
  if (after !== before) {
    world.standingFlash = { district, delta: after - before, until: world.time + 4 };
  }
  return after - before;
}

// Drift: every district eases one point toward zero every minute of play.
// Fame fades — a loved district needs upkeep, and a hated one forgives
// eventually. Called from stepWorld once a minute.
export function driftStanding(world) {
  if (!world.standing) return;
  for (const d of STANDING_DISTRICTS) {
    const s = world.standing[d];
    if (s > 0) world.standing[d] = s - 1;
    else if (s < 0) world.standing[d] = s + 1;
  }
}

// Job payouts scale with standing where the job pays out: loved districts
// pay up to half again, hated ones half.
export function payoutMultiplier(world, district) {
  return 1 + standingOf(world, district) / CFG.standingPayoutScale;
}

// Police response speed where the player is: liked districts are slow to
// call the cops (longer spawn gap, faster decay), hated ones are fast.
export function policeResponseFactor(world, district) {
  return 1 - standingOf(world, district) / CFG.standingPayoutScale;
}

// One-line summary of what standing does here, for the district panel.
export function standingSummary(world, district) {
  const s = standingOf(world, district);
  const pay = Math.round((payoutMultiplier(world, district) - 1) * 100);
  const resp = Math.round((1 - policeResponseFactor(world, district)) * 100);
  const tier = standingTier(s);
  return { standing: s, pay, resp, mood: tier.mood, tier: tier.name };
}

// ---------------------------------------------------------------- job boards

// Side jobs, two per district: a pickup point, a drop-off point, a time
// limit and a base payout. The board offers them once the district likes
// Rico (standing >= 20). The points are fixed landmarks so a side job
// always reads clearly on the map; the payout scales with standing.
const SIDE_JOBS = {
  'Old Town': [
    { name: 'Old Town Errand', reward: 180, from: { x: 600, y: 600 }, to: { x: 1000, y: 600 }, timed: 60, text: 'Old Town bank to the safehouse' },
    { name: 'Old Town Courier', reward: 220, from: { x: 1000, y: 200 }, to: { x: 600, y: 1000 }, timed: 70, text: 'North road to the Neon Mile club' },
  ],
  'Marina Bay': [
    { name: 'Dockside Drop', reward: 200, from: { x: 2600, y: 200 }, to: { x: 1800, y: 200 }, timed: 60, text: 'Marina docks to the east road' },
    { name: 'Marina Run', reward: 260, from: { x: 2200, y: 600 }, to: { x: 2600, y: 1000 }, timed: 70, text: 'East road to the marina flats' },
  ],
  'Neon Mile': [
    { name: 'Neon Delivery', reward: 190, from: { x: 600, y: 1000 }, to: { x: 1000, y: 1400 }, timed: 60, text: 'Neon Mile club to the garage' },
    { name: 'Neon Nights', reward: 240, from: { x: 1000, y: 1400 }, to: { x: 600, y: 1800 }, timed: 70, text: 'Garage to the Neon Mile plaza' },
  ],
  'Palm Court': [
    { name: 'Palm Court Parcel', reward: 200, from: { x: 1800, y: 1800 }, to: { x: 2200, y: 1800 }, timed: 60, text: 'Palm Court hotel to the east flats' },
    { name: 'Palm Court Dash', reward: 250, from: { x: 2200, y: 1800 }, to: { x: 1800, y: 2200 }, timed: 70, text: 'East flats to the south road' },
  ],
  'Porto Verde': [
    { name: 'Porto Verde Haul', reward: 210, from: { x: 2200, y: 2200 }, to: { x: 2600, y: 1800 }, timed: 60, text: 'Porto Verde corner to the east road' },
    { name: 'Porto Verde Loop', reward: 270, from: { x: 2600, y: 1800 }, to: { x: 2200, y: 2200 }, timed: 70, text: 'East road back to Porto Verde' },
  ],
  'Vice Beach': [
    { name: 'Beach Run', reward: 200, from: { x: 2900, y: 600 }, to: { x: 2900, y: 1800 }, timed: 60, text: 'North beach to the south beach' },
    { name: 'Beach Patrol', reward: 260, from: { x: 2900, y: 1800 }, to: { x: 2600, y: 1000 }, timed: 70, text: 'South beach to the marina flats' },
  ],
};

// The side jobs a district's board offers right now. Locked until the
// district likes Rico; the payout shown already includes the standing
// multiplier, so what you see is what you get.
export function boardJobs(world, district) {
  const list = SIDE_JOBS[district] || [];
  const open = standingOf(world, district) >= CFG.jobBoardStandingNeeded;
  return list.map((j) => ({
    ...j,
    open,
    payout: Math.round(j.reward * payoutMultiplier(world, district)),
  }));
}

// Start a side job from the board: pickup first, then the timed delivery.
// A story job takes priority — you cannot run a side job while Mama Lou
// has one open, and you cannot start a second side job mid-delivery.
export function startSideJob(world, district, index) {
  if (world.sideJob) return false;
  const jobs = boardJobs(world, district);
  const job = jobs[index];
  if (!job || !job.open) return false;
  world.sideJob = {
    name: job.name,
    district,
    reward: job.payout,
    from: job.from,
    to: job.to,
    timed: job.timed,
    step: 0, // 0 = go to pickup, 1 = deliver
    timer: 0,
    failed: false,
  };
  world.events.sidejob = true;
  return true;
}

// One tick of the side job: pickup, then the timed delivery, then payout.
// Returns nothing; the world reads world.sideJob to draw the objective.
export function updateSideJob(world, dt) {
  const job = world.sideJob;
  if (!job) return;
  const player = world.player;
  const here = player.inCar || player;
  if (job.failed) return;
  if (job.step === 1) {
    job.timer += dt;
    if (job.timer > job.timed) {
      job.failed = true;
      job.timer = 0;
      return;
    }
  }
  const target = job.step === 0 ? job.from : job.to;
  const d = Math.hypot(here.x - target.x, here.y - target.y);
  if (d > 70) return;
  if (job.step === 0) {
    job.step = 1;
    job.timer = 0;
    return;
  }
  // Delivered: pay out, lift the district's standing, clear the job.
  const payout = job.reward;
  world.player.cash += payout;
  world.events.cash = payout;
  changeStanding(world, job.district, CFG.sideJobStandingGain);
  world.sideJob = null;
}

// The side job's objective line for the HUD, or null.
export function sideJobObjective(world) {
  const job = world.sideJob;
  if (!job) return null;
  if (job.failed) return 'Side job failed — press ENTER to drop it.';
  if (job.step === 0) return `Side job: ${job.name} — pick up at the marker`;
  return `Side job: ${job.name} — deliver in ${Math.max(0, job.timed - job.timer).toFixed(0)}s`;
}

// The side job's marker in the world, or null.
export function sideJobMarker(world) {
  const job = world.sideJob;
  if (!job) return null;
  return job.step === 0 ? job.from : job.to;
}
