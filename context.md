# Catan Pangea — technical context

> **Handover doc.** Read this first — it is the source of truth for what the
> app does, why, and how the code is organised. **Update it in the same
> change as every feature, fix or design decision** (see the changelog at
> the bottom). Written for humans and for coding agents.

---

## 1. What this is

**Catan Pangea** is a web app for a group of friends who play Settlers of
Catan with homebrew rules on free-form continents instead of the fixed
hexagonal board. It does two jobs:

1. **Map generator** — builds a random continent, places terrain, number
   tokens and ports, and optimises them so the game is fair.
2. **Game tracker** — a shared, live scoreboard used on everyone's phone
   during the game: victory points, knights, cities, karma, the robber, and each
   player's honor coin, with a victory screen and season win tallies.

Plus a **music bar** that plays the table's YouTube / YouTube Music
playlist docked under the map and tracker, so the phone that's cast to the
TV can show the board and play the music at the same time.

It is used mostly **on phones at game night**, so the UI is mobile-first.

- Live site: https://rithvikp567.github.io/catan-pangea/
- Repo: https://github.com/rithvikp567/catan-pangea
- No build step, no runtime npm dependencies: plain ES modules served as
  static files. Firebase's web SDK is loaded from Google's CDN only when a
  Firebase config is present.

### House rules the app knows about

| Rule | What the app does |
|---|---|
| **Pangaea continents** | Free-form land; the generator keeps the coastline tight (see §4). |
| **Open Sea** board | One continent in open water; 9 loose ports clip onto the coast. |
| **Sea Lanes** board | Land inside the 5–6 player frame; leftover frame slots are navigable water. A player may pay a ship to claim one otherwise unreachable frame port, one player per port. "Flat" ship cost = any ship reaches any port; "Per hop" = water distance matters. |
| **Cities & Knights** | Optional balance profile: forest / pasture / mountains are worth more (commodities). |
| **13 VP to win** | Tracker caps VP at 13 and shows Victory / Defeat. |
| **Knights, per island** | Two shared counters, **Main island** and **Off island**, each 0 … 12 × players on its own. (A tiered version — mighty / strong / basic with a derived knight strength — was tried in 2.1.0 and reverted in 2.1.1 as too much for the table.) |
| **Cities** | A shared counter, 0 … 4 × players (city pieces in the box). |
| **Karma** | A shared ± number (homebrew; the app only tracks it). |
| **Robber points** | A shared value cycling 1 → 2 → 3; **Collect** subtracts it from karma. |
| **Honor coin** | Each player has a coin: heads = honorable (start), tails = dishonorable. Only its owner can flip it; everyone sees it. |

---

## 2. Quick start

```bash
npm start          # http://localhost:8000 (zero-dependency Node static server)
npm test           # node:test suite (Node 20+)
HOST=0.0.0.0 npm start   # also reachable from a phone on the same Wi-Fi
```

- ES modules don't load from `file://` — always serve the folder.
- **⚠ Localhost talks to the live database.** The committed Firebase config
  is the real game's, so a plain `npm start` session reads and writes the
  same data as everyone's phones. **When testing, add `?store=local`** — it
  forces the "this device only" store (`createStore.js`) and the pill shows
  *This device only*.
- **Several "phones" on one computer:** on localhost, add `?device=<name>`
  too (e.g. `http://localhost:8000/?store=local&device=alice`, another tab
  with `?store=local&device=bob`). Each tab gets its own identity and the
  tabs share one device-only store, so the whole multiplayer flow can be
  exercised locally without touching the live game.
- **Deploy:** push to `main`. `.github/workflows/deploy-pages.yml` runs
  `npm test`, then publishes the `catan-pangea/` folder to GitHub Pages.

### Firebase setup (needed for phones to sync)

**Already done for the live site:** Firebase project `catan-pangea`
(Spark/free plan, Realtime Database in us-central1, rules from
`database.rules.json`), config committed in `firebaseConfig.js`. The steps
below are for a fork that wants its own database.

Without a config the app runs in **"This device only"** mode (shown as a grey pill
on the tracker): everything works, but nothing is shared between phones.

1. https://console.firebase.google.com → **Add project** (Analytics not needed).
2. **Build → Realtime Database → Create database** (any location; start in
   *locked mode*).
3. **Rules** tab → paste the contents of [`database.rules.json`](database.rules.json)
   → **Publish**. (These rules are deliberately open — see §9.)
4. **Project settings → Your apps → Web (`</>`)** → register an app → copy
   the `firebaseConfig` object.
5. Paste it into [`catan-pangea/src/sync/firebaseConfig.js`](catan-pangea/src/sync/firebaseConfig.js)
   as `FIREBASE_CONFIG` — make sure it includes **`databaseURL`**.
   (These values are public identifiers, safe to commit.)
6. Commit and push. The tracker's pill turns green: **Live**.

---

## 3. Features (current)

### Map generator
- Two board types: **Open Sea** and **Sea Lanes** (top switch). Each is a
  `BoardGenerator` subclass; the switch is built from the registry.
- **New map** always rolls a new random seed. A seed can be replayed from
  *Settings → Advanced → Replay a seed* (same seed + settings = identical board).
- Settings: Players (3–6), Land tiles (13–30, press-and-hold stepper), Game
  (C&K / Base), Ship to port (Sea Lanes only); Advanced: Coastline (Loose
  0.80 / Standard 0.90 / Tight 0.95), Optimiser (Quick 6k / Standard 12k /
  Thorough 20k annealing steps), Replay a seed. Settings persist per device.
- Map score (0–100, four parts) shown as a chip on the board and a card in
  settings, with the seed (copy button).
- Save / share the board as a PNG (share sheet on phones, download on desktop).
- Light / dark theme (follows the system until toggled).
- "How it works" dialog explaining the math.

### Game tracker (multiplayer)
- **Welcome / join screen** (`#/join`): a centred welcome page — brand,
  "Who's playing?", the game in one line (board · players · seats taken),
  then every profile as a list. Create one (**one per device**, username
  only — the limit is enforced, not explained on screen); pick a profile →
  pick a **color** (colors taken in this game are disabled) → **Join
  game**. Underneath: Season wins · Admin · View map, and the sync pill.
- **Session = the map's seed.** The first device online publishes its map
  as the shared game; every phone shows that exact board. **New map**
  starts a new game for everyone (after a confirm if anything is in
  progress): points, coins and counters reset, **everyone seated keeps
  their seat and color** (if the new map has fewer seats, the players who
  don't fit pick again), **season wins are kept**.
- **Tracker screen** (`#/tracker`, *Tracker* button in the dock):
  - **Fits one phone screen without scrolling** (4 players down to an
    iPhone SE in Safari; 6 players on any current iPhone or Android — on
    an SE-sized screen 6 players scroll a little). The seat rows share the
    height the rest leaves: `--tracker-chrome` in `screens.css` is the
    measured height of everything else.
  - Victory points & honor — one row per seat (seat count = the map's
    player count): that player's honor coin in their color (only the owner
    can flip it; "Honorable" / "Dishonorable" under the name), then VP
    0–13. **Anyone can edit any player's VP.**
  - Cities and Knights — three compact tiles in one row: Main island
    knights, Off island knights (each 0…12 × players) and Cities
    (0…4 × players).
  - Karma & robber — one row: Karma (±99, the digits stay centred with the
    sign hanging left), Robber (just the number, exactly centred; tap
    cycles 1→2→3) and **Collect: −N** (subtracts it from karma).
- **Victory screen**: when a seated player hits 13 VP, they see *Victory*,
  other seated players see *Defeat* (spectators see "X wins"). **Continue**
  returns to the tracker with numbers intact. If that player drops below 13
  and returns, it shows again.
- **Season wins** (`#/wins`): wins per profile per calendar year. Reaching
  13 records a win; dropping back below 13 removes it (so corrections fix
  the tally).
- **Admin** (`#/admin`, password `password` — not security, a shared
  management account): remove profiles (frees their seat, deletes their
  wins, lets their device create a new profile) and add/remove wins.
- Sync status pill: **Live** / **Offline** (changes queue and sync later) /
  **This device only** (no Firebase config).

### Music (YouTube playlist)

- The **♪** button (map toolbar, tracker header) opens the **music bar**:
  the YouTube player (200 × 200 on phones, 16:9 on wider screens) with
  Previous / Play–Pause / Next, Shuffle, **Songs** (tap any song to play it;
  titles come from YouTube's oEmbed endpoint — no API key), **Playlist**
  (🔗) and Close. Songs and Playlist open as sheets above the bar, one at a
  time, and stay hidden otherwise.
- **Playlist** pop-up: change the link for everyone, and **Play in the
  YouTube Music app** — for YouTube Premium: the app keeps playing in the
  background with no ads, so the bar pauses and closes and the map gets the
  whole screen (mirroring still carries the sound). It also links to
  YouTube sign-in: Premium removes ads *in this player* only when the embed
  can see you're signed in — works on Android Chrome; iPhone Safari's
  cross-site tracking protection usually hides the sign-in.
- **Docked on every screen:** a bar along the bottom in portrait, a column
  on the right in phone landscape (the best way to cast to a 16:9 TV). The
  map and every screen shrink to make room — `MusicBar` measures itself
  into `--music-h` / `--music-w` and `css/music.css` applies them. In
  portrait Safari the tracker scrolls about 90 px while the bar is open.
- **One shared playlist link** (`/v1/music`): paste a YouTube or YouTube
  Music playlist link once and every phone has it; anyone can change it
  from the Songs sheet. **Playback is per phone** — only the phone that's
  cast needs to play. If someone changes the link while this phone is
  playing, it keeps playing and offers *New playlist — tap to switch*.
- Screen mirroring (AirPlay, Chromecast "cast screen") carries the sound to
  the TV with the picture. While music plays the screen is kept awake (Wake
  Lock): a locked phone stops web audio.

---

## 4. The map math

### Why shape matters
Every intersection (where a settlement goes) touches 1, 2 or 3 tiles; 3-tile
spots are the good ones. With

| | |
|---|---|
| `A` | land tiles |
| `S` | land-to-land tile edges |
| `v1 v2 v3` | intersections touching 1 / 2 / 3 tiles |
| `L` | enclosed lakes (connected bodies of water, not hexes) |

Euler's formula (V − E + F = 2 with E = 6A − S, F = A + 1 + L), plus "every
coastal corner has exactly two coastal edges" (v1 + v2 = 6A − 2S) and corner
incidence (v1 + 2v2 + 3v3 = 6A), give

```
v3 = S − A + 1 − L
v2 = 3A − S − 3 + 3L
v1 = 3A − S + 3 − 3L
```

So **v3 depends only on S**: every edge short of the maximum destroys one
3-spot and creates one 1-spot and one 2-spot. The maximum is the
Harary–Harborth bound for polyhexes, **`Smax(A) = ⌊3A − √(12A − 3)⌋`**
(exact for the standard 19-hex board: S = 42, v3 = 24; and the 30-hex 5–6
frame: S = 71). These identities are asserted on 1,500 random shapes in
`tests/geometry.test.js`.

### Pipeline (`BoardGenerator.generate`, a template method)
1. **Grow** (`continent.js`): from the centre, repeatedly add a frontier hex
   chosen with weight `(1 + land neighbours)^k`; larger `k` = rounder. Open
   Sea k = 2.0 (3.2 when the floor ≥ 0.95), Sea Lanes k = 2.4 inside the frame.
2. **Compactify**: hill-climb — move the least-connected tile to the
   most-connected vacancy (keeping the land connected) until
   `S ≥ round(Smax · floor)`; then fill enclosed lakes. Floor: Open Sea =
   Coastline setting; Sea Lanes = max(0.80, Coastline − 0.05).
3. **Tiles** (`tileSet.js`): A = 19 is exactly the base set (4 forest, 4
   pasture, 4 fields, 3 hills, 3 mountains, 1 desert; tokens
   2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12). Below 19, terrain is trimmed by
   largest-remainder apportionment of 4/4/4/3/3; above 19 one extra terrain
   per tile in rotation (second desert from 27). Number tokens are trimmed /
   extended in pairs mirrored around 7 (3&11, 5&9, 4&10, 6&8, 2&12) so every
   number has its twin; an odd count leaves one unpaired token (seeded side).
4. **Ports** (`ports.js`): walk the **outer** coastline (lake shores
   excluded — `topology.outerCoast`) or, for Sea Lanes, the frame rim, as a
   cycle; place 9 (Open Sea) / 11 (Sea Lanes) slots evenly; one 2:1 port per
   resource, the rest 3:1. Initial siting puts each 2:1 port's resource
   ~2 hexes from its slot.
5. **Anneal** (`Annealer.js`): simulated annealing over terrain, tokens and
   ports. Each step swaps two ports (8%), two whole tiles (45% of the rest),
   or two number tokens; improvements are kept, worse boards kept with
   probability `exp(−Δ/T)`, `T` cooling geometrically 240 → 0.6. Chunked
   with yields so the UI stays responsive; cancellable via `AbortSignal`.
6. **Score** (`scoring.js`).

### Penalty function (`objective.js`, weights in `PENALTY`)
- 6/8 touching another 6/8: 260 each (effectively a hard rule); identical
  numbers adjacent: 42; same-terrain clumps beyond 16% of adjacencies: 9.
- Resource balance: `2.4 × Σ (pips − expected)²`, expected = pip share by
  tile count (ore/brick have fewer tiles, so fewer pips is correct).
- Port siting: 12 per hex a 2:1 port's resource is away from 2 hexes.
- Draft fairness: two seeded greedy 1→N→1 snake drafts (`vertexModel.js`);
  26 × std-dev of weighted pips across seats; 55 per resource a seat opens
  short of 4. Open Sea (`oreWheatFloor`): 320 per seat missing ore or wheat
  (≈ hard). Otherwise under C&K: 80 / 70 for missing ore / wheat.
- Seating quality: of the top 2N non-conflicting spots, 34 per non-3-spot,
  60 per 1-spot.
- Sea Lanes: 1-spots with sea reach (traps) +12, 2/3-spots with sea reach
  (bays) −8 (max 10).
- Dead zones: 7 per 3-spot worth ≤ 4 pips.

Intersection value = terrain-weighted pips + port value (2:1 = 3.0, 3:1 =
1.6 pip-equivalents) + sea-lane value (two best reachable ship-only ports ×
distance decay × 0.45).

### Score shown to players (`scoring.js`, 4 × 25 points)
Compactness `clamp((S/Smax − 0.72)/0.28)`; seating `(top 3-spots − 1.5 ×
top 1-spots) / 2N`; fairness `1 − spread/0.34` (best-to-worst weighted pips
relative to the mean); numbers `1 − 0.34·red − 0.05·same − min(0.5,
1.5·worst resource deviation)`. ≥ 78 "Playable as dealt", ≥ 58
"Acceptable", else "Re-roll advised".

---

## 5. Code structure

```
catan-pangea/                       ← deployed as-is to GitHub Pages
  index.html                        markup shell + "How it works" dialog
  css/tokens.css                    color tokens (light + dark)
  css/app.css                       map layout (phone portrait / landscape / desktop)
  css/screens.css                   join / tracker / wins / admin / victory / toast
  css/music.css                     music bar + how everything else makes room for it
  src/main.js                       entry point → new App(document).start()
  src/engine/                       MAP ENGINE — pure, DOM-free (browser, Node, or a worker)
    hex.js                          axial coords, integer vertex lattice, distances, pixels
    random.js                       seeded PRNG (mulberry32), hashSeed, shuffle, seed names
    catalog.js                      game data + constants (no colors)
    shapes.js                       hexagon / 5–6 frame outlines
    topology.js                     Smax, S, intersections, coastline, lakes, outerCoast
    continent.js                    growContinent, compactify
    tileSet.js                      buildTileSet (trim/extend), dealTiles
    ports.js                        orderBoundary, evenSpots, portSet, assignPorts
    seaLanes.js                     ship-only ports, basins, reach + distance decay
    vertexModel.js                  intersection values, simulated snake draft
    objective.js                    PENALTY weights, buildContext, evaluate
    Annealer.js                     simulated annealing (class, cancellable)
    scoring.js                      0–100 score + verdict
    Board.js                        immutable result; toSnapshot()
    generators/BoardGenerator.js    template method: generate() + restore(snapshot)
    generators/OpenSeaGenerator.js  hooks for Open Sea
    generators/SeaLanesGenerator.js hooks for Sea Lanes
    generators/index.js             GENERATORS registry, getGenerator, restoreBoard
    index.js                        public API barrel
  src/game/                         GAME TRACKER DOMAIN — pure logic over a store
    rules.js                        limits, colors, robber cycle, newSession(), validateName
    GameState.js                    read-only view: seats, winners, taken colors, wins tally
    GameService.js                  every operation as store transactions
  src/music/playlist.js             pure: parsePlaylist (links → list id), player error meanings
  src/sync/                         STORE ADAPTERS (same contract, see MemoryStore.js)
    MemoryStore.js                  reference impl + contract docs (tests)
    LocalStore.js                   "this device only": localStorage + BroadcastChannel
    FirebaseStore.js                Firebase Realtime Database adapter (CDN SDK)
    firebaseConfig.js               public config of the live project (null = this device only)
    createStore.js                  picks the adapter; `?store=local` forces this device only
  src/app/                          APPLICATION LAYER
    App.js                          controller: map ↔ shared session, wiring
    GameController.js               tracker facade for screens (state, me, intents, toasts)
    Settings.js                     immutable settings value object + UI presets
    Identity.js                     device id + current profile (localStorage)
    Router.js                       hash routes: "" (map), join, tracker, wins, admin
    storage.js                      SafeStorage (never-throwing localStorage)
  src/ui/                           VIEWS
    BoardView.js                    SVG board renderer (concrete colors → exportable)
    SettingsPanel.js, controls.js   settings form; SegmentedControl, Stepper, CounterControl, holdRepeat
    ScoreCard.js, Sheet.js          score card/chip; settings bottom-sheet / drawer
    ThemeController.js, palette.js  theme; board colors
    imageExport.js, Toast.js, dom.js  PNG/share; toasts; h()/s() DOM builders
    VictoryOverlay.js               victory / defeat screen
    MusicBar.js                     docked YouTube player (IFrame API), songs sheet, playlist link
    screens/Screen.js               base class for full-screen views
    screens/JoinScreen.js, TrackerScreen.js, WinsScreen.js, AdminScreen.js, widgets.js
tests/                              node:test (engine, store, game service)
scripts/serve.js                    zero-dependency dev server
database.rules.json                 Firebase RTDB rules (paste into the console)
context.md                          this file
```

### Layers and rules of the road
```
ui/  ──intent──▶  app/  ──▶  engine/        (map)
                       └──▶  game/  ──▶  sync/ store adapter  (tracker)
```
- **engine/** and **game/** never touch the DOM; **game/** never imports a
  specific store (it takes one in its constructor). Both are unit-tested in Node.
- **Views report intent, they don't own state.** `App` owns map state;
  `GameController` owns tracker state. Views re-render from state.
- Patterns: template method (`BoardGenerator`), strategy/adapter (stores),
  immutable value objects (`Settings`, `GameState`, `Board`), registry
  (`GENERATORS`), screen base class (`Screen`).
- Screens build their DOM once and update values in place; full rebuilds
  only when structure changes (e.g. seating) — otherwise a remote update
  would cut off a press-and-hold or wipe a text field mid-typing.
- `Screen` has two layouts: `"page"` (sticky header: back, title, actions)
  and `"centered"` (no header, content in the middle of the screen; the
  subclass places `this.heading` — used by the welcome screen).
- **Transitions:** map → screen rises over the map (`data-enter="rise"`);
  screen → screen keeps the backdrop opaque and only fades the content in
  (`data-enter="swap"`, set by `Router`). Never fade a whole screen in over
  another one — the map would flash through for a frame.
- Native `<select>`s go through `selectField()` (`screens/widgets.js`): the
  browser arrow is hidden and a centred chevron drawn instead.
- DOM is built with `h()` / `s()` from `ui/dom.js`. `innerHTML` is used only
  for static, trusted SVG icons. User text always goes through text nodes.
- Style: modern JS (classes, private `#fields`), JSDoc types, no framework.
  Colors only via CSS tokens (`css/tokens.css`) except terrain colors in
  `ui/palette.js`.

### Map ↔ session flow (`App`)
- Boot: connect the store → first `GameState`. If a session exists, restore
  its board from the snapshot; otherwise generate a board and publish it
  with `onlyIfNone` (a transaction, so two devices booting together agree).
- New map / mode switch / replay seed → confirm if `state.hasProgress` →
  generate → publish (replaces the session).
- A session arriving from another phone → `restoreBoard(snapshot)` (no
  annealing; identical board and score on every device — this avoids any
  cross-browser floating-point drift in re-generation).
- A new game carries the seated players over (`carrySeats` in
  `rules.js`). If this device was seated before and isn't any more (the
  new map has fewer seats), it's sent to the join screen.
- **Join** first makes sure a game exists (`App.#ensureSession`): if the
  app was opened straight on the join screen and the first map is still
  generating, it waits for that map (`inflight.done`) — or makes one.
- If the store doesn't deliver a first state within 6 s, a local map is
  shown and a toast explains; the game attaches when the data arrives.

---

## 6. Data model (Realtime Database, under `/v1`)

```
v1/
  profiles/{profileId}:  { name, createdAt (ms), deviceId }
  session:                                   ← the ONE active game
    meta:     { id, seed, players, createdAt, createdBy?, season }
    board:    BoardSnapshot  { v:1, generatorId, request, tiles:["q,r|terrain|num"], ports:["edge|hex|type|res"] }
    settings: Settings#toJSON()
    seats:    { s0:{ vp, honorable, profileId?, color? }, s1:…, … }   (keys "s0…" — numeric keys become arrays)
    counters: { knightsMain, knightsOff, cities, karma, robber }
              (one key per COUNTERS entry; a missing key reads as 0, so older games keep working)
  wins/{season}/{entryId}: { profileId, delta (±1), source:"game"|"admin", sessionId?, at }
  music:                   { listId, setAt (ms), setBy? }   ← the table's playlist (YouTube list id)
```
- **Wins are a ledger.** A game win's entry id is `${sessionId}_${profileId}`
  (idempotent): written when VP goes <13 → 13, removed when 13 → <13. Admin
  edits add `adj_…` entries with delta ±1. A profile's season total = Σ
  delta (never shown below 0). Season = the year the game started.
- Nulls are never stored (RTDB semantics); `prune()` in `MemoryStore`
  normalises writes identically for every adapter.
- **Concurrency:** every change to shared numbers is a transaction with the
  limits applied inside it (VP 0–13, knights 0–12×N per island, cities 0–4×N, karma ±99, color
  uniqueness, seat availability), so simultaneous taps from several phones
  never lose updates or break a limit. Counter controls send **deltas**.
- **RTDB caveat:** a transaction may first run with `null` if nothing is
  cached. Our transactions abort on a missing node, so the app keeps a
  `watch()` open for its whole life; transactions then start from the cache
  and Firebase retries them against the server.

### Identity
- `deviceId`: random, in localStorage (`pangaea:deviceId`). A device may
  create **one** profile (checked against `profiles/*/deviceId`); if an
  admin removes it, the device may create another.
- Current profile: `pangaea:profileId`. Clicking another profile on the join
  screen switches to it (no passwords — trusted group).

---

## 7. Testing

`npm test` runs everything in `tests/` with Node's built-in runner:
- `geometry.test.js` — hex math, Smax, Euler identities, outer coast, compactify.
- `tileSet.test.js` — tile/token sets for every size 13–30.
- `generators.test.js` — determinism, hard rules, port siting, ore/wheat
  floor, frame bounds, snapshot round-trip (identical board + score), abort.
- `store.test.js` — the store contract (`MemoryStore`).
- `game.test.js` — the tracker as several devices on one shared store:
  profiles, seats/colors, VP + win record/revoke, coins, knights, karma,
  robber, session rotation, admin.
- `music.test.js` — playlist links (YouTube, YouTube Music, share links,
  private lists), player error handling, the shared playlist.

UI is verified by driving the real app in a headless Chromium browser via
the DevTools protocol at phone sizes (two tabs with different `?device=`
values for multiplayer, **always with `?store=local`** so the run doesn't
write to the live game). Note: on the original dev machine Chrome's
DevTools protocol is blocked by policy; headless **Brave** works.

If you ever need to check the real database end to end, the Realtime
Database REST API is open under `/v1` (e.g. `curl
https://catan-pangea-default-rtdb.firebaseio.com/v1.json`). Only do it when
no game is in progress, and remove exactly the profiles / session / wins
your run created afterwards — never `DELETE /v1` once real data exists.

---

## 8. How to extend

- **New board type:** subclass `BoardGenerator`, override only the hooks
  that differ (`domain`, `effectiveFloor`, `growthExponent`,
  `portSlotSource`, `buildLanes`, constructor options such as `portCount`,
  `oreWheatFloor`, `usesShipRule`), add an instance to `GENERATORS`. Add
  tests in `generators.test.js` (they iterate over `GENERATORS`).
- **New shared counter:** add it to `COUNTERS` in `game/rules.js` (label +
  bounds as functions of the player count). `newSession()`,
  `GameState.counters`, `hasProgress` and `GameService.adjustCounter` all
  derive from `COUNTERS`; render it in `TrackerScreen` with the
  `tile(name, label)` helper (bounds follow the table size). Steps go
  through `stepWithin`, so a value saved past a later, tighter bound can
  still step back one at a time. Adding a row of tiles makes the screen
  taller: re-measure and update `--tracker-chrome`. Add a test.
- **New per-player stat:** add the field to seats in `newSession()`, read it
  in `GameState.seats`, add a `GameService` method using a seat
  transaction, render it in `TrackerScreen.#buildSeats`.
- **New screen:** subclass `Screen` (build once in `build()`, update in
  `render(state)`), register it in `App` (`this.screens`), navigate with
  `router.go(name)`.
- **New store backend:** implement the contract documented at the top of
  `sync/MemoryStore.js` and choose it in `createStore.js`.
- **Schema change:** keep old readers working or bump the root (`v1` → `v2`)
  in `GameService` and `database.rules.json`.

---

## 9. Known limitations & gotchas

- **The database is open** (no auth): anyone who finds the project URL
  could edit or wipe data. Acceptable for a friends-only tool; if that
  changes, add Firebase Anonymous Auth and per-path rules.
- **Local runs hit production** unless the URL has `?store=local` (the
  config in the repo is the live one). Tests in `tests/` never touch it —
  they use `MemoryStore`.
- **One active game at a time** (one `session`). Two groups playing
  simultaneously would overwrite each other. Multiple rooms would mean
  `sessions/{roomId}` plus a room code — the service is structured so this
  is a contained change.
- "One profile per device" relies on localStorage; clearing site data makes
  the browser a new device (admin can tidy up).
- Admin password is a constant (`ADMIN_PASSWORD` in `rules.js`) by request
  — it is not security.
- Changing settings doesn't affect the current game until **New map**.
- Seeds from before v2.0.0 produce different boards (the optimiser changed).
- iOS: the share sheet needs a user gesture (the button tap provides it).
- **YouTube's embed rules** ([required minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality),
  [developer policies](https://developers.google.com/youtube/terms/developer-policies))
  shape the music bar: the player must stay **visible, at least 200 × 200,
  with nothing drawn over it**, and must not play from a hidden
  ("background") player or separate the audio. So there is no audio-only
  mode, closing the bar pauses, and every overlay (songs sheet, settings
  sheet, About, victory, toasts) is laid out around the bar. Keep it that
  way when adding UI. Don't touch YouTube's controls or ads.
- **Music limits:** on phones the first play needs a tap on the YouTube
  player itself (browsers only start video from a tap inside its frame);
  after that our buttons work. YouTube may show ads unless the viewer is
  signed in to YouTube Premium in that browser. Songs whose owner blocks
  embedding are skipped (error 101/150) with a toast. Private lists (Liked
  music, Watch later) can't be embedded — the link check explains. Music
  stops on reload, app switch or a locked phone.
- **Switching playlists makes a new player.** YouTube's `loadPlaylist` /
  `cuePlaylist` keep the old songs once a playlist is loaded (only the
  link changes), so `MusicBar` destroys the player and creates a fresh one.
  A fresh player ignores *play* until its playlist has loaded, so if music
  was playing it's asked again on CUED / UNSTARTED (`resumeTries`, a few
  tries for 10 s). A phone that insists on a tap shows *Tap the video*.

---

## 10. Changelog

Keep newest first. Every feature PR adds an entry and updates the sections above.

- **2.2.2 — Fix:** switching playlists while music plays now carries on
  playing (the fresh player is asked again once its playlist loads).
- **2.2.1 — Music polish.** The playlist link moved off the Songs sheet
  into its own pop-up behind a 🔗 button. New *Play in the YouTube Music
  app* option for Premium (background play, no ads) and a YouTube sign-in
  link for ad-free embeds. Fixed: changing the playlist kept playing the
  old songs (fresh player per playlist). Phone landscape: toolbar icons
  span the rail, and the map no longer keeps a notch gap beside the music
  column.
- **2.2.0 — Music bar.** The table's YouTube / YouTube Music playlist in a
  docked player on every screen (bottom bar in portrait, right column in
  phone landscape), so a phone cast to the TV shows the board and plays the
  music. Previous / play / next, shuffle, a songs list with titles, one
  shared playlist link (`/v1/music`), screen kept awake while playing,
  blocked songs skipped. The tracker's two-column layout became a container
  query so the music column can take width away. Built to YouTube's embed
  rules (visible ≥ 200 × 200, never covered, no background play).
- **2.1.1 — Compact tracker.** The tracker fits one phone screen without
  scrolling: honor coins moved into the victory-point rows, Cities and
  Knights and Karma & robber are single rows of compact tiles, and the
  seat rows share the leftover height. Knights back to the two simple
  counters (main island / off island, 0–12 × players each); the
  mighty / strong / basic tiers and knight strength are gone. The robber
  number is exactly centred in its button (it was laid out on the text
  baseline). On desktop, players sit left with the shared cards right.
- **2.1.0 — Game tracker (multiplayer).** Profiles (one per device), join
  with a unique color, session = map seed shared by every phone (board
  snapshots), live tracker (VP 0–13, honor coins, Cities and Knights —
  knights per island, briefly in tiers, and cities —
  karma, robber cycle + "Collect: −N"), New map keeps seats and colors, victory / defeat screen with Continue and
  re-trigger, season wins ledger (record / revoke at 13), admin (remove
  profiles, edit wins), sync adapters (Firebase / this device / memory),
  hash routing, toasts, tests for the store and game service, this doc.
  Live on Firebase project `catan-pangea` (verified with two phones against
  the real database); `?store=local` keeps test runs off it. Polish: centred
  welcome screen without helper text, US spelling (color, honor), drawn
  −/+ icons and centred counter values, Join waits for the first map, no map flash between screens, custom
  centred chevron on the season dropdowns.
- **2.0.0 — Redesign.** Only Open Sea and Sea Lanes (Surveyed's strengths
  merged into Open Sea; Draft mode removed). Overlays and analysis panels
  removed. New minimal light/dark theme; mobile-first layout where the
  board always fits; steppers instead of sliders; share sheet. "New map"
  always rolls a new seed. Single 2,500-line file split into ES modules;
  `npm test` gate before deploy; dev server.
- **1.1.0 — Map-gen fixes.** 2:1 port siting scored inside the annealer
  (ports can swap); symmetric token trim for small maps and proportional
  terrain trim; outer-coast-only port placement; lake counting by regions;
  Generator II/III behaviour matched to docs.
- **1.0.0 — Initial release.** Single-file generator with three continent
  generators (Open Sea, Sea Lanes, Surveyed), pass-the-phone Draft mode,
  analysis panel and overlays.
