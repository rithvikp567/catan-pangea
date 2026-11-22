Read @context.md before making changes — it describes the game, the math, the
architecture and the data model. Keep it up to date: every feature or fix
updates the relevant section and adds a changelog entry in the same change.

Run `npm test` before committing (Node 22+). No build step and no runtime
dependencies. Keep `src/engine/` and `src/game/` free of DOM access.

`main` is protected: changes reach it only through a pull request, and
merging deploys the live site. A pull request merges once its "npm test"
check passes — nobody can skip that, the owner included — and the owner
approves it; the owner's own pull requests (an author can't approve their
own) merge with `gh pr merge <n> --merge --admin`, which skips only the
approval. Work on a branch or a fork — never push to `main`, and don't
change `firebaseConfig.js` in a pull request.

Never write to the live database. When you run the app, add `?store=local`
to the URL: a plain local run reads and writes the live game's data. No
REST or curl calls to it either.
