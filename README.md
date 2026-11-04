# Saborosa Games — studio website

Mockup marketing site for the studio, built as a plain Node.js + Express app so it
drops straight onto Hostinger's Node hosting.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, with --watch reload
```

Built and tested on **Node v20.19.4** (npm 11.6.0). `package.json` declares `engines: node >=18`.

## Layout

```
server.js            Express: static hosting, /api/subscribe stub, /healthz, 404
public/
  index.html         The whole site — hero, games, studio, devlog, contact
  404.html
  css/style.css      Hand-drawn ink & kraft design system (CSS variables at the top)
  js/main.js         Signup form handling, footer year
  js/walkers.js      The yard — walk TOM, ERKPA and JUIXY around the page
  img/               Art pulled from the game repos, downscaled for web
tools/
  pack-walkers.py    Rebuilds the character strip from the game's own sheets
```

No build step, no bundler, no framework — edit the files and reload.

## Art

Images are optimized copies of real assets from `../saborosa`:

| File | Source | Used for |
|---|---|---|
| `title-saborosa.png` | `assets/intro-title.png` | Hero wordmark |
| `band-doodles.jpg` | `assets/intro-bg.jpg` | Scrolling hero backdrop |
| `island.jpg` | `assets/cor-saborosa-fundo-fim-island-01-combined.png` | Saborosa card |
| `island-zones.jpg` | `assets/saborosa-fundo-base-V2.png` | Color-zone inset |
| `dungeon-bg.jpg` | `assets-v2/saborosa-dungeon-fundo-novo.png` | STILL LIFE card |
| `plane-*.png` | `assets-v2/flying-dungeon/character-sheets/` | Floating planes, stickers (source dir still uses the old `flying-dungeon` name) |
| `fruit-select.png` | `assets/fruit-select-04-low.png` | Studio section |
| `batidao-*.jpg` | captured from `../saborosa/beatemup-dungeon` | BATIDÃO DE CÔCO card (7 shots: `bookcase` is the hero image, `street`/`desert`/`title` the strip) |
| `party-poster.jpg` | `../the-party/design/prty-poster.jpg` | THE PARTY card |
| `party-city.jpg` | `../the-party/desktop/selftest.png` | **Currently unused.** It was THE PARTY card's inset, removed because it covered the poster's SABOROSA logo. Kept in case a screenshot is wanted elsewhere; safe to delete. |
| `saborosa-walkers.png` | `../saborosa/assets/saborosa-elementos-{tomato,eggplant,laranja}-game.png` | The yard. Built by `tools/pack-walkers.py` |

Regenerate them by re-running the downscale step against the game repo if the source art changes.

### The character strip

`public/img/saborosa-walkers.png` is **not** a copy of a game asset — it is repacked from
three of them by `tools/pack-walkers.py`:

```bash
python3 tools/pack-walkers.py            # idle only (what ships): 28 KB
python3 tools/pack-walkers.py --throw    # idle + the charged throw: 173 KB
```

The three masters are **1.35 MB together, more than this entire img folder**, and 40 of the
45 frames in each are poses the site does not use. The script pulls column 0 — the idle
pose — in all five drawn directions, and writes one 110×128 grid, 15 cells, 28 KB.

Two things it handles that are easy to get wrong, both of which it bakes in so the browser
needs no alignment code at all:

- **Frames are tightly cropped and do not share a baseline.** It aligns on the body
  *centroid*, the way the game's own `src/entities/spritesheet.js` does, because in a throw
  pose an outstretched arm is the lowest pixel and bottom-aligning would shove the fruit
  upward. It then drops each character by its own centroid→feet distance so all three stand
  on one ground line. Nothing is ever rescaled to even it out — one scale per pack.
- **ERKPA's body is `(200,187,155)`, a tan** — not a purple, and within 2/255 of this site's
  `--kraft` background. That is why the yard's floor is `--paper`: on kraft he is a black
  outline around a hole. His body-colour test is the `tan` one in the script.

If the cell size changes (it does with `--throw`), the script prints the constants to paste
into the top of `public/js/walkers.js`.

### The yard

`walkers.js` turns the three standing drawings into characters you can walk around with the
arrow keys. Notes worth keeping:

- **There is no walk cycle anywhere in the project.** The game itself reuses the idle frame
  while moving. So the page offers both readings and lets you compare: *bobbing* fakes the
  missing animation out of the one frame (hop, stretch, squash, shrinking shadow), *sliding*
  is the raw truth and reads like a bug.
- **The cast is authored inside the yard and moved out of it on startup**, into a full-page
  `.yard-overlay`. That is what lets them leave the box. With JavaScript off they simply
  stay put in the yard, which is a fine thing for three drawings to do.
- **The overlay is a `div` with `pointer-events: none`, deliberately not a canvas.** It spans
  the whole document, so a canvas there would swallow every click, link and text selection
  on the site. Each fruit sets `pointer-events: auto` back on itself. The page underneath is
  completely unaffected — verified by hit-testing body text and a CTA link through it.
- ⚠ **`scroll-behavior: smooth` on `<html>` breaks per-frame scrolling.** Walking off the
  bottom of the window scrolls the page to follow, and a `scrollTo` issued every frame
  restarts the smooth animation every frame — the two cancel and the page does not move at
  all. `jump()` turns it off around that one call only, so the nav's smooth links still work.
- It never listens on `document`, only on the yard, so it cannot hijack scrolling or trap the
  keyboard. `Esc` hands focus back.
- ⚠ **Clicking a character must `preventDefault()` on `pointerdown`.** `mousedown`'s own
  default action moves focus — to the body, since a `<span>` is not focusable — and it runs
  *after* the handler, so without it clicking a character selects it but leaves the arrow
  keys dead.
- **The name tags are lifted out of the characters on startup** and pinned to the spot each
  one began on, so they read as labels on the ground instead of being dragged around.
- ⚠ **`.yard__hint` has to stay below z-index 40.** It was 9000, and since `.yard` sets no
  z-index of its own that number competes in the *root* stacking context — putting a caption
  on top of the sticky header and on top of the cast.
- ⚠ **The three up-facing poses float above their shadow, and the fix is `SINK` in
  `walkers.js`, not the pack.** The fruit is drawn from behind in those frames, so its body
  sits at a different height inside its crop box and one per-character alignment cannot place
  the face-on and the away-facing groups at once. Measured against each character's own
  face-on poses, the up frames were 5.8–7.8px high and the up-diagonals 3.3–6.3px. `SINK`
  pushes exactly those back down at draw time and leaves every other direction untouched.
  **Re-deriving the whole pack to fix it instead makes every direction float** — that was
  tried.

### On a phone

There is no keyboard, so `walkers.js` builds a control pad — in JS, never in the markup, so
a no-JS visitor is never shown a dead one. Tapping a character or the yard opens it.

- **The thumb stick is the dependable one.** No permission, no HTTPS requirement, nothing to
  deny. It is analogue: a half push walks at half speed (measured 41px vs 116px over 0.7s).
- **The tilt is the better toy, and cannot be relied on.** It needs HTTPS, it needs a gesture
  on iOS, and a single denial is sticky enough that the maze game this was modelled on
  (`../maze-explorer2`) has to tell people to clear Safari's website data. So it is opt-in
  behind the TILT button and the stick never goes away.
- ⚠ **`tilt.live`, not just `tilt.on`.** Adding a `deviceorientation` listener succeeds on
  plenty of devices that then never fire it — desktop Chrome, an Android phone with no gyro.
  Letting that take priority would feed the walker a vector of 0,0 and silently kill the
  stick. The tilt only takes over once a reading has actually arrived, and if none has after
  1.6s it switches itself back off and says so.
- ⚠ **A finger on the stick always outranks the tilt**, so the stick stays usable as an
  override.
- **Neutral is calibrated on the first reading**, rather than assuming a holding angle the
  way the maze game's fixed `neutralBeta` does — so it centres on however you happen to be
  holding the phone. `screen.orientation.angle` remaps the axes so "lean right" is always
  screen-right.

### Through the floor

Lean on the bottom edge of the page for `DIG_MS` (1.1s) and the character goes through it,
into the screen both BATIDÃO DE CÔCO and THE PARTY open on: a photographed compost heap with
hand-drawn vermin crawling over it at ~9.5fps, SABOROSA across the middle. The fall is black
with *"Não tem nada aqui embaixo"*; the landing answers *"Mentira."*

⚠ **It will not accept a press until it has played, and that guard is in two parts.** You get
here by *holding* a direction, and a held key auto-repeats — those repeats are fresh keydown
events arriving while the screen fades in, so without the guard the egg opened and closed in
the same breath and looked broken. `armed` waits for the animation; `released` waits for the
key that dropped you to actually come up. If nothing was held on the way in — you tilted the
phone, where there is no key and no finger — `released` starts true, or you would be stranded
on the heap forever. This is the same guard BATIDÃO puts on its own label screen (`LABEL.armMs`,
and its note that "a key still down from launching the game would blow through it before it
had drawn twice"). The exit hint is tied to `.is-armed` so it never offers a way out early.

The heap is `heap-{1,2,3}.webp` + `saborosa-logo.webp`, repacked from
`../saborosa/assets-v2/flying-dungeon/` (`CONFIG.VERMIN_FRAMES` and `CONFIG.LOGO.SHEET` in
the beat 'em up). That is **424 KB, and it is fetched inside `fallThrough()` and nowhere
else** — an ordinary visit never requests a byte of it. Any key or a click climbs back out,
and the whole cast is sent home afterwards so nobody is left at the bottom of the page.

## Dependencies and the `qs` override

`express` is the only direct dependency. Everything else is transitive, which is where
Hostinger's scanner finds things.

**`package.json` carries an `overrides` block pinning `qs` to `6.16.2`, and it has to stay
there.** In November 2026 Hostinger flagged three packages, all of them Express's:

| package | was | now | |
|---|---|---|---|
| `proxy-addr` | 2.0.7 | **2.0.8** | critical — IP spoofing via IPv4-mapped IPv6 trust subnet |
| `body-parser` | 1.20.6 | **1.20.9** | high — DoS via trailing bytes after a compressed body |
| `qs` | 6.15.3 | **6.16.2** | moderate/low — three advisories, all fixed in 6.16.1 |

`npm audit fix` resolved the first two on its own. It **could not fix `qs`**, and this is the
part worth remembering: **express 4.22.2 — the latest 4.x — pins `qs` to `~6.15.1`, so it can
never reach the 6.16.1 where those advisories are fixed.** `npm audit fix` therefore reports
it as only fixable by moving to Express 5, which is a major upgrade this site does not need.
The override forces the patched `qs` while staying on Express 4.

`6.16.2` specifically, rather than the newest `6.17.x`: it is at or above 6.16.1 where all
three advisories are fixed, *and* still inside `body-parser`'s own `~6.16.0` range, so the
only constraint being overridden is express's stale pin.

Verified after the bump: the server boots, static files and `/healthz` serve, 404s still 404,
query parsing works (plain, nested `a[b][c]`, array and comma forms — `qs` is what parses
those), and `/api/subscribe` accepts a valid address, rejects a bad one, rejects malformed
JSON with a 400, and still handles a **gzipped** body, which is the case the `body-parser`
advisory was about.

Re-check with `npm audit`. It should report **0 vulnerabilities**.

## Deploy to Hostinger

In hPanel → **Websites → Node.js app**:

| Setting | Value |
|---|---|
| Package manager | `npm` |
| Entry file | `server.js` |
| Install command | `npm install` |
| Build command | *(leave empty — there is no build step)* |
| Output directory | *(leave empty — this is a server app, not a static build)* |
| Node version | 18 or newer (20 recommended) |

The app reads `process.env.PORT` and binds `0.0.0.0`, which is what Hostinger's proxy expects.
Don't hardcode a port. `GET /healthz` returns `ok` for uptime checks.

## House style for copy

**No em dashes (—) or en dashes (–) in anything a visitor reads.** They read as
machine-written and Christian does not want them on the site. Rewrite the sentence instead:
a colon, a full stop, or "and"/"so" almost always does the job better. Ordinary hyphens
inside compound words are fine and expected (`hand-drawn`, `beat 'em up`, `trick-or-treaters`)
— removing those would just produce broken English. This applies to `index.html`, `404.html`
and any user-visible string in `js/`, including the tilt pad's status messages.

**Everything on itch.io is an early access demo**, so the copy says so: the cards are tagged
`Demo out now`, the buttons read `Play the demo`, and the games section header states it once
in plain words. Do not describe any of them as finished or as a full release.

## Still mocked up

- Devlog posts are placeholder cards linking to `#` — no CMS or post pages yet, and the
  three posts still only mention SABOROSA Sports and STILL LIFE.
- Footer social links for Bluesky, YouTube and Discord are still `#` — the itch.io profile
  lists no socials, so there were no real URLs to put in. The itch.io link is real.
- `POST /api/subscribe` validates the address and logs it to stdout. It does **not**
  persist or send anything — wire it to Mailchimp/Buttondown/a database before launch.
- `hello@saborosa.games` is invented copy; replace with the real inbox.
