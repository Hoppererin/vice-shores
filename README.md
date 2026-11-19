# Vice Shores

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Hoppererin/vice-shores/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Hoppererin/vice-shores/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in the spirit of GTA 6: drive, steal cars, dodge the Vice Shores PD, and run twelve jobs for Mama Lou across a living coastal city — all playable offline in a desktop browser from static files.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080. WASD / arrows to move and drive, SHIFT to run, E to enter or exit a car, F to punch, P to pause. Progress saves to your browser automatically.

## The game

You are Rico Vega, a driver-for-hire back in Vice Shores. The city is a 3200×2400 open world with a road grid, traffic, pedestrians, a beach and ocean, a park and a plaza, six districts, and a wanted system that brings the police after you — patrol cars, foot cops, and at high heat, police dispatch roadblocks and helicopter spotlights.

Twelve jobs from Mama Lou: a first fare in a yellow taxi, a timed package run from the Marina docks, a getaway where you start with two wanted stars, a final job stealing a white sports car — plus a silent run past a police roadblock, a four-stop long con across the city, a clean getaway that starts hot with a fixer on call, a five-stop finale across Vice Shores, a wheelman run in a stolen sports car against a 120-second clock, a turf war through hostile Old Town, a scanner job that runs three spike strips with the police scanner live, and a blackout finale through Neon Mile with a stakeout waiting at the garage. Finish all twelve and the city is yours in free roam.

### New in v5.3

- **The wanted heat meter** — a thin bar under the wanted stars, 0–100, that lives between jobs: every crime pours heat in (+14 per star, +6 per crime), and it only fades with quiet driving. While the heat is high (55+) dispatch sends an extra roadblock, the police respond faster, and the heat decays slower — so a hot player stays hot.
- **The police scanner** — at 3+ wanted stars the scanner goes live: the nearest roadblock is ringed on the minimap and read out on the HUD with its distance and compass bearing ("SCANNER: roadblock 320m NE — spike"), with a sonar ping when it first comes up. A blackout in your district kills the scanner until the lights come back.
- **Ivy the Spotter, a sixth crew member** — once Ivy the Lookout is hired, press 6 in the crew panel to promote her to Spotter for $500: every police car and every roadblock is marked live on the minimap, with a gold chime when the promotion lands. The fixer's launder now cools the heat meter too.
- **District events** — every minute and a half or so, a district lights up with a timed event: a street race (payouts +50%, more traffic, faster spawns), a police raid (fewer spawns, faster heat decay, payouts +25%), or a blackout (fewer spawns, helicopters grounded, scanner dark). The event shows as a banner on the HUD and a tint on the minimap, and the job boards pay its bonus too.
- **Stakeout police** — at 4+ wanted stars, dispatch sometimes parks a dark, lights-off car at a job's destination and waits: drive within 260px and the ambush trips, the car comes alive at 640 speed with a double-beep alert. The Scanner Job and the Blackout finale both put a stakeout on the route on purpose.
- **Two new story jobs** — job 11, The Scanner Job ($1,800): a 120-second delivery through three scripted spike strips with the scanner live and a halfway checkpoint. Job 12, The Blackout ($3,000): a five-stop finale through a blackout in Neon Mile with a stakeout at the garage. Twelve jobs in all.
- **A better chase, drive and start** — the screenshot scenes are staged clean now: the chase corridor is cleared in chunks so no traffic car can wander into it mid-run (the v5.2 shot ran at 25 mph after hitting traffic), the roadblock is placed after the run so the chase never ends in the bar, the drive's overtake is clean, and the title screen's traffic is de-stacked so no three cars sit on one intersection.

### From v5.2

- **Dante the Wheelman, a fifth crew member** — press C to hire him, then press X once per job and a fresh black getaway car appears on the road ahead of you: climb straight in, your old car left behind, tyres fresh and the fastest engine in the city under you. He also makes every car +8% faster just by being on the crew.
- **The turf war** — a district flips when its standing crosses +60 (home turf: side jobs pay a bonus, police are slow to respond) or -60 (hostile: more police, faster, and its job board locks shut). A flip is announced with a flash and a line from Mama Lou. The Turf War finale turns Old Town hostile as the job starts, so the last leg runs through a district that hates you.
- **The five-star lockdown** — at five wanted stars the district you are in locks down: extra roadblocks, a second helicopter (Air-2) joining Air-1 from the other side, and a pulsing red ring around the district on the minimap. At five stars the police also stop trying to catch you and start trying to hit you — faster pursuit, harder rams.
- **Rolling roadblocks** — from four stars, dispatch sometimes sends two police cars driving side by side ahead of you, blocking the lane while moving. Go around on the sidewalk, or brake and let them pull away; once you pass them they break off and join the chase.
- **Police that dodge their own roadblocks** — chasing police cars now steer around the end of a barrier bar instead of grinding against their own side's cordon and stalling the chase.
- **A clearer chase shot** — the ROADBLOCK label now draws below the bar when the bar sits near the bottom of the screen, clear of Mama Lou's dialogue box; and a timed step's checkpoint is named on the HUD so you know where the extra seconds are.

### From v5.1

- **Sal the Fixer, a fourth crew member** — press C to hire him, then press G once per job to launder two wanted stars away. He also slows police response and makes the heat decay faster while he is on the crew.
- **District job boards** — press B (or find a wooden JOBS sign) to open the board for the district you are standing in. Once a district likes you (+20 standing), its board offers two timed side jobs with their own payouts and standing rewards.
- **Spike strips and flares** — from four wanted stars, dispatch sometimes lays a spike strip instead of a barrier: cross it fast and your tyres are gone for twenty seconds. Every roadblock burns an orange flare so you can see it coming.
- **The PIT manoeuvre** — at four stars and up, a police car that pulls alongside your rear quarter steers into it and spins you out. Police cars also chase where you are going, not where you are.
- **A better chase** — the helicopter hovers offset up-left now, so its spotlight beam crosses the frame instead of sitting on top of the police cars; the roadblock bar lies across the road the way its collision always did; pedestrians keep to the sidewalks while the heat is on; and the timed Silent Partner job gives you 75 seconds with a halfway checkpoint.

### From v5

- **Police dispatch** — at 3+ wanted stars, dispatch sets roadblocks on the roads ahead of you; at 4+ stars a helicopter pins you with a spotlight and stops the heat from decaying. Listen to the radio line on the HUD.
- **Crew** — press C to hire specialists: Mara the Driver (faster cars, sharper steering), Zero the Hacker (press H once per job to jam dispatch for 20 seconds), and Ivy the Lookout (police and roadblocks marked on the minimap). Hired crew walk with you in free roam.
- **District standing** — press V to see what each district thinks of you. Finishing jobs raises standing (better payouts, cheaper crew, slower police response); committing crimes lowers it. Your standing shows as a bar under the minimap, and it drifts slowly back toward zero.

Everything is original and self-contained: vanilla canvas rendering, synthesized WebAudio sound, no image, font or audio files, and no network requests.

## Built with

Built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) by an AI agent. Referral code: `dhj53q2r`.
