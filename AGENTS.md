# Agent instructions

Start with [context.md](context.md): the game, the map math, the code
structure, the data model, how to extend, and the changelog.

- Update `context.md` in the same change as every feature or fix
  (relevant section + a changelog entry).
- Run `npm test` before committing (Node 22+); no build step, no runtime
  dependencies.
- Keep `src/engine/` and `src/game/` free of DOM access.
- `main` is protected: changes reach it only through a pull request, which
  merges once its "npm test" check passes (nobody can skip that) and the
  owner approves it. Merging deploys the live site. Work on a branch or a
  fork — never push to `main`.
- Never write to the live database. When you run the app, add
  `?store=local` to the URL (a plain local run reads and writes the live
  game's data); no REST or curl calls to `catan-pangea-default-rtdb`
  either. The tests use an in-memory store.
- Don't change `catan-pangea/src/sync/firebaseConfig.js` in a pull request.
