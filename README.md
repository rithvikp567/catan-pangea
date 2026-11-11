# Catan Pangea

Random-continent Catan map generator for game night: free-form continents
with the coastline kept tight, numbers and ports optimised for a fair draft.
Two board types — **Open Sea** and **Sea Lanes** — built mobile-first.

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

## Test

```bash
npm test
```

Runs the engine test suite with Node's built-in test runner (Node 20+).

## Deploy

Pushing to `main` runs the tests, then publishes `catan-pangea/` to GitHub
Pages via `.github/workflows/deploy-pages.yml`.

## How it works

See [catan-pangea/OVERVIEW.md](catan-pangea/OVERVIEW.md) — the math, the
generator pipeline, the settings, and the code layout — or tap **?** in the
app.
