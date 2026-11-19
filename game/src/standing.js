// District standing, rewritten for v5.3: what each part of Vice Shores
// thinks of Rico — the turf war, and now, district events. Finishing
// jobs in a district raises its standing; committing crimes there lowers
// it. Standing is not a score to admire — it changes the game: better
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
// The turf war is the v5.2 addition: a district's standing can cross a
// line and flip its turf. At +60 or better the district is HOME TURF —
// its side jobs pay a bonus, the police are slow to respond, and the
// district shows green on the map. At -60 or worse the district is
// HOSTILE — the police send more cars, faster, with an extra foot cop,
// and its job board locks shut until you win the district back. A flip
// is announced with a flash and a line from Mama Lou, because a district
// turning on you is the kind of thing you want to know about.
//
// District events are the v5.3 addition: every minute or two, a district
// lights up with an event — a STREET RACE, a POLICE RAID or a BLACKOUT —
// for a minute or so, and the whole district plays differently while it
// lasts. A race pays 50% more in its district while the police are busy
// watching it; a raid sends police much faster and holds the heat longer
// but pays 25% more for the risk; a blackout grounds the helicopters and
// the scanner and slows the police down, and the traffic crawls in the
// dark. An event is announced with a banner and a line from Mama Lou,
// and the minimap tints the district while it runs. Events are scheduled
// from the world's seeded RNG, so a seed always runs the same events.
//
// Standing also drifts: left alone, a district slowly forgets Rico and
// its standing eases back toward zero, one point a minute. Fame fades —
// and so does hate, eventually.

import { CFG } from './config.js';
import { clamp, pick, rand, weightedPick } from './random.js';
import { randomDistrictName } from './city.js';
import { say } from './missions.js';

export const STANDING_DISTRICTS = [
  'Porto Verde', 'Old Town', 'Neon Mile', 'Marina Bay', 'Palm Court', 'Vice Beach',
];

// The three district-event kinds, with their flavour lines and the
// weights the scheduler rolls over: races are common, raids less so,
// blackouts the rarest — the dark is a gift, and gifts are scarce.
export const EVENT_KINDS = [
  { type: 'race', weight: 5, label: 'STREET RACE', line: 'Street race in {d} — the crowd is out and the payouts are fat. Police are busy watching.' },
  { type: 'raid', weight: 3, label: 'POLICE RAID', line: 'Police raid in {d} — the PD is thick on those streets. Risky, but the money is better.' },
  { type: 'blackout', weight: 2, label: 'BLACKOUT', line: 'Blackout in {d} — the lights are out, the helicopters are grounded, and nobody can see a thing.' },
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

// ---------------------------------------------------------------- turf war

// A district's turf: 'home' at +60 or better, 'hostile' at -60 or worse,
// 'neutral' in between. Turf is derived from standing, never stored —
// the save only carries the standing numbers, and the turf follows.
export function turfOf(world, district) {
  const s = standingOf(world, district);
  if (s >= CFG.turfLoved) return 'home';
  if (s <= CFG.turfHated) return 'hostile';
  return 'neutral';
}

// One-line turf label for the HUD and the district panel.
export function turfLabel(turf) {
  if (turf === 'home') return 'HOME TURF';
  if (turf === 'hostile') return 'HOSTILE';
  return 'neutral';
}

// The side-job payout multiplier for a district's turf: home turf pays
// a bonus on top of the standing multiplier.
export function turfPayoutMultiplier(world, district) {
  return turfOf(world, district) === 'home' ? 1 + CFG.turfPayoutBonus : 1;
}

// ---------------------------------------------------------------- district events

// The event kind's definition, or null.
export function eventKind(type) {
  return EVENT_KINDS.find((k) => k.type === type) || null;
}

// The payout multiplier an event adds in its district: a race pays half
// again, a raid a quarter more, a blackout nothing extra — the dark is
// its own reward.
export function eventPayoutMultiplier(world, district) {
  const ev = world.districtEvent;
  if (!ev || ev.district !== district) return 1;
  if (ev.type === 'race') return 1 + CFG.eventRacePayout;
  if (ev.type === 'raid') return 1 + CFG.eventRaidPayout;
  return 1;
}

// Start a district event right now (the scheduler calls this, and a
// story job can force one as a set piece). district is a name, type is
// 'race' | 'raid' | 'blackout', duration in seconds. Announces itself.
export function startDistrictEvent(world, district, type, duration) {
  const kind = eventKind(type);
  if (!kind || !district) return false;
  const dur = duration || rand(world.rng, CFG.eventDurationMin, CFG.eventDurationMax);
  world.districtEvent = { district, type, until: world.time + dur };
  world.eventFlash = { district, type, until: world.time + 6 };
  say(world, 'Mama Lou: ' + kind.line.replace('{d}', district));
  world.events.districtEvent = true;
  return true;
}

// Schedule the next event: pick a district that is not already mid-event
// and roll a weighted kind. The gap is 90-150 seconds of play.
export function scheduleNextEvent(world) {
  world.nextEventAt = world.time + rand(world.rng, CFG.eventGapMin, CFG.eventGapMax);
}

// One tick of the district events: end the one running when its time is
// up, start the next when its time comes. Called from stepWorld.
export function updateDistrictEvents(world, dt) {
  const ev = world.districtEvent;
  if (ev) {
    if (world.time >= ev.until) {
      world.districtEvent = null;
      say(world, `Mama Lou: The ${eventKind(ev.type).label.toLowerCase()} in ${ev.district} is over. Back to business.`);
      scheduleNextEvent(world);
    }
    return;
  }
  if (world.nextEventAt === undefined || world.nextEventAt === null) {
    scheduleNextEvent(world);
    return;
  }
  if (world.time < world.nextEventAt) return;
  const district = randomDistrictName(world.rng);
  if (!district) { scheduleNextEvent(world); return; }
  const type = weightedPick(world.rng, EVENT_KINDS.map((k) => [k.type, k.weight]));
  startDistrictEvent(world, district, type);
}

// Is a district mid-event right now, and of which kind? Returns the
// event object, or null.
export function eventIn(world, district) {
  const ev = world.districtEvent;
  return ev && ev.district === district ? ev : null;
}

// ---------------------------------------------------------------- standing

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
// on the HUD so the player sees cause and effect. If the move flips the
// district's turf — home or hostile — that is announced too, because a
// district turning is a game-changer, not a footnote.
export function changeStanding(world, district, delta) {
  if (!world.standing || !(district in world.standing)) return 0;
  const before = world.standing[district];
  const turfBefore = before >= CFG.turfLoved ? 'home' : before <= CFG.turfHated ? 'hostile' : 'neutral';
  const after = clamp(before + delta, -100, 100);
  world.standing[district] = after;
  if (after !== before) {
    world.standingFlash = { district, delta: after - before, until: world.time + 4 };
    const turfAfter = after >= CFG.turfLoved ? 'home' : after <= CFG.turfHated ? 'hostile' : 'neutral';
    if (turfAfter !== turfBefore) {
      world.turfFlash = { district, turf: turfAfter, until: world.time + 6 };
      if (turfAfter === 'home') {
        say(world, `Mama Lou: ${district} is your turf now, Rico. They will look after their own.`);
      } else if (turfAfter === 'hostile') {
        say(world, `Mama Lou: ${district} has turned on you, Rico. Watch your back there.`);
      } else if (turfBefore === 'hostile') {
        say(world, `Mama Lou: ${district} is cooling off. Give it time and they will come around.`);
      }
      world.events.turf = true;
    }
  }
  return after - before;
}

// Set a district's standing directly (a story job can turn a district
// hostile as a set piece). Goes through the same turf-flip announcement
// as a normal change, so the player is never surprised by a flip.
export function setStanding(world, district, value) {
  if (!world.standing || !(district in world.standing)) return 0;
  return changeStanding(world, district, clamp(value, -100, 100) - world.standing[district]);
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
// pay up to half again, hated ones half — and a district event stacks on
// top: a race pays half again, a raid a quarter more.
export function payoutMultiplier(world, district) {
  return (1 + standingOf(world, district) / CFG.standingPayoutScale) *
    eventPayoutMultiplier(world, district);
}

// Police response speed where the player is: liked districts are slow to
// call the cops (longer spawn gap, faster decay), hated ones are fast.
// A hostile district is faster still — the locals call the PD on you.
export function policeResponseFactor(world, district) {
  let f = 1 - standingOf(world, district) / CFG.standingPayoutScale;
  if (turfOf(world, district) === 'hostile') f *= CFG.hostileSpawnFactor;
  return f;
}

// One-line summary of what standing does here, for the district panel.
export function standingSummary(world, district) {
  const s = standingOf(world, district);
  const pay = Math.round((payoutMultiplier(world, district) - 1) * 100);
  const resp = Math.round((1 - policeResponseFactor(world, district)) * 100);
  const tier = standingTier(s);
  return {
    standing: s, pay, resp, mood: tier.mood, tier: tier.name,
    turf: turfOf(world, district),
  };
}

// ---------------------------------------------------------------- job boards

// Side jobs, two per district: a pickup point, a drop-off point, a time
// limit and a base payout. The board offers them once the district likes
// Rico (standing >= 20). The points are fixed landmarks so a side job
// always reads clearly on the map; the payout scales with standing —
// and with the turf bonus on home turf. A hostile district's board is
// locked shut, whatever its standing used to be.
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
// district likes Rico, and locked again if the district turns hostile —
// a hostile board is closed to you, whatever it used to offer. The
// payout shown already includes the standing multiplier, the home turf
// bonus and any district event, so what you see is what you get.
export function boardJobs(world, district) {
  const list = SIDE_JOBS[district] || [];
  const hostile = turfOf(world, district) === 'hostile';
  const open = !hostile && standingOf(world, district) >= CFG.jobBoardStandingNeeded;
  return list.map((j) => ({
    ...j,
    open,
    hostile,
    payout: Math.round(j.reward * payoutMultiplier(world, district) * turfPayoutMultiplier(world, district)),
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
