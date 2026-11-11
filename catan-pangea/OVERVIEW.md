# Pangaea — Project Overview

## The problem

Standard Catan is a fixed hexagon. Your group instead drafts tiles onto a
free-form "pangaea" continent — but freehand shapes create far more coastline
than the official board, and coastline is bad for gameplay: every jagged edge
trades a good settlement spot for a bad one.

## Why shape hurts (the math, briefly)

Every point where tiles meet (an **intersection** — where a settlement can go)
touches either 1, 2, or 3 tiles. A 3-tile spot is what you want: it collects
three resources' worth of dice rolls. Reshape the *same* tiles into a spikier
outline and the tile count doesn't change — but 3-spots get converted into 1-
and 2-spots.

**Terms used below:**

| Symbol | Meaning |
|---|---|
| `A` | number of land tiles |
| `S` | number of land-to-land tile edges (how many pairs of tiles touch) |
| `v1 / v2 / v3` | count of 1-, 2-, 3-resource intersections |
| `Smax` | the highest `S` possible for `A` tiles (a perfectly round blob) |
| `L` | enclosed lakes — separate bodies of water, however many hexes each spans |

These counts are locked together by simple counting — a consequence of
**Euler's formula**, the rule that says a shape made of flat faces meeting at
edges and corners always balances out a certain way (the same idea behind why
a soccer ball's pentagons and hexagons always add up correctly):

```
v3 = S − A + 1 − L
v2 = 3A − S − 3 + 3L
v1 = 3A − S + 3 − 3L        (the generators fill lakes, so L = 0)
```

**So `v3` depends only on `S`.** Shape matters *only* through how many tile
edges it creates. The maximum is `Smax = ⌊3A − √(12A − 3)⌋`; every edge short
of that destroys one 3-spot and manufactures one 1-spot *and* one 2-spot. That
one relationship is the whole problem.

## The approach

One shared engine, three ways to build a continent, plus a manual draft mode:

| Mode | Frame | Ports | Compactness rule |
|---|---|---|---|
| **I — Open Sea** | none | 9 loose, on coast | Floor = your slider, honestly |
| **II — Sea Lanes** | 5–6 player border, base tiles only | 11, on frame | Floor − 5%, never below 0.80 (your ship rule pays some back) |
| **III — Surveyed** | none | 9 | Floor = `max(slider, 0.95)` — always tight; every seat opens with ore + wheat, either profile |
| **Draft** | either | matches context | not enforced — only measured live |

Whichever way land gets placed, the same pipeline finishes the job:

1. **Compactify** — hill-climb tile positions to raise `S` toward the floor.
2. **Place ports** — walk the outer coastline (lake shores excluded), space
   the slots evenly, and make a first pass at siting each 2:1 port near (not
   on top of) its resource.
3. **Anneal terrain + numbers + ports** — simulated annealing (below) against
   a scoring function. Ports can swap slots, so the 2:1 siting survives the
   terrain moving around.
4. **Score** — simulate a real snake draft and report the result.

## What "simulated annealing" means

Annealing is a metallurgy term: heat metal, then cool it *slowly* so atoms
settle into a stable, low-energy arrangement instead of freezing wherever they
happened to be. The algorithm borrows the idea:

- Start with terrain/numbers randomly placed on the fixed tile positions.
- Each step, try a random swap (two tiles, two number tokens, or two ports).
- A swap that makes the board *better* (lower penalty) is always kept.
- A swap that makes it *worse* is still sometimes kept — with a probability
  that shrinks as a "temperature" value cools over the run.

That last rule is the whole point. A plain hill-climb (only ever accept
improvements) gets stuck the moment every single swap looks worse, even if a
genuinely good board is two swaps away. Annealing tolerates bad moves early
(high temperature) and only tightens up near the end (temperature → ~0, which
is effectively a hill-climb by that point). This is why it needs thousands of
passes rather than one clever calculation.

## The scoring function (what "better" means)

Every candidate board gets a penalty score — lower is better:

- **Hard rules** — a 6 touching an 8 (or another 6/8) is penalized heavily;
  so are duplicate adjacent numbers and same-resource clumping.
- **Resource balance** — pips should track tile *count* per resource, not be
  forced equal (ore/brick legitimately have fewer tiles, so fewer pips is
  correct, not a flaw).
- **Port siting** — each 2:1 port wants its resource about two hexes away:
  near enough to matter, far enough that one settlement can't hog both.
- **Draft fairness** — the engine actually simulates a 1→N→1 snake draft
  (players greedily grabbing the best open spot) and penalizes boards where
  the best and worst seat end up far apart.
- **Seating quality** — can all `2 × players` best spots actually be claimed
  without conflicting with each other?

## Code breakdown

One self-contained file, `catan-pangea/index.html` (~2,550 lines): hex-grid
math → topology/counting → continent growth → ports/sea-lanes → the scoring
function → the annealer → the SVG renderer → the analysis panel → the draft
mode's turn-based state machine. No build step, no dependencies — it opens by
double-click and runs entirely in the browser.

## Tabs and sliders — what they actually change

| Control | Effect |
|---|---|
| **Tabs I / II / III** | Pick the board-shaping strategy (see table above) |
| **Draft tab** | Hand-place tiles yourself; engine only auto-places numbers + ports after |
| **Land tiles** | `A` — how many hexes are in play |
| **Compactness floor** | Target `S / Smax` — directly controls how many 3-spots you're guaranteed |
| **Players** | How many seats the fairness simulation and port math optimize for |
| **Balance profile** | C&K weights forest/pasture/mountains higher (they yield commodities); Base treats terrain evenly |
| **Ship-to-port rule** | Flat = every port equally reachable by any ship; Per hop = distance actually matters (Seafarers-style) |
| **Annealing passes** | More = tighter optimization, longer wait (diminishing returns past ~15,000) |
| **Board overlays** | Visualize what the numbers already imply (spot quality, simulated settlements, sea lanes) |
| **Seed** | Same seed + settings = identical board, every time |
