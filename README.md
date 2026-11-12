# Catan Pangea

Random-continent Catan map generator and live game tracker for game night:
free-form continents with the coastline kept tight, numbers and ports
optimised for a fair draft, and a shared scoreboard (VP, knights, karma,
robber, honour coins, season wins) synced across everyone's phone. Two board
types — **Open Sea** and **Sea Lanes** — built mobile-first.

**Developers and agents: start with [context.md](context.md).**

No build step and no runtime dependencies: plain ES modules, served as static
files.

## Run it locally

ES modules don't load from `file://`, so serve the folder:

```bash
npm start
```

Then open http://localhost:8000. To try it on your phone on the same Wi-Fi:

```bash
HOST=0.0.0.0 npm start
```

To try several "phones" on one computer without touching the live game,
open tabs with `http://localhost:8000/?store=local&device=alice`,
`?store=local&device=bob`, …

## Syncing between phones

The tracker syncs through the Firebase Realtime Database configured in
`catan-pangea/src/sync/firebaseConfig.js` — the same database the live
site uses, **including when you run it on localhost**. Add `?store=local`
to the URL while testing so you don't edit the real game. A fork can point
at its own project (setup takes about five minutes — see
[context.md → Firebase setup](context.md#firebase-setup-needed-for-phones-to-sync))
or set the config to `null` for "this device only" mode.

## Test

```bash
npm test
```

Runs the engine test suite with Node's built-in test runner (Node 20+).

## Deploy

Pushing to `main` runs the tests, then publishes `catan-pangea/` to GitHub
Pages via `.github/workflows/deploy-pages.yml`.

## How it works

See [context.md](context.md) for the full technical picture (math,
architecture, data model, changelog), [catan-pangea/OVERVIEW.md](catan-pangea/OVERVIEW.md)
for a player-facing overview, or tap **?** in the app.
