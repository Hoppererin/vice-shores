# Vice Shores

An original top-down 2D open-world crime game in the spirit of GTA: Rico Vega is back in the coastal city of Vice Shores, running four jobs for the fixer Mama Lou, stealing cars, dodging the Vice Shores PD, and then roaming free. Plain static files, vanilla canvas, all sound synthesized in code — no assets from any commercial game.

## Run

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

## Controls

- **WASD / arrows** — move on foot, drive in a car
- **SHIFT** — run
- **E** — enter / exit a car
- **F** — punch
- **P** — pause
- **ENTER** — start, retry after busted / wasted

## Missions

1. **First Fare** ($150) — take the yellow taxi by the plaza to the Neon Mile club.
2. **Package Run** ($300) — pick up a package at the Marina docks, deliver to the Palm Court hotel within 75 seconds.
3. **Getaway** ($500) — lose 2 wanted stars, then reach the safehouse in Old Town.
4. **The Big Score** ($1000) — steal the white sports car from the mall lot and bring it to Mama Lou's garage.

Progress saves to localStorage (`vice-shores.save.v1`) on every job completion and every 20 seconds.

## Owner

- Owner: `geishakampret`
- Repo: `vice-shores`
- Referral code: `dhj53q2r`
