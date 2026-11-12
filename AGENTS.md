# Agent instructions

Start with [context.md](context.md): the game, the map math, the code
structure, the data model, how to extend, and the changelog.

- Update `context.md` in the same change as every feature or fix
  (relevant section + a changelog entry).
- Run `npm test` before committing; no build step, no runtime dependencies.
- Keep `src/engine/` and `src/game/` free of DOM access.
