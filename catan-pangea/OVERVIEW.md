# Pangaea — Project Overview

## The problem

Standard Catan is a fixed hexagon. Your group instead plays on a free-form
"pangaea" continent — but freehand shapes create far more coastline than the
official board, and coastline is bad for gameplay: every jagged edge trades a
good settlement spot for a bad one.

## Why shape hurts (the math, briefly)

Every point where tiles meet (an **intersection** — where a settlement can go)
touches either 1, 2, or 3 tiles. A 3-tile spot is what you want: it collects
three resources' worth of dice rolls. Reshape the *same* tiles into a spikier
outline and the tile count doesn't change — but 3-spots get converted into 1-
and 2-spots.

| Symbol | Meaning |
|---|---|
| `A` | number of land tiles |
| `S` | number of land-to-land tile edges (how many pairs of tiles touch) |
| `v1 / v2 / v3` | count of 1-, 2-, 3-resource intersections |
| `Smax` | the highest `S` possible for `A` tiles (a perfectly round blob) |
| `L` | enclosed lakes — separate bodies of water, however many hexes each spans |

These counts are locked together by **Euler's formula** (the rule that says a
shape made of flat faces meeting at edges and corners always balances out a
certain way):

```
v3 = S − A + 1 − L
v2 = 3A − S − 3 + 3L
v1 = 3A − S + 3 − 3L        (the generator fills lakes, so L = 0)
```

**So `v3` depends only on `S`.** Shape matters *only* through how many tile
edges it creates. The maximum is `Smax = ⌊3A − √(12A − 3)⌋`; every edge short
of that destroys one 3-spot and manufactures one 1-spot *and* one 2-spot. That
one relationship is the whole problem.

## Board types

| Type | Frame | Ports | Coastline floor |
|---|---|---|---|
| **Open Sea** | none | 9, on the outer coast | The Coastline setting. Every seat must also open with ore + wheat. |
| **Sea Lanes** | 5–6 player border | 11, on the frame | Coastline − 0.05, never below 0.80 (the ship rule pays some coastline back) |

Open Sea absorbed what the retired "Surveyed" generator did well: the ore +
wheat floor, a rounder growth seed for the **Tight** coastline (which reliably
reaches 0.95), and its longer anneal as the default **Standard** optimiser.

## The pipeline

Both board types run the same pipeline (`BoardGenerator.generate`):

1. **Grow + compactify** — grow a continent from the centre, hill-climb tile
   positions to raise `S` to the floor, and fill any enclosed lake.
2. **Place ports** — walk the outer coastline (or the frame rim), space the
   slots evenly, and make a first pass at siting each 2:1 port near (not on
   top of) its resource.
3. **Anneal terrain + numbers + ports** — simulated annealing (below) against
   a penalty function. Ports can swap slots, so the 2:1 siting survives the
   terrain moving around.
4. **Score** — simulate a 1→N→1 snake draft and report a 0–100 score.

## What "simulated annealing" means

Annealing is a metallurgy term: heat metal, then cool it *slowly* so atoms
settle into a stable, low-energy arrangement. The algorithm borrows the idea:

- Start with terrain and numbers randomly placed on the fixed tile positions.
- Each step, try a random swap (two tiles, two number tokens, or two ports).
- A swap that makes the board *better* (lower penalty) is always kept.
- A swap that makes it *worse* is still sometimes kept — with probability
  `exp(−Δ/T)`, which shrinks as the "temperature" `T` cools over the run.

A plain hill-climb gets stuck the moment every single swap looks worse, even if
a genuinely good board is two swaps away. Tolerating bad moves early is what
lets annealing escape — and why it needs thousands of passes.

## The penalty function (what "better" means)

All weights live in `PENALTY` in `src/engine/objective.js`. Lower is better:

- **Hard rules** — a 6 touching an 8 (or another 6/8), identical numbers
  touching, same-terrain clumps.
- **Resource balance** — pips should track tile *count* per resource (ore and
  brick have fewer tiles, so fewer pips is correct, not a flaw).
- **Port siting** — each 2:1 port wants its resource about two hexes away:
  near enough to matter, far enough that one settlement can't hog both.
- **Draft fairness** — two simulated snake drafts; penalise a wide
  best-to-worst seat spread, seats short of 4 resources, and (Open Sea) any
  seat without ore or wheat.
- **Seating quality** — can `2 × players` non-conflicting strong spots be seated?
- **Sea Lanes** — bays (2-spots with sea access) are good, spikes are traps.

## Settings

| Control | Effect |
|---|---|
| **Board type** | Open Sea or Sea Lanes (top of the screen) |
| **Players** | Seats the fairness simulation optimises for |
| **Land tiles** | `A`. Below 19 the tile and number mix is trimmed proportionally (numbers in pairs mirrored around 7); above 19 it is extended |
| **Game** | Cities & Knights weights forest / pasture / mountains higher (commodities); Base treats terrain evenly |
| **Ship to port** | Sea Lanes only. Flat: any ship reaches any port. Per hop: water distance matters |
| **Coastline** *(Advanced)* | Loose 0.80 · Standard 0.90 · Tight 0.95 of `Smax` |
| **Optimiser** *(Advanced)* | Quick 6k · Standard 12k · Thorough 20k annealing steps |
| **Replay a seed** *(Advanced)* | Same seed + same settings = the identical board |

**New map** always rolls a fresh seed. The current seed is shown under the
score, and settings are remembered on the device.

## Game tracker

Tap **Tracker** during the game. Everyone joins with a profile (one per
device, username only) and picks a color nobody else has; the session is
the map on screen, so a **New map** starts a fresh game for everyone
(everyone keeps their seat and color). It tracks, live on every phone:
victory points (0–13 — hitting 13 shows Victory / Defeat), each player's
honor coin (flip your own), Cities and Knights (main island and off
island knights, 0–12 × players each, plus cities, 0–4 × players), karma, and the
robber (1 → 2 → 3, **Collect** takes it off karma). Wins are tallied per season
(calendar year); an admin profile can fix wins and remove profiles.

## Music

Tap **♪** (top of the map, or the tracker header) to open the music bar:
your YouTube or YouTube Music playlist with previous / play / next,
shuffle and the song list. It stays docked under the map and the tracker
(on the right when the phone is sideways), so the phone you cast to the TV
shows the board and plays the music. Paste the playlist link once — every
phone gets it; change it with the 🔗 button. On a phone, start the first
song by tapping the video. With YouTube Premium, 🔗 → **Play in the
YouTube Music app** plays it from the app instead — in the background, no
ads — and the bar closes so the map gets the whole screen.

## Code layout

The full technical reference — architecture, data model, how to extend,
changelog — is [`context.md`](../context.md) at the repo root.

```
catan-pangea/                 deployed as-is to GitHub Pages
  index.html                  markup shell + "How it works" dialog
  css/tokens.css              color tokens (light + dark)
  css/app.css                 layout (phone portrait / landscape / desktop) + components
  src/main.js                 entry point
  src/engine/                 pure, DOM-free map engine (runs in browser + Node)
    hex.js shapes.js topology.js continent.js tileSet.js ports.js
    seaLanes.js vertexModel.js objective.js Annealer.js scoring.js Board.js
    generators/               BoardGenerator (template method) + OpenSea + SeaLanes + registry
  src/app/                    App controller, Settings value object, safe storage
  src/ui/                     BoardView (SVG), SettingsPanel, controls, ScoreCard,
                              Sheet, ThemeController, imageExport, palette
tests/                        node:test suite for the engine
scripts/serve.js              zero-dependency local server
```

The engine never touches the DOM, so it can be tested in Node and moved into
a Web Worker later without changes. UI components report intent to `App`;
they never talk to each other or to the engine directly.

**Adding a board type:** subclass `BoardGenerator`, override the hooks that
differ (`domain`, `effectiveFloor`, `growthExponent`, `portSlotSource`,
`buildLanes`), and add an instance to `GENERATORS` in
`src/engine/generators/index.js`. The mode switch is built from that list.
