# Vice Shores

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Hoppererin/vice-shores/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Hoppererin/vice-shores/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in the spirit of GTA 6: drive, steal cars, dodge the Vice Shores PD, and run eight jobs for Mama Lou across a living coastal city — all playable offline in a desktop browser from static files.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080. WASD / arrows to move and drive, SHIFT to run, E to enter or exit a car, F to punch, P to pause. Progress saves to your browser automatically.

## The game

You are Rico Vega, a driver-for-hire back in Vice Shores. The city is a 3200×2400 open world with a road grid, traffic, pedestrians, a beach and ocean, a park and a plaza, six districts, and a wanted system that brings the police after you — patrol cars, foot cops, and at high heat, police dispatch roadblocks and a helicopter spotlight.

Eight jobs from Mama Lou: a first fare in a yellow taxi, a timed package run from the Marina docks, a getaway where you start with two wanted stars, a final job stealing a white sports car — plus a silent run past a police roadblock, a four-stop long con across the city, a clean getaway that starts hot with a fixer on call, and a five-stop finale across Vice Shores. Finish all eight and the city is yours in free roam.

### New in v5.1

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
