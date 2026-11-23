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
   player's honor coin, with a victory screen and season win tallies. Several
   games can run at once: each is a **room** in *Today's games*, with the
   house rules (**mods**) picked when it's made — and knight duels
   (**Battle**) between the players in it.

Plus a **music bar** that plays the table's YouTube / YouTube Music
playlist docked under the map and tracker, so the phone that's cast to the
TV can show the board and play the music at the same time — one shared
player for the table: every phone shows the same song and controls it,
and the sound comes from one device.

It is used mostly **on phones at game night**, so the UI is mobile-first,
and it **installs as an app** from the browser (no app store): full screen,
no browser bars, and it opens with no signal.

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
| **13 VP to win** | Tracker caps VP at 13 and shows Victory / Defeat — 10 on a base-game board, or any 5–20 a room picks (its **Points to win** mod). |
| **Knights, per island** | Two shared counters, **Main island** and **Off island**, each 0 … 12 × players on its own. (A tiered version — mighty / strong / basic with a derived knight strength — was tried in 2.1.0 and reverted in 2.1.1 as too much for the table.) |
| **Cities** | A shared counter, 0 … 4 × players (city pieces in the box). |
| **Karma** | A shared ± number (homebrew; the app only tracks it). With the robber, the **Karma & Robber** mod. |
| **Robber points** | A shared value, 1 … 3, starting at 1: **Abstain** adds 1 to karma and makes it one more (up to 3, where it stays); **Rob** subtracts it from karma and starts it over at 1. |
| **Honor coin** | Each player has a coin: heads = honorable (start), tails = dishonorable. Only its owner can flip it; everyone sees it. |
| **Walker** | The **Walker** mod. The word **WALKER**, shared: one letter per 7 rolled with the barbarians (counted by hand with + / −). **+** on the full word starts it over at 0. As it fills, every phone snows (8-bit pixel snow, frost creeping in from the edges); back to 0, the winter fades away. |
| **Knight duels** | The **Battle** mod (Cities & Knights boards). Each player holds cards 1–6; a duel is card + knight level (basic 1, strong 2, mighty 3), higher wins, a tie is a standoff. A played card is spent until all six are, then they all come back. The one challenged can **Retreat** instead (the knight moves away and stays active). |

---

## 2. Quick start

```bash
npm start          # then open http://localhost:8000/?store=local (zero-dependency Node static server)
npm test           # node:test suite (Node 22+: `node --test` takes globs from Node 21)
HOST=0.0.0.0 npm start   # also reachable from a phone on the same Wi-Fi
```

- ES modules don't load from `file://` — always serve the folder.
- **The service worker runs on localhost too** (`sw.js`, network first, so
  you always get your latest files while the server is up). Add `&nosw`
  (after `?store=local`) to skip registering it; to drop one that's installed, use the browser's
  DevTools → Application → Service workers → Unregister.
- **⚠ Localhost talks to the live database.** The committed Firebase config
  is the real game's, so a page opened without `?store=local` reads and
  writes the same data as everyone's phones. **Keep `?store=local` in the
  URL** (`npm start` prints the address that way) — it forces the "this
  device only" store (`createStore.js`) and the pill shows *This device
  only*. Add more parameters with `&`: a second `?` turns `store` into
  something else (`local?nosw`), and the page quietly goes live.
- **Several "phones" on one computer:** on localhost, add `&device=<name>`
  too (e.g. `http://localhost:8000/?store=local&device=alice`, another tab
  with `?store=local&device=bob`). Each tab gets its own identity and the
  tabs share one device-only store, so the whole multiplayer flow can be
  exercised locally without touching the live game.
- **Deploy:** merge a pull request into `main` — direct pushes are blocked
  (see Contributing, next). `.github/workflows/deploy-pages.yml` runs
  `npm test` on every push to `main`, then publishes the `catan-pangea/`
  folder to GitHub Pages.

### Contributing (`main` is protected)

Changes reach `main` — and so the live site — **only through a pull
request**. Two repository rulesets (GitHub → Settings → Rules → Rulesets)
guard it, and a pull request can merge only once:

- its **npm test** check has passed — `.github/workflows/test.yml` runs
  `npm test` on Node 22 for every pull request into `main`. The ruleset
  **Require tests** has no bypass: nobody skips this, the owner included —
- and someone with write access (in practice the owner) has **approved**
  it. New commits pushed after an approval dismiss it.

**Protect main** holds the approval rule and blocks pushing to `main`,
force-pushing and deleting it. The owner (the repository admin) may bypass
it, but **only when merging a pull request**, never by pushing to `main` —
that's how the owner's own pull requests merge, since an author can't
approve their own: `gh pr merge <number> --merge --admin` (a plain
`gh pr merge` is refused). It skips only the approval: until the check has
passed, the merge is refused anyway.

**The flow:** fork the repo (or, as a collaborator, push a branch) → make
the change, updating this file in the same change (the section it touches
and a changelog entry) → `npm test` → open a pull request into `main` → the
check runs on it → the owner reviews, approves and merges → the deploy runs
the tests again and publishes the site, about a minute later (the *Deploy
to GitHub Pages* run in the Actions tab shows whether it went out). Phones
get it the next time the app loads — a fresh start or a reload; an app left
open keeps the old version until it's reopened (`sw.js` fetches fresh files
first).

- **First-time contributors:** until someone has had a commit or pull
  request merged here, every push to any of their pull requests from a
  fork waits for the owner's approval before the npm test check runs (on
  the pull request: *Awaiting approval* → **Approve workflows to run**).
  Until each push is approved the check doesn't run, so the pull request
  can't merge (the repository's *require approval for first-time
  contributors* setting). Runs left unapproved for 30 days expire as
  failed: push again.
- **If the check fails:** open **Details** beside it for the log, fix it,
  run `npm test` and push to the same branch — the check runs again (and
  any earlier approval is dismissed). If GitHub says the branch has
  conflicts (usually this file's changelog), merge `main` into your branch
  (keep both changelog entries, newest first) and push. A pull request
  whose base was changed to `main` afterwards gets no run: push a new
  commit, or close and reopen it.
- **Test the app with `?store=local`** (above): a page opened without it
  plays with the real game's data. Contributors and their agents never write to
  the live database by any route (§7).
- **Don't change `firebaseConfig.js` in a pull request:** merged, it would
  point the live site at another database. A fork that runs its own copy
  keeps its config on its own branches (Firebase setup, step 6).

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
6. Commit and push to your fork (this repository's protection doesn't
   apply there) — but keep this change out of pull requests to this
   repository: merged, it would point the live site at your database. For
   the fork's own site, enable Actions on the fork and set Settings → Pages
   → Source to GitHub Actions. The tracker's pill turns green: **Live**.

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
- **Map score** (0–100, four parts of 25) at the top of Settings, as **one
  quiet line** (2.13.0, `ui/ScoreCard.js`): the total (*92 / 100*), a dot
  for each part — a ring filled as far as the part scored, in the accent
  as text (`--accent-text`, which always reads; a custom fill may be
  see-through) — a chevron, and the seed with its copy button on the right
  (under the score when the column is under 280 px wide — a container
  query; the longest generated seed, *meridian-0000*, fits beside it in
  the 340 px desktop column; a longer typed one is cut short, its tooltip
  the whole seed). A tap on the score opens the four parts as bars
  underneath (Compactness, Seating quality, Draft fairness, Number
  balance) and closes them again; it slides like Advanced (at once under
  *reduce motion*; a tap mid-slide turns it round where it is) and stays
  open or closed through new maps (built once, updated in place; hidden
  until the first map). It fades while a map is being made and comes back
  when that's done — made or not. Screen readers hear each new map as one
  sentence from a status line of its own (*Map score 92 out of 100. Seed
  cinder-4821.*); the card isn't a live region. Before 2.13.0 it was a big number over the bars,
  always open, with a verdict pill (*Playable as dealt*). The board itself
  stays clear (the score chip over it went in 2.6.0 — on phones the score
  is one tap away behind Settings).
- Phone landscape: the board on the left, a slim rail on the right (188 px:
  brand, icons and board type, each on a tile; then Settings and Tracker
  side by side at 36 px and New map across both at 38 px) — sized to fit
  the ~300 px a browser leaves in landscape.
- **The top bar is tiles** (2.13.0), like the cards: on a phone, Pangaea
  (who's signed in under the name) on one, the icons on another beside
  it, and the board type (Open Sea / Sea Lanes) across the row under
  them; on desktop see Desktop. Pangaea's tile gets the room its name and
  who's signed in need first, short of squeezing the icons under 26 px
  each; the icons share the rest, up to 40 px each. (`padding:0` is what
  lets them shrink to their 26 px minimum — a button's own padding held
  them at 32 px and cut the name short: *R · Sign out* on a 360 px phone;
  the grid track inside each, `minmax(26px, 40px)`, gives it 40 px where
  there's room; and the board type's row has `contain:inline-size`, or
  its switch would hold the icons' column ~175 px wide — 32 px icons
  with five of them, in the installed app.) A 7-letter name is whole on a
  360 px phone; a longer one can still end in … once the icons are at
  26 px. With nobody's line yet (no game state), the name sits alone
  beside the logo.
- **New map builds itself in — on every device at once** (`BoardView`'s
  build animation): the tiles fly in from off screen, spinning, the middle
  of the island first, each landing with a wooden clack; then the number
  tokens fly in face down (grey, a small hex on the back), flip over and
  land face up with a pop; then the ports pop in round the coast (~4 s in
  all). It's Web Animations on the drawn SVG — the markup never changes, so
  a saved image is unaffected (the grey backs are removed once turned).
  - **In step everywhere:** the device that pressed New map publishes, with
    the map, when the build starts — `meta.buildAt`, on the server's clock,
    0.8 s ahead (`BUILD_LEAD_MS` in `App`) so the map has reached everyone
    by then — and every device runs the build from that moment: the same
    order, spins and pitches (seeded from the map's seed + `buildAt`), the
    sounds lined up with it. A device that hears late starts part way
    through and skips the sounds gone by; one that comes back after it's all
    over just shows the board. Measured locally with two windows: the
    builds started within 7 ms of each other, the sounds within 1 ms.
  - **Sounds** (`ui/Sound.js`, made with Web Audio, no files) play on
    **every device with the app open** — the animation where the map is on
    screen, just the sounds elsewhere (the tracker, season wins) — once a
    tap there has allowed sound. A board restored at load just appears.
    *Reduce motion*: no animation, the sounds still play.
  - **Map animations** and **Sound effects** are switches in *Settings →
    Player Settings*, each person's own (next section). Map animations off:
    a new map just appears on their devices, like *reduce motion* (the
    sounds still play unless Sound effects is off too). Sound effects off:
    no sound effects on their devices (the build and the welcome's fanfare;
    never the music); turning them back on plays one pop, so you know they
    work. (2.11–2.12 had a volume button in the map's corner, per device —
    a device muted with it stays muted while nobody's signed in there.)
- *Advanced* and *Player Settings* in Settings slide open and shut (their
  + turns into ×).
- Save / share the board as a PNG (share sheet on phones, download on desktop).
- **Player Settings** — each person's own accent color and theme (from the
  lists or any color off a color wheel), map animations and sound effects,
  following them to every device they sign in on (next).
- "How it works" dialog explaining the math.

### Player Settings: colors, animations, sounds; cards and tiles

- **Settings → Player Settings** (the bottom of Settings, a drop-down like
  Advanced, closed at first; `ui/PlayerSettings.js`). Inside: **Accent
  color**, **Theme**, and the switches **Map animations** and **Sound
  effects** (above). Eight accent colors — **Graphite** (the ink color:
  the original black-and-white look, the default), Sea, Harbor, Forest,
  Wheat, Brick, Plum, Rose — color the filled buttons (New map, play, Rob),
  the outlines (cards, buttons, fields), whatever's picked or playing (a
  switch's choice, the song playing, a pressed button) and the focus ring.
  Six themes in two families — **Light**, **Sand** (warm, like an old
  map), **Mist** (cool grey-blue); **Dark**, **Hearth** (warm, firelit),
  **Midnight** (deep blue). Someone who never picked a theme sees Light or
  Dark as their device is set, following a change, and that one shows
  picked (the *Match device* choice of 2.12.0 is gone; it's still the
  default underneath — `"system"` in `game/looks.js`); a tap on it saves
  it, so their other devices show it too (`SegmentedControl`'s `onSame`). Each swatch and
  theme preview is drawn in its own colors.
- **Custom colors:** after the accents a ninth swatch, and after the themes
  a **Custom** tile, open a **color wheel** (`ui/ColorPicker.js`, a modal
  pop-up laid out round the music like every overlay): hue round the
  wheel and saturation out from the middle (drag, or the arrow keys on the
  knob), a **Brightness** slider, an **Opacity** slider (5–100 %), the
  color as hex (type one in: 6 digits keep the opacity set, 8 set it — never
  under the 5 % floor), a live preview (the accent: a filled button and a
  picked choice on this theme; a theme: a little page with a card and a
  button in the person's accent, worked out for that theme), and the
  person's **five most recent custom colors** (tap one to start from it).
  **Tried on as it's picked** (2.14.0): each time a color is settled on —
  the wheel or a slider let go, a hex entered, a recent color tapped, the
  arrow keys let go — the whole app shows it (not while dragging); it's
  saved nowhere until *Use color* picks it — not on the profile, not as
  `lastLook` / `lastPaint`, and Player Settings still shows what's picked
  (`LookSync.preview`, `ThemeController.set(look, { keep:false })`). A
  pick from another device meanwhile shows under it. Cancel, ×, Esc or a
  tap outside (pressed and let go outside the card — a drag that ends
  there doesn't count) puts back what was there. Beside the open music player it narrows rather
  than cover it. The custom swatch and tile show the person's custom color (a
  rainbow until they have one). The colors are worked out from the one
  picked (`game/colors.js`):
  - *A custom theme*: the family is whichever of black or white text reads
    better on the color; the background is the color over that family's
    own background, as strong as its opacity (100 %: the color itself,
    30 %: a tint of it), then moved toward white (light) or black (dark)
    just enough for the text to keep 7:1 (8:1 on a dark one) — a mid-tone
    gets a little lighter or darker than picked. The cards, lines, text
    and the board's sea are worked out from it, each text color kept at
    its contrast (ink ≥ 7:1, secondary ≥ 4.5:1).
  - *A custom accent*: the fill is the color as picked, opacity and all
    (over the card's color wherever it fills something, so it looks the
    same everywhere); the text on it is the theme's own if it reads at
    4.5:1, else white or black; the accent as text (what's picked or
    playing) is moved toward the ink until it reads at 4.5:1, and the
    focus ring is that color (never the raw fill, which may be
    see-through or the background's own color).
  - *A preset accent on a custom theme* goes through the same: its fill
    as `tokens.css` has it, the text on it, the accent as text and the
    focus ring worked out for that theme (the presets were only checked
    against the six themes). With Graphite, a custom theme's focus ring is
    the family's blue, moved toward the ink until it shows (3:1).
- **The top bar's light / dark button** swaps to the theme's partner in
  the other family (Light ⇄ Dark, Sand ⇄ Hearth, Mist ⇄ Midnight; from the
  default or a custom theme, Light or Dark — the opposite of what shows) —
  a pick like any other.
- **It follows the person, not the device** — all of it: the accent, the
  theme, the custom colors, the recent colors and the two switches.
  Signed in, a pick is saved on the profile (`profiles/{id}/look`, a
  transaction that merges the fields) and every device signed in to that
  profile switches to it a moment later — change it on the phone and the
  laptop follows. Signed out, a device keeps its own (each field under its
  own key in its storage); signing in shows the person's own instead (the
  device's isn't copied to the profile), and signing out brings the
  device's back, so a shared laptop or TV doesn't keep someone's
  settings. What the person never picked shows the default, so all their
  devices look the same. A pick shows at once and belongs to whoever made
  it: a run of picks (arrow keys through the themes) is saved once, 400 ms
  after it settles — or straight away when they sign out (or someone else
  signs in) first, or the page is hidden. `app/LookSync.js` decides whose
  settings apply, `ui/ThemeController.js` paints the colors as
  `data-scheme` / `data-theme` / `data-accent` on `<html>` (and a custom
  color's as properties on it), and `css/tokens.css` turns those into
  colors (§9). (No hint says where a pick is saved since 2.13.0.)
- **No flash on load:** a script in the head of `index.html` paints the
  look this device showed last (`lastLook`) — a custom one from the colors
  `ThemeController` saved (`lastPaint`) — and the browser bar's color,
  before the first frame; the person's own arrives with the game data.
- **The board follows the theme:** the sea, the gutters between the hexes
  (the map card's color), the tokens and the ports are recolored in place
  (`BoardView.recolor`), so a new map building in carries on; the saved
  image has the theme's colors. The snow has a palette for each family.
- **Cards everywhere:** the map and the music sit in cards like the
  tracker's sections — rounded, outlined in the accent's tint, a gap from
  the screen's edges (`--card-gap`: 12 px; 8 px under 370 px wide; 6 px on
  a phone on its side) — in every layout: the map; the music's player, its
  mini bar and its landscape column; the desktop column's music; the music
  half of the music & tracker view. The settings sheet, the song list and
  the playlist pop-up float above the music the same way.
- **Tiles in the top bar and the settings column** (2.13.0): the brand,
  the board type and the icons each sit on a tile (the card's look) — see
  *The top bar is tiles* above and Desktop — and on desktop the settings
  column is a card too, with the dock under it.
- **− and + buttons** are small beside the numbers: every counter on the
  tracker 26 px with a 13 px sign, the settings' steppers 28 px circles
  (40–44 px with 20 px icons before 2.13.0, then 30–32 px); the tap area
  reaches past each one, to 42 px (34 × 42 in the shared tiles, 8 px
  apart: one tile's + and the next one's − reach 4 px each into the gap).
  In the music & tracker view, where the
  tracker grows (a zoom), they don't grow with it: 32 px at most on screen
  (`split.css` divides by `--grow`).

### Game tracker (multiplayer)
- **The intro** (`ui/Splash.js`, markup in `index.html` so it's there from
  the first frame): every page load opens on *Settlers of Catan* in the
  middle of the screen — seven hexes fly together into an island, the 8
  pops on, the words rise, a gold rule draws under them — for at least
  2.6 s and until the game has loaded, then it fades into choosing an
  account. Someone already signed in and seated goes straight on to the
  welcome instead. A tap skips it. The music is held back while it's up.
- **The welcome**: picking your account shows **Welcome, Lord Sam** — an
  8-bit crown drops in, a little square-wave fanfare where sound is
  allowed — then fades into **Today's games** (below). After the intro, for
  someone seated in this device's room, it says "You're Blue" under the
  name and fades into the map. It covers the **whole
  window**: the music is put away while it plays (`setAway("welcome")`)
  and comes back as it fades out — on the device playing the music, the
  song pauses for those few seconds and plays on after (the same hold as
  Season wins).
- **Signed in**: the top bar shows **Sam · Sign out** — on desktop a tile
  of its own at the right, over the map's right edge; under *Pangaea* in
  its tile on a phone, where the icons need the row (`ui/AccountLine.js`).
  Sign out only forgets the profile on this device — the seat stays — and
  goes to choosing an account; nobody signed in reads **Sign in**.
- **Who's playing?** (`#/join`, 3.0.0: the profile only): a centred page —
  brand, "Who's playing?", then every profile as a list. Create one (**one
  per device**, username only — the limit is enforced, not explained on
  screen); pick one → the welcome → Today's games. Underneath: Admin · View
  map, and the sync pill (season wins are the top bar's trophy only). **The
  music is put away** while it's open (`setAway("join")`), held exactly
  like on Season wins (below): a play from another phone waits — *Sam's
  computer is on the sign-in screen — the music plays as soon as they
  leave it* — and plays once they're through (after the welcome).
- **Today's games** (`#/rooms`, 3.0.0, `RoomsScreen`): every open room,
  newest first — its name, a delete button (after a confirm: the game ends
  for everyone in it; season wins are kept), the board · players · seats
  taken, who's seated (an initial in their color) and its mods as chips
  (*Karma & Robber*, *Walker*, *Battle* — never on a base-game board —
  and the points to win). **Open** (seated there: the tracker once the
  game's under way, else the map), **Join** (pick a color) or **Watch** (no
  seat left). **New game** under the list. *No games yet today.* when
  there are none. The top bar's **Pangaea** (logo and name) comes back
  here. Rooms close by themselves **6 h after anyone last touched them**
  (`ROOM_TTL_MS`; every committed change in a room stamps its
  `activeAt`): whichever device notices deletes them
  (`GameService.pruneRooms`, at start and every 10 min), and anyone still
  in one gets *That game has closed.* and Today's games.
- **New game** (`#/mods`, `ModsScreen`): the room's name (*Sam's game*,
  *Sam's game 2* … suggested; unique among today's rooms, up to 24
  letters), then the mods as switches — **Karma & Robber**, **Walker**,
  **Battle** (all on at first) — and **Custom points to win** (off: the
  board's own, 13 or 10, shown greyed; on: a stepper, 5–20). **Create
  game** makes the room on the map on screen (or the one still being
  made) and goes on to pick a color. A room's mods are fixed once it's
  made.
- **Pick your color** (`#/seat`, `SeatScreen`): the room's name, board and
  seats taken, then the colors (taken ones disabled, with who has them) →
  **Join game** — *You're Blue in Sam's game* and the map (or the tracker,
  for someone changing color). A full room offers **Watch**. Colors are
  per room: Sam can be blue in one and red in another.
- **No music in the lobby** (3.0.1): on Today's games, New game and Pick
  your color the music is put away — no player, no mini bar, on a phone or
  in the desktop column (`setAway("lobby")`) — and held like on the
  sign-in screen: a play from another phone waits (*Sam's computer is
  picking a game — the music plays as soon as they leave it*) and plays
  once they're in a game.
- **A room's game = its map's seed.** Making a room publishes its map as
  that room's game; every phone in it shows that exact board. **New map**
  starts a new game for everyone in the room (after a confirm if anything
  is in progress): points, coins, counters and battles reset, **everyone
  seated keeps their seat and color** (if the new map has fewer seats, the
  players who don't fit pick again), **season wins are kept**. Outside a
  room the map is this device's own (nothing is published).
- **Tracker screen** (`#/tracker`, *Tracker* button in the dock): its header
  is two tiles, like the top bar's (2.13.0) — the back arrow with the title
  at the left, the sync status at the right; 40 px tall, so the header
  keeps the 48 px that `--tracker-chrome` counts (music and season wins live
  only in the top bar; who's signed in too — the meta line under the header
  is the room's name, the seed and the players, plus *Join as …* for
  someone not seated). It rises from
  the bottom with its cards following one by one (on desktop it docks in
  from the left), and slides away going back to the map.
  - **Fits one phone screen without scrolling.** The seat rows share the
    height the rest leaves (42–54 px each, from `100cqh` — the tracker is a
    size container, so the music bar, the mini bar and the browser's bars
    all count): `--tracker-chrome` in `screens.css` is the measured height
    of everything else (404 px since the walker row). When even 42 px rows
    don't fit (a phone with the music player open: ~430 px in Brave or
    Safari), `TrackerScreen` sets `data-fit="tight"`: the card titles step
    aside (still read by screen readers — the tiles name themselves), the
    two shared cards merge into one and the
    seed / "Playing as" line moves below the cards (the counters' buttons
    keep their size — 36 px there before 2.13.0)
    (`--tracker-chrome-tight`, 290 px — re-measured in 2.12.0: it said
    252, so the tight layout always scrolled ~38 px). Measured in headless
    Brave at 393 × 656: up to 4 players fit roomy with the music closed;
    with it open (its card takes 230 px) 3 fit, and 4 scroll ~30 px (5–6 a
    little more).
  - **The tiles follow the room** (3.0.0): Cities and Knights only on a
    Cities & Knights board, the Battle button only with the Battle mod, the
    karma tile only with Karma & Robber or Walker — titled by what's in it:
    *Karma and Robber & Walker*, *Karma and Robber* or *Walker*. Where the
    tracker is at least 400 px wide (a container query: desktop, a tablet)
    **Victory points & honor** is a square with **Cities and Knights** a
    square to its right (1.5 : 1, the same height; the knights' tiles
    stacked, Battle across the bottom with its name); without Cities and
    Knights it's a full-width rectangle again. On a phone they stay
    stacked. The measured height of everything but the seat rows
    (`--tracker-chrome`) is taken from the screen itself, so a tracker
    with fewer tiles has taller rows.
  - Victory points & honor — one row per seat (seat count = the map's
    player count): that player's honor coin in their color (only the owner
    can flip it; "Honorable" / "Dishonorable" under the name), then VP
    from 0 to the room's points to win (13 on Cities & Knights, 10 in the
    base game, or the room's own). **Anyone can edit any player's VP.**
  - Cities and Knights — three compact tiles in one row: Main island
    knights, Off island knights (each 0…12 × players) and Cities
    (0…4 × players), and **Battle** (crossed swords; below).
  - Karma, robber & walker — one row: Karma (±99, the digits stay centred
    with the sign hanging left) and the Robber's two buttons: **Abstain**
    (karma +1, and the robber one more — three pips show its value; at 3 it
    stays 3, and Abstain still adds the karma) and **Rob −N** (karma −N, the
    robber back to 1). A value changed from any
    phone pops for a moment. Under
    it, **− W A L K E R +**: each + lights the next letter (icy glow), and
    the lit letters shake harder and faster with every letter
    (`--amp` / `--rot` / `--dur`, from `JITTER` at the top of
    `TrackerScreen.js` — full word: ~2.7 px, 2°, every 0.2 s). + on the full
    word starts over at 0; − stops at 0; holding + doesn't spin it round.
  - **Winter** (`WinterEffect`, app-wide, every phone): as WALKER fills,
    8-bit pixel snow falls — specks, crosses, flakes, crystals and sparkles
    on a low-resolution canvas scaled up with hard pixel edges — and the
    flakes **blink** (gone for a few frames), **twinkle** (flash into a
    star) and **pulse** (breathe between two sizes). More, bigger and faster
    flakes with each letter, plus pixel frost creeping in from the screen
    edges (deeper in the corners, icicles along the top) and a faint cold
    tint. Going back down thins the snow and melts the frost; back to 0 it
    all fades out over ~3 s. How strong it gets: `STRENGTH` at the top of
    `WinterEffect.js` (snow, frost depth, frost opacity, tint), and `PEAK`,
    how far it goes by the last letter — 4/6 since 2.14.0, what the 4th
    letter used to show (at the 5th and 6th the frost crept in so far the
    tracker's buttons were hard to hit), each letter an even share of it. Drawn over the **whole window** —
    the frost frames every edge, the music bar and the mini bar included —
    with a hole cut exactly where the YouTube player is (`keepClear`, a
    clip-path: nothing may cover the player). Never takes a tap. Reduced
    motion: frost only. **Not on Season wins or the victory screen**
    (2.15.0): while either is up it fades out in 0.2 s and stops
    (`WinterEffect.setAway("wins" | "victory")`), and it comes back at the
    same level when they close — a letter added meanwhile shows then.
- **Battle** (3.0.0, the Battle mod, `ui/BattleOverlay.js`; the rules are
  `game/battle.js`): each player's own pop-up, laid out like the victory
  screen (never over the YouTube player; the mini bar is blurred behind
  it and out of reach — `MusicBar.setMiniBlur` — an open player never is).
  No hints or summaries in it: names, cards, knights and buttons.
  - **Battle** in the Cities and Knights tile opens **who to battle**:
    everyone else seated, each with their cards **1–6** — lit in their
    color while they have them, greyed and struck through once spent. Tap
    a name to challenge them (× or a tap outside closes it).
  - The one challenged gets a pop-up of their own — *Rithvik challenges
    you* — with **Retreat** (their knight moves away and stays active; the
    challenger sees *Sam retreated*) and **Fight**. A challenge nobody
    answers lapses after a minute (*Sam didn't answer.*); × on the
    challenger's side calls it off (*The battle was called off.* on the
    other's).
  - **Fight** opens the duel on both phones: the foe's cards (what they've
    spent), your **knight** — three circles in your color, one to three
    pips (basic, strong, mighty): the one you tap moves to the middle and
    the other two fold in under it; tap it again and they spread out —
    and your cards (the spent ones can't be picked). **Battle** readies
    you (it reads *Ready*); the foe's avatar rings once they're ready. A
    duel left unfinished for 3 minutes lapses; × calls it off.
  - Both ready: a quick **scuffle** (the two knights charge and clash,
    crossed swords, dust — 1.5 s; skipped under *reduce motion*), then the
    **result** — *Rithvik wins* (or *Standoff*) over each side's knight,
    card, name and total, a crown for the winner and a turd for the loser
    (Season wins' badges). × or it closes by itself after **5 s**.
  - A card is spent once played in a finished duel, until all six are —
    then they all come back (worked out from the room's battle history,
    so it can't be double-spent). One open battle per player; a new map
    clears them.
- **Logging in on another device:** pick your profile — *Welcome, Lord …*
  and Today's games, where your room says **Open**; the music is the
  table's, so it's already there (see Music). A device remembers its room
  (`Identity.roomId`), so a reload goes straight back in.
- **Victory screen**: when a seated player hits the points to win (13 VP on Cities & Knights), they see *Victory*,
  other seated players see *Defeat* (spectators see "X wins"). **Continue**
  returns to the tracker with numbers intact. If that player drops below 13
  and returns, it shows again. It wears Season wins' 8-bit badges
  (2.15.0, `ui/badges.js`, the same code and CSS): a big **crown** over
  *Victory* (and over "X wins"), a big **turd** over *Defeat* (both at
  1.5×, 3 px art pixels), and in the standings a crown for whoever is on
  13 (two on 13 both get one) and a turd for everyone else — in place of
  the color dots. It isn't redrawn while nothing it shows changes, so the
  badges animate on undisturbed. While it's up the **mini bar** goes
  (`MusicBar.setMiniAway("victory")` — only the mini bar: an open player
  stays where it is, and the screen still makes room for it) and so does
  the **winter frost**.
- **Season wins** (`#/wins`, the trophy in the top bar — the only way in;
  it opens out of the trophy, its cards following): wins per profile per calendar year (on a screen
  ≥ 700 px wide it's larger: up to 900 px across, taller rows and calendar
  days, bigger type — 2.13.0). Reaching
  the points to win (13 in most games) records a win; dropping back below them removes it (so corrections fix
  the tally). Once anyone has won that season, first place wears an 8-bit
  **crown** (a glint sweeps across it, it glows, sparkles twinkle) and
  everyone else gets a **turd** (stink rises off it, two flies buzz round
  it). A tie for first crowns everyone tied (`GameState.winsFor` marks
  them `leader`); a season with no wins shows neither. The art is pixel
  grids in `ui/badges.js` (one letter per pixel, outline added), the
  animation is CSS in `screens.css` ("season badges"), stepped in whole
  art pixels where it can, and stops under *reduce motion*. The list
  isn't redrawn while the standings are unchanged, so the animations
  aren't restarted by every tap in the tracker.
  - **Calendar** under the standings, the same width: one month at a time
    (Sunday first), each day showing who won that day (a chip in their
    color then; two at most, then "+N"), today outlined. **Swipe** it
    sideways or use **‹ ›** under it (from the first month with a win, or
    this January, to this month); moving into another year moves the
    standings to that season, and picking a season moves the calendar to
    its last month. **Tap a day** for a pop-up with everyone's points at
    each win that day (winner first, VP, their color, the time) — it fades
    in and out; ×, a tap outside it or Esc closes it. Points are recorded
    with each game win since 2.10.0 (`scores` in the ledger); older wins
    and wins an admin added say so instead. From `GameState.winHistory()`.
  - **The music is put away** while it's open — the player and the mini bar
    (`MusicBar.setAway("wins")`). A hidden player mustn't play, so the
    device playing the sound **holds** the music (`hold` in
    `music/playback.js`): paused for everyone, and it plays on when you
    leave. Someone else pressing play meanwhile doesn't bring the player
    back over the season wins (2.10–2.11 did) — the play waits: their
    phone says *Sam's computer has Season wins open — the music plays as
    soon as they leave it*, the bar reads *On Sam's computer (on Season
    wins)* with ⏸ (the music's on its way), and their pause takes the
    waiting play back. Leaving the season wins plays it if a play is
    waiting (`unhold`); Play here on a phone moves the sound there and
    plays it.
- **Admin** (`#/admin`, password `password` — not security, a shared
  management account): remove profiles (frees their seat, deletes their
  wins, lets their device create a new profile) and add/remove wins.
- Sync status pill: **Live** / **Offline** (changes queue and sync later) /
  **This device only** (no Firebase config).

### Music (YouTube playlist)

- **Closed, it's a mini bar** (a card) along the bottom of every screen (phones
  either way up, and desktop): the artwork and **Songs** (the song list,
  as a sheet above the bar) on the left, the title and artist **centred**
  in the middle under a small grip, and **⏮ ▶ ⏭** on the right (on a wide
  screen the song sits in the exact middle of the bar). **Swipe the song**
  sideways for the next (left) or previous (right) song — it follows the
  finger, slides off, and the new one slides in from the other side —
  or up for the player. Tap it (or **♪**) and the player pops open;
  its play opens the player and plays (on a remote it just plays — on the
  speaker — and ⏭ skips). Closing the player pauses the music — YouTube's
  rules don't allow playing from a hidden player — so the mini bar is the
  paused state, one tap from playing again. A 2 px line along its top edge
  shows the song's progress; on a remote its second line adds *On Sam's
  phone*. With no playlist yet it says *Music for the table*.
- The **♪** button (the top bar — its only place, beside the season wins'
  trophy) pops open the **music bar**, which slides in (up from the bottom;
  from the right in phone landscape, from the left on desktop) as the mini
  bar slides back in when it closes:
  the YouTube player (200 × 200 on phones, 16:9 on wider screens) with
  Previous / Play–Pause / Next, Shuffle, **Songs** (tap any song to play it;
  titles come from YouTube's oEmbed endpoint — no API key), **Playlist**
  (🔗) and Close. Songs and Playlist open as sheets above the bar, one at a
  time, and stay hidden otherwise.
- **Playlist** pop-up: *Where the music plays* (with **Play here** on a
  remote), **Refresh songs** (2.16.0 — see *Videos added on YouTube*
  below), change the link for everyone, and **Play in the YouTube Music
  app** under *Have YouTube Premium?* — the app plays in the background
  with no ads, so the bar pauses and closes and the map gets the whole
  screen (the other phones can't control the app). The pop-up keeps that
  button short — no description (2.8.0). It also links to YouTube sign-in:
  Premium removes ads *in this player* only when the embed can see you're
  signed in — works on Android Chrome; iPhone Safari's cross-site tracking
  protection usually hides the sign-in.
- **Docked on every screen,** in a card: along the bottom in portrait, a
  column on the right in phone landscape (the best way to cast to a 16:9
  TV: the 200 × 200 player with previous / play / next stacked beside it
  and the song and other buttons in one row under it, 270 px wide, so it
  fits a browser's short landscape view), the left column on desktop (see
  Desktop), or half the window in the music & tracker view (see below).
  The map and every screen shrink to make room — `MusicBar` measures how
  much of the window the card takes (the mini bar's, when closed): its
  size plus the gap between it and the edge (`footprint`), into
  `--music-h` / `--music-w`, and `css/music.css` applies them. On a narrow
  phone its buttons shrink a little to stay inside the card.
- **One shared playlist link** (`/v1/music`): paste a YouTube or YouTube
  Music playlist link once and every phone has it; anyone can change it
  from the 🔗 pop-up, and it switches for everyone (re-pasting the same
  link re-reads its songs — new ones show up — and the song playing
  carries on).
- **Videos added on YouTube** (2.16.0): the embedded player only lists a
  playlist's songs when it opens the playlist (no API key, so no other
  way to ask), so the shared queue is the list as it was when it was last
  read. It's read again — the same list, a new `music.setAt`
  (`GameService.refreshPlaylist`) — three ways:
  - **Refresh songs** in the 🔗 pop-up (it opens the player on that
    device if it was closed: the reading happens in a visible player), and
    a toast says what changed (*2 new songs added.* / *No new songs.*);
  - **once a game night on its own:** the first device to open the app
    once the list was read `REREAD_AFTER_MS` (6 h) ago asks for it
    (`playlistDue`, `music/playlist.js`), in a transaction that only bumps
    `setAt` if it's still the one it saw — ten phones opening at once
    re-read it once;
  - pasting the same link again (as before).

  Meanwhile the songs as last read play on (`MusicBar#queueReady` no
  longer needs the latest `setAt`; `#queueFresh` does). A remote with its
  player open reads the list straight away (its player isn't the one the
  music comes from); the speaker leaves it to them while the music plays
  — a new player would cut the song, and on a phone need a tap on the
  video — and reads once it stops, or, if it pressed Refresh songs
  itself, after a 6 s grace. If no device has its player open, the
  re-read waits for one. The song playing carries on at its place; new
  videos join the queue (in the playlist's order, or shuffled in with
  shuffle on) and removed ones drop out — if that was the song playing,
  the queue carries on from the same place in the list
  (`playback.load`). Reading needs a visible player: there is no hidden
  reader.
- **One shared playback** (`/v1/playback`, `src/music/playback.js`): every
  device shows the same song, the same order (shuffled or not — the order
  is stored, so it's the same everywhere), playing or paused, and the same
  time, with a **time slider** under the song. Anyone's play, pause,
  previous, next, shuffle, song in the list or slider changes it for
  everyone, as a transaction.
  - **One device plays the sound — the *speaker*** — normally the phone
    cast to the TV: the device that pressed play first (when there was no
    speaker yet). **It stays the speaker whatever anyone changes** — play,
    pause, skip, a song, a new playlist all play there; only **Play here**
    moves it. Every other device is a **remote**: its player shows the
    song, still (a remote's player never plays — no autoplay, no data),
    with **On Sam's phone** under the song; its buttons drive the
    speaker. Tapping that line opens the 🔗 pop-up's *Where the music
    plays* with **Play here**, which moves the sound (playing or paused,
    same spot). Someone tapping the video itself on a remote: it stops
    there at once, the music starts on the speaker if it was paused, and a
    toast says where it plays.
  - The **speaker follows** each shared change it hasn't followed yet
    (`now.rev`): loads / cues the song, plays / pauses, seeks when it's
    more than 3 s off. It also **reports back** what its player really
    does (`sync`, at most every 2.5 s): buffering or an ad held it back,
    someone used the video's own controls (seek, pause, play), the song's
    length. A song ending (or one YouTube won't play here) moves everyone
    on — once, however many times it's reported.
  - The speaker writes a **beat** every 20 s while its page is open —
    hidden too (a computer keeps playing in a background tab). A speaker
    silent for 70 s (closed, locked, offline) **isn't responding**: the
    clock stops where it was, nothing shows as playing, and remotes read
    *On Sam's phone · not responding* — but it's still the speaker (plays
    pressed meanwhile wait for it; a reloaded speaker is still it) until
    someone taps Play here. Closing the player on the speaker pauses it for
    everyone; a remote's play then opens the speaker's player again and
    plays.
  - Time is the **server's clock** (Firebase `.info/serverTimeOffset`,
    `GameController.now()`), so the slider reads the same on every phone:
    position = `pos + (now − at)` while playing.
  - Shuffle on: a fresh random order with the song playing first; off:
    the playlist's own order. The song carries on either way.
  - A new playlist's songs are read by whichever device has the player
    open (a player opened on the playlist lists them); the speaker waits
    6 s for someone else to do it, so it keeps its player — a phone's
    fresh player needs a tap on the video again.
- Screen mirroring (AirPlay, Chromecast "cast screen") carries the sound to
  the TV with the picture. While music plays the screen is kept awake (Wake
  Lock): a locked phone stops web audio.
- **Every device is already in step**, so logging in on another device
  needs nothing: the table's music is there (2.7.0 replaced the
  per-profile "pick up where you were" of 2.4–2.6).

### Installable app

- **Install from the browser, no app store.** Android Chrome and
  Edge: the phone icon at the top of the map (and **Install** on the
  welcome screen's *Get the app* card) opens the browser's own install
  dialog. iPhone / iPad: there is no install dialog — the icon and the
  card explain *Share → Add to Home Screen* (with *Open as Web App* on).
  Both disappear once it's running as the installed app; the card can be
  closed for good. **Desktop computers never see them** (a mouse or
  trackpad as the main pointer — `InstallHelper.computer`, so a narrow
  desktop window still counts and an iPad doesn't); the browser's own
  install icon in the address bar still works there.
- **Full screen.** `manifest.webmanifest` asks for `fullscreen`: on
  Android no browser bars and no system bars; iPhone treats it as
  standalone (no Safari bars; the clock and battery stay, tinted with the
  app's background — `apple-mobile-web-app-status-bar-style: default`, so
  the text stays readable in the light theme). The layout already pads for
  the notch and home bar (`viewport-fit=cover`).
- **Full screen without installing:** where the browser lets a page go full
  screen (Android browsers, iPad), a full-screen icon in the top bar does it
  (`InstallHelper.canFullscreen` / `toggleFullscreen`). **iPhone browsers
  can't** — Apple only allows a video to go full screen there, in Safari,
  Brave and every other iPhone browser alike — so on iPhone the installed
  app (Add to Home Screen, from Safari) is the only way to hide the bars.
  Not shown on desktop computers or in the installed app.
- **Opens with no signal.** `sw.js` keeps a copy of every file the app
  loads (and Firebase's SDK). Online it always fetches fresh files first —
  a deploy reaches everyone the next time they open the app; offline, or
  after 4 s on a bad connection, it uses the copy. The map generator works
  fully offline; tracker changes wait and sync when the connection is
  back (as before).
- **Icon:** a 7-hex island in the terrain colours with an 8 token, on
  black (`icons/`: 192, 512, maskable 512 with the island inside the
  safe zone, and the 180 apple-touch-icon; until 2.11.0 a dark teal sea).
  PNGs are committed — no build step; `scripts/make-icons.mjs` re-renders
  them from one SVG design with a headless Chromium browser. A phone keeps
  the icon it was installed with: on iPhone, remove the app from the Home
  Screen and add it again to get a new one (Android refreshes it by itself,
  within a day or so).

### Desktop (≥ 900 × 560)

- A **left column** holds the tracker and the music (in a card, like the
  map's; no line beside the column — the cards mark it). The music is the
  200 × 200 player with its controls beside it (YouTube's minimum size, so
  the song list gets the room): alone it fills the column with the whole
  song list underneath; with the tracker open the column splits —
  **tracker on top, music below**, locked (3.0.0: no handle between them):
  the tracker takes the height its tiles and rows need
  (`DesktopLayout.fitTracker`, from `TrackerScreen`'s own measure — fewer
  mods, a shorter tracker), its header in line with the top bar's tiles,
  and the music takes the rest (`compact`: the songs open as a sheet
  beside the column, until the music has ≥ 392 px (its card 380 px plus
  the gap under it) — `SONGS_FROM` — and the list moves in under the
  player, `column`). The
  map and the settings column sit to the right, and the map stays usable
  while the tracker is open (the **Tracker** button opens and closes it).
- **Tiles on top** (2.13.0): over the map, three tiles, 50 px tall —
  *Pangaea* at the left (lined up with the map's left edge), the board
  type (Open Sea / Sea Lanes) centred over the map — not the bar — and
  who's signed in at the right (lined up with the map's right edge). When
  the map is too narrow for the three in a row (the tracker or the music
  beside it: under 600 px), *Pangaea* and who's signed in keep the top
  row and the board type moves to a row of its own under them, still
  centred (a container query); narrower still (a 900 px window with the
  tracker open: under 300 px) the logo steps aside, and if that's not
  enough the two give way — their names cut short, never overlapping. Over the settings column, the icons sit on
  a tile of their own, spread across it. The settings column is a card,
  with Tracker / New map under it.
- **Even gaps:** the map is 12 px from the left column's cards and 12 px
  from the settings column (before, 24 px on the left: the column's cards
  and the map each kept a margin — now `.app` starts a gap's width inside
  `--left-w`).
- **Centred vertically:** every screen on desktop — the tracker in its
  pane (column or music & tracker view), season wins, admin — sits in the
  middle of its space when it's shorter, and scrolls from the top when it
  isn't (`.screen-inner`: `min-height:100%`, a centred flex column). The
  compact music pane centres its player and controls too.
- **Drag to resize**, with two handles: the column's width and the
  settings column's width (the split between tracker and music had a third
  until 3.0.0; each column
  handle sits in the middle of its gap and runs the window's full height
  — the settings one used to start under the top bar; a drag follows the
  pointer from where it took hold, so nothing jumps; if the window
  changes size mid-drag, the next move takes hold again in the new layout; also arrow
  keys when focused, Shift for bigger steps; double-click resets). Sizes are
  remembered per device and fitted to smaller windows. Limits keep the map
  ≥ 420 px wide, the column ≥ 380 px (the player and its controls side by
  side) and ≤ 759 px (`MAX_LEFT`).
- `DesktopLayout` decides and measures (body `data-desk` / `data-left`,
  `--left-w` / `--split` / `--music-top` / `--panel-w`);
  `css/desktop.css` lays it out. Phones never get any of it.

### Music & tracker view (desktop)

- **Hide the map.** The split-screen icon in the map's top bar (desktop
  only — 2.5.0 had it on phones too, where it was really just the tracker
  over the music bar, so 2.6.0 took it off them) hides the map, the
  settings and the dock, and gives the window to the **tracker and the
  music, half each** — opening either one if it was closed. Side by side
  when the window is wider than tall, **tracker on top and music below** in
  a portrait window.
- **The music half** (`wide` dock), a card like the tracker's: the YouTube player at 16:9 across the
  half (capped so the songs keep ~170 px; never under 200 px tall — on a
  narrow half it letterboxes rather than shrink), the song and the controls
  in one row under it (slightly smaller buttons on a half under 560 px —
  a container query on `.music`), then the song list filling the rest.
  The playlist pop-up and toasts open over the tracker half; the victory
  screen covers just the tracker half.
- **The tracker half** stays one column — the table prefers its vertical
  phone layout everywhere — and **grows to fill its half** (2.12.0, it
  used to sit at 640 px with wide margins): `TrackerScreen#grow` measures
  it at its own size and zooms it (CSS `zoom`, `--grow`, up to 2×) as far
  as the half's height allows, or its width at the narrowest, makes the
  column as wide as the half then leaves (`--grow-w`, up to 720 px) and
  keeps a small margin from the edges (`GROW` at the top of
  `TrackerScreen.js`). Dragging the bar between the halves regrows it;
  with no room to grow (tight) it stays a 640 px column in the middle of
  its half.
- **The bar between them** drags (mouse or touch; arrow keys when focused,
  Shift for bigger steps; double-click resets to half and half) and always
  shows a grip, since phones can't hover. The music half never gets smaller
  than its player needs (424 px wide side by side, 346 px tall stacked —
  its card included);
  the tracker's minimum (300 / 200 px) gives way first on a small screen.
  Side by side and stacked each keep their own share (`halves` /
  `halvesY` in the saved layout).
- **Ending it:** the tracker's back arrow ("Back to the map": the tracker
  and music stay docked beside the map), the back gesture, or closing the
  music. The view itself is remembered per
  device (`splitView`), so a reload on the tracker comes back to it; Enter
  doesn't make a new map while it's up.
- **Animated:** going in, the tracker half and the music half slide in from
  their sides (from above / below when stacked); coming out, the map fades
  back in (`data-view-anim` on body for a moment, `split.css`).
- `DesktopLayout` runs it too (`enterSplit` / `showMap` / `splitActive`):
  body `data-view="split"`, `data-axis` (`x` / `y`) and `--half` (the
  tracker's share in px); `css/split.css` lays it out. While it's up the
  desktop attributes are removed, so `desktop.css` and `split.css` never
  apply at once.

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
1.5·worst resource deviation)`. `scoring.js` also returns a verdict (≥ 78
"Playable as dealt", ≥ 58 "Acceptable", else "Re-roll advised"), not shown
since 2.13.0.

---

## 5. Code structure

```
catan-pangea/                       ← deployed as-is to GitHub Pages
  index.html                        markup shell + "How it works" dialog
  manifest.webmanifest              installable app: name, icons, full screen
  sw.js                             service worker: fresh files online, the last good copy offline
  icons/                            app icons (192, 512, maskable 512, apple-touch-icon 180)
  css/tokens.css                    color tokens: six themes in two families, eight accent colors, card sizes
  css/app.css                       map layout (phone portrait / landscape / desktop)
  css/screens.css                   join / tracker / wins / admin / victory / toast
  css/music.css                     music bar + how everything else makes room for it
  css/winter.css                    the WALKER snow / frost overlay
  css/desktop.css                   desktop left column (tracker + music), drag handles
  css/split.css                     music & tracker view (map hidden, two halves), desktop
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
    rules.js                        limits, colors, robber cycle, newSession(), validateName, ROOM_TTL_MS
    mods.js                         Mods: a room's house rules (immutable value object), points to win, the karma tile's title
    battle.js                       knight duels: cards, knights, strength, outcome, lapsing, the commands, spent cards
    GameError.js                    the error a rule refusal throws (its message is shown as a toast)
    GameState.js                    read-only view: profiles, rooms (RoomState), wins tally, season history
    RoomState.js                    read-only view of one room: seats, winners, taken colors, mods, battles
    GameService.js                  profiles, rooms (create, delete, prune), wins, music — store transactions
    RoomService.js                  one room's game: board, seats, VP, coins, counters, battles — store transactions
    looks.js                        Player Settings: theme / accent ids, names, families, the fields; clean / resolve a look
    colors.js                       custom colors: hex / HSV, contrast, a whole theme or an accent from one color, recent list
  src/music/playlist.js             pure: parsePlaylist (links → list id), player error meanings
  src/music/playback.js             pure: the shared playback — clock, speaker, commands (play, skip, seek, shuffle…)
  src/sync/                         STORE ADAPTERS (same contract, see MemoryStore.js)
    MemoryStore.js                  reference impl + contract docs (tests)
    LocalStore.js                   "this device only": localStorage + BroadcastChannel
    FirebaseStore.js                Firebase Realtime Database adapter (CDN SDK)
    firebaseConfig.js               public config of the live project (null = this device only)
    createStore.js                  picks the adapter; `?store=local` forces this device only
  src/app/                          APPLICATION LAYER
    App.js                          controller: map ↔ this device's room, wiring
    GameController.js               tracker facade for screens (state, me, intents, toasts)
    Settings.js                     immutable settings value object + UI presets
    Identity.js                     device id + current profile + current room (localStorage)
    LookSync.js                     whose Player Settings apply here, and where a pick is saved (the profile, or this device)
    InstallHelper.js                install button / iPhone how-to; registers sw.js
    Router.js                       hash routes: "" (map), join, rooms, mods, seat, tracker, wins, admin
    storage.js                      SafeStorage (never-throwing localStorage)
  src/ui/                           VIEWS
    BoardView.js                    SVG board renderer (concrete colors → exportable)
    SettingsPanel.js, controls.js   settings form; SegmentedControl, Stepper, CounterControl, holdRepeat
    ScoreCard.js, Sheet.js          the score's one line (settings; a tap opens its parts); settings bottom-sheet / drawer
    ThemeController.js, palette.js  paints the look on <html> (custom colors as properties; the browser bar); board colors
    PlayerSettings.js               Settings → Player Settings (accent, theme, custom, Map animations, Sound effects)
    ColorPicker.js                  the color wheel pop-up (brightness, opacity, hex, preview, recent colors)
    imageExport.js, Toast.js, dom.js  PNG/share; toasts; h()/s() DOM builders
    VictoryOverlay.js               victory / defeat screen (crown / turd badges; no mini bar or frost while it's up)
    BattleOverlay.js                knight duels: who to battle, the challenge, the duel, the scuffle, the result
    Splash.js                       the intro ("Settlers of Catan") and "Welcome, Lord …"
    Sound.js                        sound effects made with Web Audio (tile clack, flip, pop, fanfare): timelines, mute (Player Settings), restarts after interruptions
    AccountLine.js                  "Sam · Sign out" in the top bar
    MusicBar.js                     docked YouTube player (IFrame API) following the shared playback: speaker / remote, songs sheet, playlist pop-up
    WinterEffect.js                 8-bit snow + frost that build up as WALKER fills
    badges.js                       8-bit season badges: the crown (first place) and the turd (everyone else)
    DesktopLayout.js                desktop left column (the tracker fitted over the music) + its drag handles; the music & tracker view
    screens/Screen.js               base class for full-screen views
    screens/JoinScreen.js, RoomsScreen.js, ModsScreen.js, SeatScreen.js   who's playing; today's games; new game; pick a color
    screens/TrackerScreen.js, WinsScreen.js, AdminScreen.js, widgets.js
tests/                              node:test (engine, store, game service)
.github/workflows/test.yml          npm test on every pull request into main (the required "npm test" check)
.github/workflows/deploy-pages.yml  every push to main (a merged pull request): npm test, then publish catan-pangea/ to Pages
CLAUDE.md                           first stop for Claude Code: read this file, pull requests only, ?store=local
AGENTS.md                           the same rules for other coding agents
scripts/serve.js                    zero-dependency dev server
scripts/make-icons.mjs              re-renders icons/ from one SVG (headless Chromium; run by hand)
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
- `Screen` has two layouts: `"page"` (sticky header: `.screen-title` — the
  back button and the title — then the actions)
  and `"centered"` (no header, content in the middle of the screen; the
  subclass places `this.heading` — used by the welcome screen).
- **Transitions:** map → screen rises over the map (`data-enter="rise"`;
  the tracker from below, the season wins out of the trophy, the desktop
  tracker from the left, cards one after another); screen → screen keeps
  the backdrop opaque and only fades the content in (`data-enter="swap"`,
  set by `Router`); screen → map slides the screen away (`data-leave`, then
  hidden — `Screen.visible` is already false meanwhile). Never fade a whole
  screen in over another one — the map would flash through for a frame.
  Everything that moves stops under *reduce motion*.
- Native `<select>`s go through `selectField()` (`screens/widgets.js`): the
  browser arrow is hidden and a centred chevron drawn instead.
- DOM is built with `h()` / `s()` from `ui/dom.js`. `innerHTML` is used only
  for static, trusted SVG icons. User text always goes through text nodes.
- Style: modern JS (classes, private `#fields`), JSDoc types, no framework.
  Colors only via CSS tokens (`css/tokens.css`) except terrain colors in
  `ui/palette.js`.

### Map ↔ room flow (`App`)
- Each device is in at most one room (`Identity.roomId`; `GameController.room`
  is that room's `RoomState`, or null — also once it's expired).
- Boot: connect the store → first `GameState` (rooms past their 6 h are
  pruned). In a room: restore its board from the snapshot. Outside one:
  generate a map of this device's own, published nowhere; signed in, the
  app goes to Today's games, otherwise to Who's playing?.
- **New game** (the Mods screen) makes a room on the map on screen
  (`App.#createRoom` — waiting for a map still being made, or making one)
  and enters it.
- New map / mode switch / replay seed → confirm if `room.hasProgress` →
  generate → publish into this device's room (replaces its game). Outside a
  room it just shows.
- A room's game arriving from another phone, or a room just entered →
  `restoreBoard(snapshot)` (no annealing; identical board and score on
  every device — this avoids any cross-browser floating-point drift in
  re-generation). Only a new game in the same room builds itself in.
- A new game carries the seated players over (`carrySeats` in
  `rules.js`). If this device was seated before and isn't any more (the
  new map has fewer seats), it's sent to pick a color.
- The room gone (deleted, or expired) while this device is in it: *That
  game has closed.* and Today's games.
- If the store doesn't deliver a first state within 6 s, a local map is
  shown and a toast explains; the game attaches when the data arrives.

---

## 6. Data model (Realtime Database, under `/v1`)

```
v1/
  profiles/{profileId}:  { name, createdAt (ms), deviceId, look? }
              (look: the person's Player Settings, game/looks.js — { theme?, accent?, at (ms) } since 2.12.0;
               2.13.0 adds customTheme?, customAccent? ("#rrggbbaa"), recent? (up to 5 of them, newest
               first — an array, which Firebase may hand back as an object keyed 0, 1, 2…),
               animations?, sounds? (booleans); theme / accent may be "custom")
  rooms/{roomId}:                            ← today's games (3.0.0; before, one `session` — no longer read)
    info:     { name, createdAt, createdBy?, activeAt (ms — every committed change stamps it; 6 h later the
                room is pruned), mods:{ karmaRobber, walker, battle, vpToWin? } }   (game/mods.js)
    session:                                 ← the room's game
      meta:     { id, seed, players, createdAt, createdBy?, buildAt?, season }
                (buildAt: ms, server clock — when a New map starts building in on every device; 2.11.0+)
      board:    BoardSnapshot  { v:1, generatorId, request, tiles:["q,r|terrain|num"], ports:["edge|hex|type|res"] }
      settings: Settings#toJSON()   (settings.profile: "ck" | "base" — the points to win and whether there are knights)
      seats:    { s0:{ vp, honorable, profileId?, color? }, s1:…, … }   (keys "s0…" — numeric keys become arrays)
      counters: { knightsMain, knightsOff, cities, karma, walker (0…6), robber }
                (one key per COUNTERS entry; a missing key reads as 0, so older games keep working)
      battles/{battleId}: { from, to (profileIds), at, state:"asked"|"fight"|"retreat"|"done"|"cancelled",
                answeredAt?, picks?:{ [profileId]:{ level (1–3), card (1–6) } }, doneAt? }   (game/battle.js;
                a lapsed one is "asked" / "fight" left too long — worked out, never written)
  wins/{season}/{entryId}: { profileId, delta (±1), source:"game"|"admin", sessionId?, at,
                             scores?: { [profileId]: { vp, color? } } }   ← everyone seated, at a game win (2.10.0+)
  music:                   { listId, setAt (ms), setBy? }   ← the table's playlist (YouTube list id); setAt also moves when
                                               it's to be read again (Refresh songs, the nightly re-read — 2.16.0)
  playback:                                  ← the table's music, one shared playback (music/playback.js);
                                               watched on its own, not part of GameState
    queue:  { listId, setAt, songs:[videoId…] (the playlist's own order), order:[videoId…] (play order), shuffle }
    now:    { index (into order), videoId, playing, pos (s), at (ms, server clock), duration?,
              speaker? (deviceId), speakerName?, speakerKind? ("phone"|"tablet"|"computer"),
              held? (the speaker's deviceId), heldFor? ("wins"|"join"|"lobby"|"splash"|"welcome"), resume? (play once unheld), rev, by (deviceId) }
    beat:   ms                               ← the speaker's last "still here" (every 20 s; gone after 70 s)
  listening/{profileId}:   (before 2.7.0: per-profile music spots; no longer written — removing a profile still clears it)
```
- **Wins are a ledger** (shared by every room). A game win's entry id is `${sessionId}_${profileId}`
  (idempotent): written when VP goes <13 → 13 — with every seated player's
  VP and color at that moment (`scores`, for the calendar's pop-up) —
  removed when 13 → <13. Admin
  edits add `adj_…` entries with delta ±1. A profile's season total = Σ
  delta (never shown below 0). Season = the year the game started.
- Nulls are never stored (RTDB semantics); `prune()` in `MemoryStore`
  normalises writes identically for every adapter.
- **Concurrency:** every change to shared numbers is a transaction with the
  limits applied inside it (VP 0 to the points to win, knights 0–12×N per island, cities 0–4×N, karma ±99, walker 0–6 wrapping, color
  uniqueness, seat availability, one open battle per player, a card not spent), so simultaneous taps from several phones
  never lose updates or break a limit. Counter controls send **deltas**.
  Music commands are transactions on `playback` too (next is relative, so
  two taps skip two songs; a song's end is tied to its video id, so it
  counts once; the speaker's `sync` only applies to the `rev` it followed,
  so it never undoes a newer tap).
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
- Current room: `pangaea:roomId` (3.0.0) — the room this device is in
  (opened from Today's games, or made here); cleared when it closes.
- Player Settings on this device: `pangaea:theme`, `accent`,
  `customTheme`, `customAccent`, `recent`, `animations`, `sounds` (this
  device's own, applying while nobody's signed in — before 2.12.0 `theme`
  was the light / dark toggle's `"light"` / `"dark"`, which carry over as
  themes; a device muted with 2.11–2.12's volume button, `soundOff` in the
  App's storage, gets `sounds:false` once; signed in, the person's own
  apply instead), `pangaea:lastLook` (the settings shown last, which
  index.html's head script paints before the first frame) and
  `pangaea:lastPaint` (`{ theme, accent, scheme, vars }`: a custom look's
  worked-out colors, so the head script paints them without
  `game/colors.js`; null when neither is custom). With `?device=` on
  localhost they sit under that device's prefix, like the rest.

---

## 7. Testing

`npm test` runs everything in `tests/` with Node's built-in runner:
- `geometry.test.js` — hex math, Smax, Euler identities, outer coast, compactify.
- `tileSet.test.js` — tile/token sets for every size 13–30.
- `generators.test.js` — determinism, hard rules, port siting, ore/wheat
  floor, frame bounds, snapshot round-trip (identical board + score), abort.
- `store.test.js` — the store contract (`MemoryStore`).
- `game.test.js` — the tracker as several devices on one shared store, in
  a room: profiles, seats/colors, VP + win record/revoke, coins, knights,
  karma, robber (abstain: karma +1 and the robber up to 3; rob and reset),
  a room's game rotating (with `buildAt`; a closed room stays closed),
  admin, the points recorded with a win and `winHistory` (the calendar),
  and the look saved on a profile (merged by field, never bringing back a
  removed profile).
- `rooms.test.js` — rooms and mods: `Mods` (defaults, the clamp, the karma
  tile's title, the summary — no Battle on a base-game board), making and
  listing rooms (unique names today), expiry after 6 h and pruning,
  deleting, a removed profile freeing its seat in every room, the base
  game's 10 VP and a custom target, and battles: cards spent and coming
  back, the outcome, a lapsed challenge, the whole flow (a spent card, one
  battle at a time, retreat, calling off) and a new map clearing them.
- `look.test.js` — Player Settings: the lists, cleaning and resolving a
  look (custom colors, recent — an array or Firebase's object — and the
  two switches), the light / dark switch; custom colors: hex ⇄ HSV round
  trips, a custom theme from a grid of colors at several opacities keeps
  its text readable (ink ≥ 7:1 on the background and cards, ≥ 4.5:1 on
  the rest; secondary ≥ 4.5:1; the focus ring ≥ 3:1), a custom accent
  keeps 4.5:1 on every theme and on custom ones (its focus ring 3:1), every
  preset accent on custom themes too (as ThemeController works it out),
  filled controls put the accent over the card color, and the head script
  paints a saved custom look in a fake DOM; every theme and accent has
  its block in `tokens.css`, every combination keeps 4.5:1 contrast (text
  on the accent, the accent as text, the song playing — each color read
  from `tokens.css` the way the browser resolves it, `var()` and
  `color-mix()` included), and the accent's tints are mixed only inside
  `@supports`; `index.html`'s head script lists the same ids and each
  theme's `--bg` (the browser bar); and LookSync over GameController on
  one store: a pick on the phone shows on the laptop signed in as the same
  person, signed-out devices keep their own, what the person never picked
  shows the default, a run of picks is saved once, a pick is saved for
  whoever made it even if they sign out (or someone else signs in) within
  the wait — or while it's still on its way (never mixed into the next
  person's pick), a second pick during a save stays on screen and both are
  saved, `flush()`, the last look shows before the data arrives and a pick
  then waits for it, a removed profile isn't brought back (no toast; the
  pick stays on the device), and every Player Setting (custom colors,
  recent, the switches) follows the person to another device.
- `music.test.js` — playlist links (YouTube, YouTube Music, share links,
  private lists), player error handling, the shared playlist, and the
  shared playback: the clock, who's the speaker (play from a remote, Play
  here, a speaker going quiet, leaving), next / previous / a song ending
  (once), seek, shuffle (stored order, the song carries on), re-reading a
  playlist, the speaker's reports, holding the music while the speaker's
  player is put away (a remote's play waits, its pause takes it back, Play
  here moves it — on Season wins, the sign-in screen, the welcome after
  it and the lobby), and two phones on one store.

**In CI:** every pull request into `main` runs `npm test` on Node 22
(`.github/workflows/test.yml`, the check *npm test*), and the pull request
can't merge until it passes — nobody can skip it, the owner included (the
ruleset *Require tests*, §2 Contributing); the deploy runs it again after
the merge, before publishing.

UI is verified by driving the real app in a headless Chromium browser via
the DevTools protocol at phone sizes (two tabs with different `?device=`
values for multiplayer, **always with `?store=local`** so the run doesn't
write to the live game). Note: on the original dev machine Chrome's
DevTools protocol is blocked by policy; headless **Brave** works. For the
shared music, open each "phone" in a **window of its own**
(`Target.createTarget` with `newWindow:true`): a background tab is hidden,
and a hidden tab won't start a video. `YT.get(iframe.id)` gives the test
each page's player (state, time, video id).

**Owner only — contributors and their agents never write to the live
database.** If you ever need to check the real database end to end, the
Realtime Database REST API is open under `/v1` (e.g. `curl
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
  `RoomState.counters`, `hasProgress` and `RoomService.adjustCounter` all
  derive from `COUNTERS`; render it in `TrackerScreen` with the
  `tile(name, label)` helper (bounds follow the table size). Steps go
  through `stepCounter` / `stepWithin`, so a value saved past a later,
  tighter bound can still step back one at a time; `wraps:true` (the
  walker) makes + on the maximum go back to the minimum (pass `wraps` to
  `CounterControl` too). Adding a row of tiles makes the screen
  taller: `TrackerScreen` measures it (`--tracker-chrome`); check the
  phone still fits without scrolling (and `--tracker-chrome-tight`,
  measured with `data-fit="tight"`). Add a test.
- **New per-player stat:** add the field to seats in `newSession()`, read it
  in `RoomState.seats`, add a `RoomService` method using a seat
  transaction (through `#change`, so the room's `activeAt` is stamped),
  a `GameController` intent (`#inRoom`), render it in
  `TrackerScreen.#buildSeats`.
- **New mod:** a switch in `Mods.SWITCHES` and `Mods.DEFAULTS`
  (`game/mods.js`) — the Mods screen and the room's chips list it from
  there — then show or hide what it governs in `TrackerScreen#showMods`
  (and anywhere else it applies, read from `room.mods`). A mod that
  depends on the board (like Battle: knights) says so in `summary` and in
  `RoomState` (`battleOn`). Add it to `rooms.test.js`.
- **New screen:** subclass `Screen` (build once in `build()`, update in
  `render(state)`), register it in `App` (`this.screens`), navigate with
  `router.go(name)`.
- **New theme or accent color:** add it to `THEMES` / `ACCENTS` in
  `game/looks.js` (a theme needs a family and a partner in the other
  one), its block in `css/tokens.css` (`[data-theme="…"]`: the colors that
  differ from its family; `[data-accent="…"]`: `--accent-l` and
  `--accent-d`, plain hex), and in `index.html`'s head script: a theme's
  id and family in `FAM` and its `--bg` (the same hex as in its
  `tokens.css` block) in `BG`; an accent's id in `ACC`.
  `tests/look.test.js` checks that they all agree and that every
  combination keeps 4.5:1 contrast. (`custom` and `system` are taken.)
- **New Player Setting:** a field in `DEFAULT_LOOK` and `cleanLook`
  (`game/looks.js`, and `sameLook`'s keys), `DEVICE_KEYS` in
  `app/LookSync.js` (so a signed-out device keeps it), a control in
  `ui/PlayerSettings.js` (`onPick({ field })`, `sync` shows it) and where
  `App`'s LookSync `apply` uses it; extend the follow-the-person test.
- **New store backend:** implement the contract documented at the top of
  `sync/MemoryStore.js` and choose it in `createStore.js`.
- **Schema change:** keep old readers working or bump the root (`v1` → `v2`)
  in `GameService` and `database.rules.json`.

---

## 9. Known limitations & gotchas

- **`main` is protected** (the rulesets *Protect main* and *Require
  tests*, §2 Contributing): no pushes to `main` at all — work on a branch
  or a fork and open a pull request. The owner's own pull requests merge
  with `gh pr merge <n> --merge --admin`, which skips only the approval
  (the admin may bypass *Protect main* only on a pull request; *Require
  tests* has no bypass, so the merge is refused until the check is green). The
  required check is matched by its name, *npm test* — the `name:` of the
  job in `test.yml` — and by the GitHub Actions app (id 15368), so renaming
  that job (or giving the workflow path filters, so it doesn't run on every
  pull request) leaves pull requests waiting for a check that never comes:
  update *Require tests* with it. Keep `test.yml` on `pull_request`, never
  `pull_request_target` (under it the job checks out and tests `main`, not
  the pull request, so the check would say nothing about the change; and
  checking out the pull request's code there would run a fork's code with
  this repository's secrets and without the first-time-contributor
  approval). A pull request runs its own copy of `test.yml`, `package.json`
  and `tests/`, so it could turn its check green by editing them: review
  changes there closely. A pull request whose latest commit message
  contains `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]` or
  `[actions skip]` gets no run either — the required check never comes, so
  it can't merge: push a new commit without it.
- **Colors are tokens behind three switches** (`css/tokens.css`):
  `data-scheme` (light / dark) picks the family, `data-theme` a variant on
  top of it, `data-accent` the accent. The selectors are bare attributes,
  so an element carrying its own (the previews in Settings) shows that
  look inside it. `--primary` is gone (2.12.0): a filled button is
  `--accent` / `--accent-ink`, picked text `--accent-text`, the background
  of what's pressed or playing `--accent-soft`, outlines `--accent-line`.
  Graphite sets no `data-accent`, so those fall back to the original
  neutral look. The accent's tints (`--accent-soft`, `--accent-line`) are
  `color-mix()`, set inside `@supports`: a browser without it (iOS
  16.0–16.1, Chrome before 111) keeps the neutral ones, where an
  unparsable custom property would drop every outline and highlight. The
  board copies plain colors into its SVG (no `var()`, no
  `color-mix`). `index.html`'s head script must set `data-scheme` every
  time — nothing in `tokens.css` falls back on the system's dark mode — and
  read the same storage as LookSync (Identity's: `pangaea:`, or
  `pangaea:dev-<name>:` with `?device=` on localhost); its lists (themes'
  families, accents, each theme's `--bg` for the browser bar) are checked
  against `looks.js` and `tokens.css` by `tests/look.test.js`.
- **Custom colors are inline properties on `<html>`** (`ThemeController`
  sets `--bg`… and `--focus-ring` for a custom theme, `--accent-l` /
  `--accent-d` / `--accent-ink` / `--accent-text` / `--focus` for a custom
  accent, and only the last three for a preset one on a custom theme — its
  fills stay `tokens.css`'s, one for each family, which the other
  family's theme thumbnails in Settings inherit — and removes them when
  they don't apply), so they win over every `tokens.css` block. A
  custom accent is worked out against the theme showing, read with
  `getComputedStyle` after the theme's properties are set. `var()` in a
  custom property resolves where it's declared: `--accent` is computed on
  `<html>` from `--accent-l` / `--accent-d`, so a preview that sets only
  those must set `--accent` too (`accentPreview`). A custom accent may be
  see-through, so every filled control paints it over the card color —
  `background:linear-gradient(var(--accent), var(--accent)), var(--surface)`
  — never on its own, or it would look different on every background (and
  its text contrast was only checked over the card color). The head
  script paints a custom look from `lastPaint` only when it's for the same
  theme and accent as `lastLook`.
- **The desktop top tiles share a size container** (`.top-tile`, no tile
  look of its own: `container-type:inline-size`, with the grid on
  `.top-tile-in` inside it — a container query can't restyle the
  container itself). There `.brand` is `display:contents`, so its two
  parts — `.brand-mark` (logo and name) and `#account` — are tiles of
  their own in that grid, either side of the board type. On phones
  `.top-tile` and `.top-tile-in` are `display:contents` and `.brand` is
  the one tile (`.brand-mark` `display:contents` in its grid: the logo
  beside the name and the account line). A browser without container
  queries (before Safari 16 / Chrome 105) keeps the one-row layout, where
  the board type gives way and narrows rather than slide under a tile.
- **The music's size is its footprint:** `--music-h` / `--music-w` are the
  card's size plus its gap to the edge (computed `bottom` / `right`), from
  offset sizes, so the slide-in's transform never skews them. Anything
  docked at the bottom or right uses them, plus `--card-gap` for its own
  gap. The music's buttons size with container units (`.music-side` is an
  inline-size container), so they shrink on a 360 px phone instead of
  spilling out of the card; in phone landscape `.music-side` is
  `display:contents` (no container) and the fixed sizes there take over.
- **The database is open** (no auth): anyone who finds the project URL
  could edit or wipe data. Acceptable for a friends-only tool; if that
  changes, add Firebase Anonymous Auth and per-path rules.
- **Local runs hit production** unless the URL has `?store=local` (the
  config in the repo is the live one). Tests in `tests/` never touch it —
  they use `MemoryStore`.
- **Rooms** (3.0.0): each game is `rooms/{id}`; the old single
  `v1/session` is no longer read (a game in progress there when 3.0.0
  went out is simply left behind — nothing reads or deletes it). A room's
  mods are fixed when it's made. Rooms are pruned by whichever device
  notices they're 6 h stale, with a transaction per room that re-checks
  `activeAt`, so a room touched meanwhile survives. Every committed change
  stamps `activeAt` with a transaction on `info` that aborts when the room
  is gone, so a change racing a delete never brings a room back. The music
  is shared by every room (one playlist, one speaker), as are the season
  wins.
- **Battles are derived, not stored per player:** a player's spent cards
  are replayed from the room's finished battles (`spentCards`, in
  `doneAt` order), so there's nothing to get out of step. Two battles
  finishing in the same millisecond are ordered by id.
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
  stops on reload, app switch or a locked phone *of the speaker* (its beat
  stops too, so after 70 s anyone's play takes the sound).
- **Reading a playlist makes a new player.** YouTube's `loadPlaylist` /
  `cuePlaylist` keep the old songs once a player has had a playlist (only
  the link changes), so `MusicBar` destroys the player and opens a fresh
  one on the new playlist to read its songs (`#startReading`, polling
  `getPlaylist()` — there's no event). A phone's fresh player needs a tap
  on the video before it will play, which is why the speaker leaves the
  reading to another device when it can (6 s), and why a phone that
  insists on a tap shows *Tap the video to start*.
- **The installed app on iPhone has its own storage**, separate from
  Safari's: a new device id and no profile selected. Players pick their
  profile once on the welcome screen (seated players go straight back to
  the tracker). "One profile per
  device" means the installed app could create a *second* profile — fine,
  but an admin can tidy up.
- **Service worker:** network first for the app's own files, so there's
  no "stuck on an old version" — but only bump `CACHE` in `sw.js` when
  the caching strategy changes. A desktop Chrome install opens full screen
  too (manifest `fullscreen`); Esc / F11 leaves it. The browser's install
  dialog only opens from a real tap (`InstallHelper.install` catches it
  otherwise).
- **Winter is above the music bar (z-index 76) but never over the
  player:** `WinterEffect.keepClear(music.video)` cuts a clip-path hole
  (`polygon(evenodd, …)`, 1 px larger than the player) every frame while
  it snows and every 250 ms otherwise, so it follows rotation, docks and
  drag handles. Anything else that must never be covered: pass it to
  `keepClear` too.
- **YouTube player quirks we rely on:** `playerVars.start` /
  `startSeconds` are whole seconds; a player told where to start may
  buffer (state 3) before anyone presses play, so the speaker only judges
  PLAYING / PAUSED, never BUFFERING; and there is **no event** when a new
  player's playlist arrives — `#startReading` polls for it.
- **`Screen.build()` runs inside the base constructor**, before a
  subclass's `#private` methods exist — call only public methods from
  `build()`.
- **The tracker is a size container** (`container-type:size` on its
  screen, every layout): its seat rows use `100cqh`, and `TrackerScreen`
  switches `data-fit` from its own measured height (a `ResizeObserver`), so
  anything that takes height away — the music bar, the mini bar, a
  browser's bars — is handled the same way.
- **Grid items honour `z-index`** without `position`: the desktop
  settings column (z-index 30) sits above anything fixed below 31.
- **Screens get `deps.layout` after they're built** (`App` creates
  `DesktopLayout` after the screens, then sets it on the shared `deps`
  object), so read `this.deps.layout` when it's needed, never in `build()`.
- **Leaving the music & tracker view without a route change** (closing the
  music, the desktop back arrow) must call `router.refresh()`: the map's
  `inert` is only recomputed when a route is applied.
- **"Is the music playing?" is the shared playback, not the player.**
  `now.playing` is the table's intent; the speaker's player follows it and
  reports back only what lasts (a pause held 1.5 s; drift over 3 s), and
  never judges a player still settling (4 s after a load / cue, 3 s after
  play or a seek) — YouTube reports PAUSED → UNSTARTED → BUFFERING
  whenever it changes songs.
- **A play that lands while a song is still being cued is ignored** by
  YouTube. The speaker asks again when the player reports CUED
  (`playTries`) and every 2.5 s while the shared playback says playing; a
  phone that has never played (it needs its first tap on the video) gives
  up after 8 s and reports *paused*, so nobody sees a playing bar with no
  sound.
- **YouTube ads look like "not started".** Without Premium a song may open
  with an ad (or two): the player reports UNSTARTED while the *ad's* time
  runs. The speaker spots it (the time running steadily over two ticks
  while the song isn't PLAYING / PAUSED — a seek is a single jump), counts
  the player as working (no "tap the video" give-up), says *Ad — the song
  starts after it* under the song, and judges, seeks and re-cues nothing
  until the song itself plays; a remote's pause still pauses the ad. The
  shared clock runs through the ad, and the speaker's first report after
  it puts it back where the song really is. Ads never show on localhost:
  to test this, serve the checkout at the live address (CDP
  `Fetch.requestPaused` → `Fetch.fulfillRequest` with local files,
  `Network.setBypassServiceWorker`) in a fresh browser profile.
- **Players play one song at a time** (`loadVideoById` / `cueVideoById`),
  never YouTube's playlist mode — the order, next and the end of a song are
  ours, so they're the same on every device. A player opens on the
  playlist only to read its songs.
- **`seekTo` on a cued video starts it** — to move a paused, cued song the
  speaker cues it again at the new time instead.
- **Putting the music away** (`MusicBar.setAway(reason, on)`, reasons
  `"wins"`, `"join"` (the sign-in screen), `"lobby"` (Today's games, New
  game, Pick your color — 3.0.1; the route's reasons are `MUSIC_AWAY` in
  `App.js`), `"splash"` and
  `"welcome"` (the intro and the welcome, which cover the whole window);
  `heldFor` is the screen's reason before the intro's or the welcome's,
  and going from one screen's reason to the other's adds the new one
  before dropping the old, so the hold never lets go in between): body `data-music-away` hides the bar, the mini
  bar and its sheets (`music.css`), `--music-h` / `--music-w` read 0, and
  `DesktopLayout` drops the music column. Nothing creates, cues or plays a
  player while it's away (`#refresh`, `#tick`, `#startReading` all check).
  It never hides a playing player: the speaker **holds** the shared
  playback first (`#syncHold` → `hold` / `unhold`, now.held / heldFor /
  resume). While it's held, `play` from another device only sets `resume`
  (the song can change, the clock stays stopped) and `pause` clears it, so
  nothing ever needs the hidden player back; the speaker's own reports
  can't restart it either. A speaker that reloads while holding lets go once
  it's back on screen (`#syncHold` checks `held === me` on every refresh).
  A remote's play / pause button shows `wantsToPlay` (playing, or held with
  a play waiting). The 2.8.0 rule still stands: nothing moves the sound by
  itself — `unhold` only ever plays on the device that held it.
- **Hiding just the mini bar** (`MusicBar.setMiniAway(reason, on)`, the
  victory screen's `"victory"`) is not putting the music away: body
  `data-mini-away` hides `.music-mini` only, `--music-h` reads 0 while the
  player is closed, and `DesktopLayout` regains the mini bar's height
  (`miniHeight` is 0). The open player is untouched — nothing holds or
  pauses (the mini bar has no player in it) — so a play from another
  device can still open it over nothing: the victory screen makes room
  (`bottom:var(--music-h)`) as for any overlay. Closing the player while
  it's hidden leaves the mini bar hidden until the reason goes.
- **The intro is in `index.html`** (so nothing flashes before the JS
  runs); `Splash` takes it over and marks it `data-js`. Without JS it fades
  by itself after 9 s (a CSS fail-safe). It and the welcome are laid out
  round the open music player like every overlay; during the intro the
  music is held back anyway.
- **Sounds need a tap first, and can stop behind the page's back.**
  Browsers only let a page make sound after a tap, so `Sound` starts its
  AudioContext on the first pointer / key event and every sound before that
  is silent (a reload's intro and welcome have no fanfare). On an iPhone
  the audio also stops for a dialog (New map's *Start a new game for
  everyone?* confirm), a call, locking the phone or another app's sound —
  the context goes *suspended* or *interrupted* and stays there. So `Sound`
  restarts it on **every** tap (`pointerdown`, `pointerup`, `touchend`,
  `click`, `keydown` — on iPhone only the last few count as a tap), right
  after the confirm (`sound.wake()`), when the page is shown again, and
  before a timeline plays (waiting up to 0.6 s, then skipping it). 2.10.0
  only resumed a *suspended* context, never an *interrupted* one, which is
  why the sounds could stop for good until a reload. **The iPhone's silent
  switch mutes Web Audio** (YouTube's sound isn't affected) — the first
  thing to check when a phone is quiet. Headless test runs can't hear:
  spy on `Sound.prototype.play` (the cues, their start, the context's
  state) and count the nodes it creates.
- **The build animation and the image export**: everything moves by Web
  Animations (`fill:"backwards"`), never by attributes, so `saveBoardImage`
  serialises the finished board even mid-build; the tokens' grey backs are
  removed when their flip ends. A new render cancels a running build and
  the sounds it hasn't played yet (each timeline has its own gain node,
  disconnected to stop it).
- **One build, every device:** everything random in it comes from one
  seeded generator (`build.seed` = map seed + `buildAt`) and is drawn in
  the same order whether this device animates or only plays the sounds, so
  the timeline is identical everywhere; the delays are shifted by
  `start − now` (negative once it's under way — Web Animations take a
  negative delay as "already this far in"). The tile order relies on the
  restored board listing its tiles in the snapshot's order, which is the
  order the generator made them in.

---

## 10. Future expansions

An open list of ideas the group is discussing — **not house rules yet, and
not built**. Add new ideas here as they come up. When one is adopted, move
it into the house rules (§1) or the features (§3) and give it a changelog
entry.

### The Long Night (a rework of WALKER's special barbarians)

**Today's rule.** WALKER lights a letter for every 7 rolled with the
barbarian ship. Once all six are lit, the next barbarian landing is
*special*: a skill check of 3 × cities + off-island knights + |negative
karma|. Pass: the top knight contributor gets a dev card and a VP, second
gets a dev card, third nothing. Fail: everyone loses a city, and the
dishonorable get no commodities until the next barbarians. The table's
complaints: it has never triggered, and when it does it's just a skill
check. Theme: Game of Thrones — the long winter, when the White Walkers
come.

**1. Make WALKER actually arrive.** A 7 with the ship is 1 roll in 12, so
six letters plus the wait for the next landing takes about 75 rolls.
Simulated over 200,000 three-player games (Cities & Knights dice: three of
the event die's six faces are the ship, seven steps to land):

| Rule | Long Night starts (rounds, middle 80% of games) | Median | Started by round 20 |
|---|---|---|---|
| Today: a 7 with the ship lights a letter | 16–39 | 25 | 27% |
| **Also light a letter each time the barbarians land** | **12–23** | **17** | **76%** |
| Any 7 lights a letter | 9–21 | 14 | 87% |

Recommended: the middle rule. Landings are the steady drumbeat ("every wave
is a warning") and the 7s are the surprise that can bring it 3–4 rounds
early. It still arrives at a different point each game, but it arrives. At
the table the only change is pressing **+** when the barbarians land.

**2. The Long Night replaces the skill check.** When WALKER is full, the
next landing isn't an attack: the Long Night begins and the game becomes a
semi-cooperative endgame — the living share an enemy but each still wants
to win.

- **The Night King.** The player with the most VP turns. On a tie,
  whoever's honor coin shows tails turns (the dishonorable fall first);
  still tied, roll. Their knights become **wights**:
  - *The dead don't eat:* wights activate for free.
  - *The dead don't build:* the Night King can't build roads, settlements,
    cities or improvements; everything goes into knights.
  - *The dead march anywhere:* wights move along any road.
  - It doubles as a catch-up rule: the runaway leader stops racing to 13
    and becomes everyone's problem.
- **The long winter** (everyone, until it ends):
  - *Frozen sea:* knights and wights can walk across the water between the
    islands (a crossing is one road step), so off-island knights matter.
  - *Hunger:* activating a living knight costs 2 grain.
  - *Banners united:* living knights can move along any living player's
    roads, never the Night King's.
  - *Cold shoulder:* anyone whose coin shows tails gets no commodities —
    today's failure penalty as a standing rule.
- **Waves.** Each barbarian landing is a wave of the dead. Afterward the
  ship goes back only halfway (4 steps from landing), so waves come about
  every 3 rounds (8 rolls on average).
  1. The Night King secretly picks a living player to strike (one of
     their roads hidden in a fist).
  2. Dead strength = the Night King's active wights + 1 per city the dead
     hold. Living strength = all living players' active knights.
  3. Each side may add one duel card (below): one from the Night King,
     one from each living player. Target and cards are revealed together.
  4. Living ≥ dead: the wave breaks and two WALKER letters go dark;
     today's reward stays (most strength: VP + dev card; second: dev
     card).
  5. Dead > living: the target's city falls (a settlement if they have no
     city). It no longer counts for its owner, and the Night King raises a
     free wight beside it.

  Nobody knows who's targeted, so everyone has a reason to defend — and
  the one who keeps their knights home might be the one who pays.
- **How it ends:**
  - *The Night King wins alone* when the dead hold as many cities as there
    are living players (2 in a 3-player game).
  - *The living win together at Dawn*, when all six letters are dark.
  - *Any living player wins alone* by reaching 13 VP before Dawn — the
    selfish road: build while the others hold the walls, and hope they
    hold.
- **Optional extras:**
  - *Turncloak:* once per game, a losing player can bend the knee and join
    the dead; they win if the Night King wins.
  - *Dawn pact:* at Dawn the living secretly reveal their honor coins. All
    heads: a shared win. Exactly one tails: that player takes the glory
    alone. Two or more tails: the realm turns on itself and the Night King
    wins.

### Knight duels (the old "war" card rule, rebuilt)

**Built in 3.0.0 as the Battle mod** (§1, §3): the all-game rules below —
cards 1–6, card + knight level, spent until all six are, and Yield (the
app's **Retreat**). Ambush and the Long Night parts aren't in the app.

The group used to give each player a suit of cards and play war with
chosen cards (no reuse until the whole suit was spent), so knights of
equal power could fight with mind games. Proposed version:

- **All game:**
  - Each player holds Ace–6 of one suit. Six, not thirteen, so a hand runs
    out and refreshes within a game and counting what's left is realistic.
  - When your knight tries to bump another player's knight, it's a duel
    instead of the usual strength rule, so any level can challenge any
    level.
  - Both pick a card face down and reveal together. Score = card + knight
    level (basic 1, strong 2, mighty 3). Higher wins: the loser is bumped
    as usual and both knights go inactive. Tie: both go inactive and
    nobody moves.
  - Played cards stay face up until all six are played, then the player
    picks them all back up. Everyone sees what's left — that's the mind
    game ("they've burned their 5 and 6, do I push now?").
  - *Yield:* before cards are picked, the defender can back off: the
    knight retreats but stays active, and no card is spent — how you show,
    or fake, how badly you want a spot.
  - *Ambush:* challenging an inactive knight is allowed, but you flip your
    coin to dishonorable.
- **During the Long Night:**
  - *The dead rise:* a knight that loses to a wight dies, and a basic wight
    takes its place.
  - *Dragonglass:* beating a wight with your 6 destroys it and darkens one
    letter; a win with any other card only pushes it back. The 6 is both
    the best card in a wave and the only way to kill.
  - *Fight together:* another living player's active knight next to the
    fight lets its owner add a card too.
  - *Kinslaying:* dueling another living player during the Long Night makes
    you dishonorable (and so frozen out of commodities).

### What to adjust after the first try

- Night comes too early or too late: whether landings light a letter.
- The Night King wins too easily: one more fallen city, or drop the +1 per
  dead city.
- Dawn comes too easily: a broken wave darkens one letter instead of two.
- The Long Night drags: send the ship back to step 5 instead of halfway.

### What the app would need

Once the rules settle: a Long Night mode on the tracker — a Night King
badge, WALKER letters going dark one by one, a fallen-cities count, and a
shared crown in Season wins for a Dawn win. With the recommended clock,
**+** on WALKER also gets pressed when the barbarians land (no app change).

### Other app ideas (offered, not built)

- Keep the screen awake during a game.
- A TV "table view" with the map and a scoreboard together, for casting.
- Swipe between the map and the tracker on phones.
- A floating 200 × 200 player for the mini bar's play button (declined
  for now).

---

## 11. Changelog

Keep newest first. Every feature PR adds an entry and updates the sections above.

- **3.0.1 — No music in the lobby.** Today's games, New game and Pick
  your color no longer show the music — neither the mini bar nor the
  player (on desktop, its column): it's put away and held like on the
  sign-in screen, and comes back once you're in a game.

- **3.0.0 — Today's games, mods and Battle.** Several games at once: after
  *Welcome, Lord …* everyone lands on **Today's games** — every open room
  with its board, seats, who's in it and its house rules — to open, join,
  watch or delete; **New game** names a room and picks its **mods**:
  **Karma & Robber**, **Walker**, **Battle** and a custom **points to
  win** (5–20; otherwise 13, or 10 on a base-game board). The color is
  picked per room, and rooms close by themselves 6 h after anyone last
  touched them. The tracker shows only what the room plays, its karma
  tile titled to match (*Karma and Robber & Walker*, *Karma and Robber*,
  *Walker*); on a wide screen Victory points & honor is a square with
  Cities and Knights beside it (full width again on a base-game board).
  **Battle** (knight duels): challenge another player, who fights or
  retreats; each picks a knight (basic, strong, mighty — they fold in
  under the one picked) and a card 1–6 (spent until all six are); a
  scuffle, then the winner with each side's knight and card, closing by
  itself after 5 s. On desktop the tracker sits locked over the music —
  sized to what it shows, its header in line with the top bar — with no
  handle between them. The top bar's Pangaea goes to Today's games. Data:
  `rooms/{id}` replaces the single `session` (no longer read). Code:
  `GameService` (profiles, rooms, wins, music) and `RoomService` (one
  room's game), `RoomState`, `Mods`, `game/battle.js`; new screens
  `RoomsScreen`, `ModsScreen`, `SeatScreen` and `ui/BattleOverlay.js`; a
  shared `Toggle` control.

- **2.16.0 — The playlist picks up videos added on YouTube.** The queue
  was the playlist as it was when its link was pasted: videos added on
  YouTube since only showed after pasting the link again. Now **Refresh
  songs** in the 🔗 pop-up reads it again (a toast says what changed),
  and so does the first device to open the app once it was read 6 h ago
  — once, however many phones open at once. The song playing carries on
  while it's read: a remote with its player open reads it, and the
  speaker only once its music stops (or after a 6 s grace when it asked
  itself), so the music isn't cut. Removed videos drop out; if the song
  playing was removed, the queue carries on from the same place instead
  of the top.

- **Docs — Future expansions (§10).** A new section, kept open for ideas
  the group is discussing: the Long Night (a rework of WALKER's special
  barbarians, with a simulation of when WALKER arrives), knight duels,
  what to adjust after a first try, and app ideas offered but not built.
  The changelog is now §11. No app change.

- **2.15.0 — No frost on Season wins; crowns and turds on the victory
  screen.** WALKER's winter frost and snow no longer cover Season wins or
  the victory / defeat screen: they fade out while either is up and come
  back at the same level when it closes. The victory screen wears Season
  wins' animated 8-bit badges — a big crown over *Victory*, a big turd
  over *Defeat*, and in the standings a crown for the winner (each, if
  two are on 13) and a turd for everyone else, instead of the color dots
  — and the closed music's mini bar is hidden while it's up (an open
  player stays as it was).

- **2.14.0 — Custom colors tried on as they're picked; a gentler winter.**
  In the color wheel (a custom accent or theme), letting go of the wheel —
  or a slider, a hex, a recent color — shows the color on the whole app at
  once; it's saved, and follows the person, only with **Use color**, and
  Cancel puts back what was there. WALKER's winter now goes as far by the
  last letter as it used to by the 4th, each letter a third less than
  before, so the frost no longer creeps over the tracker's buttons.

- **2.13.0 — Player Settings with custom colors; tiles on top; smaller
  − / +.** Settings' color sections move into a **Player Settings**
  drop-down (closed at first) with two new switches, **Map animations**
  and **Sound effects** (which replaces the volume button in the map's
  corner) — all of it saved on the person's profile, so it follows them
  to every device. **Match device** is gone (someone who never picked a
  theme still sees Light or Dark as their device is set). Both the accent
  and the theme can be **any color**: a color wheel with brightness, an
  opacity slider, hex, a live preview and the person's five most recent
  custom colors; a custom theme's cards and text are worked out from the
  color so the text stays readable (`game/colors.js`). The top bar is
  **tiles** — on desktop *Pangaea* at the left, the board type centred
  over the map (not the bar), who's signed in at the right, the icons
  over the settings column — and the settings column is a card; the
  tracker's header is tiles too. The gaps either side of the map are both
  12 px, and both column handles run the window's full height, in the
  middle of their gap. The **− / + buttons** are smaller (26 px on the
  tracker, 28 in Settings, 13 px signs; at most 32 px on screen in the
  music & tracker view, where they used to grow with the tracker). On a
  phone, who's signed in gets the room it needs first: the icons shrink,
  down to 26 px each, before the name is cut (*Rithvik* is whole on a
  360 px phone; it used to read *R · Sign out*). Season wins is bigger on wide screens. The sign-in
  screen puts the music away and holds it like Season wins (a play from
  another phone waits instead of bringing the player back over it), and
  the welcome covers the whole window (the tracker and the music used to
  show beside it on desktop). **The map score is one quiet line** — the
  total, a dot per part and the seed; a tap opens the four bars. Gone:
  the score's verdict pill (*Playable as dealt*), the hint under the
  themes (*Saved for …*) and the Sea Lanes note (*Dashed ports can only be
  reached by ship*). Phone landscape:
  Settings and Tracker side by side, New map across both, so the rail
  fits with the tiles. On a narrow desktop map the board type sits on its
  own row under Pangaea and the account, centred. A preset accent on a custom theme has
  its text and focus ring worked out for that theme, and the focus ring
  always shows (never a see-through custom accent).

- **2.12.0 — Themes and accent colors that follow you; the map and the
  music in cards; a fuller split view.** Settings gets two new sections:
  **Accent color** (Graphite — the original look — Sea, Harbor, Forest,
  Wheat, Brick, Plum, Rose: buttons, outlines, what's picked or playing)
  and **Theme** (Match device, Light, Sand, Mist, Dark, Hearth, Midnight).
  Signed in, a pick is saved on the profile (`profiles/{id}/look`), so
  every device signed in as that person switches to it — the phone, the
  laptop, the TV; signed out, a device keeps its own. The top bar's light /
  dark button now swaps to the partner theme (Sand ⇄ Hearth), and is saved
  the same way. A pick is saved for whoever made it, even if they sign out
  within the moment it waits. The last look (and the browser bar's color)
  is painted before the first frame (no flash), and the board recolors in
  place. The map and the music player (open,
  mini bar, landscape column, desktop column, split view) sit in cards like
  the tracker's, and the settings sheet, songs and playlist pop-up float
  above the music. In the music & tracker view the tracker grows to fill
  its half (zoom) instead of a 640 px column with wide margins. The
  settings sheet is called Settings. Fixed: the tracker's tight layout (a
  phone with the music open) always scrolled ~38 px — its measured height
  was stale; 3 players now fit with the music open. Repo: `npm start`
  prints the `?store=local` address; docs say the merge is refused until
  the check is green, and that `[skip ci]` leaves a pull request unable to
  merge.

- **Repo — `main` is protected; tests on every pull request** (no change
  to the app — still 2.11.1). Two repository rulesets: *Protect main*
  blocks pushing to `main`, force-pushing and deleting it and asks for an
  approval (the owner may skip the approval only when merging a pull
  request, `gh pr merge <n> --merge --admin`); *Require tests* makes the
  new **npm test** check (`.github/workflows/test.yml`, every pull request
  into `main`, Node 22) pass before any merge, with no bypass. Node 22+ is
  now the stated minimum (`npm test`'s glob needs Node 21+). Contributing
  steps in §2, `README.md`, `CLAUDE.md` and `AGENTS.md` (which now carries
  the same rules for other coding agents).

- **2.11.1 — Fix: Season wins no longer pops the music back up.** With the
  season wins open on the device playing the music (a computer, say),
  pressing play on another phone brought that device's music player back
  over the season wins — on purpose since 2.10.0, as a hidden player can't
  play, but it read as a glitch. Now that device *holds* the music while
  the season wins are open: a play from elsewhere waits (that phone says
  so, and its ⏸ takes it back), and the music plays as soon as the season
  wins close. Play here still moves the sound to the phone. New `hold` /
  `unhold` playback commands, with tests.

- **2.11.0 — New map in step on every phone; a mute button; Abstain earns
  karma; a black icon.** A new map now builds itself in on every device at
  the same moment, with its sounds on every phone that has the app open
  (before, only the device that pressed it and the music's speaker), even
  on the tracker: the presser publishes when the build starts
  (`meta.buildAt`, server clock, 0.8 s ahead) and every device runs the
  same seeded build from then. Fixed the sounds going quiet for good on a
  phone: the audio is restarted on every tap, after New map's confirm and
  when the page comes back (an iPhone leaves it *interrupted*). A volume
  button in the map's bottom right corner mutes the sound effects on this
  device. **Abstain** now also adds 1 to karma (and still raises the robber
  to 3 at most — at 3 it stays pressable for the karma). The installed
  app's icon is on black instead of the dark teal sea;
  `scripts/make-icons.mjs` re-renders it.

- **2.10.0 — Animations & sounds; calendar; Abstain / Rob.** New map builds
  itself in: tiles fly in from off screen with a clack each, then the
  number tokens fly in face down, flip and land with a pop, then the ports
  pop in (sounds on the device that pressed it and on the music's speaker;
  Web Audio, no files). Every load opens on a *Settlers of Catan* intro
  that fades into choosing an account, and signing in ends with *Welcome,
  Lord Sam*. The top bar shows *Sam · Sign out* next to Pangaea, and season
  wins (trophy) and music (♪) live only there — gone from the tracker
  header and the join screen. Season wins hides the music (pausing it on
  the device playing it, and playing on afterwards) and gets a month
  calendar under the standings — swipe or ‹ › for other months, each day
  shows its winner, tap for everyone's points at that win (recorded with
  each win from now on). The mini bar centres the song, adds ⏮ and the
  song list, and swipes sideways to change the song. Animated: the music
  bar and mini bar sliding in, the split view, Settings → Advanced, the
  tracker and season wins coming and going. The robber's tap-to-cycle and
  Collect became **Abstain** (+1, up to 3) and **Rob** (karma −N, back to
  1).

- **2.9.0 — Season wins: a crown for first, turds for the rest.** In the
  standings, first place gets an 8-bit gold crown that glints, glows and
  sparkles; everyone else gets a turd with rising stink and two buzzing
  flies (`ui/badges.js`, CSS in `screens.css`). Ties for first share the
  crown; nothing shows until someone has won that season; still under
  *reduce motion*. `GameState.winsFor` rows now carry `leader`.

- **2.8.1 — Fix: YouTube ads no longer pause the music.** An ad before a
  song made the speaker think it was a phone waiting for its first tap:
  after 8 s it marked the music paused for everyone and re-cued the song,
  cutting the ad short so the song never started (since 2.7.0; only on the
  live site — localhost gets no ads). The speaker now recognises an ad,
  waits it out with *Ad — the song starts after it*, and the song starts
  on its own afterwards.

- **2.8.0 — The music stays put; frost all round; centred on desktop.**
  The sound now stays on the device playing it whatever anyone changes —
  only **Play here** moves it (before, a play from a remote took the sound
  once the speaker had been quiet for 70 s, and closing the speaker's page
  let it go). A quiet speaker reads *not responding* on the remotes, and
  the speaker's beat no longer stops in a background tab. The pop-up's
  Premium description is gone. Winter's frost frames the whole window —
  the music bar and mini bar too — with a hole cut exactly round the
  YouTube player. On desktop the tracker (and season wins, admin) sits in
  the middle of its space instead of at the top.

- **2.7.0 — One shared player for the table.** The music is now live on
  every device: the same song, the same order (shuffled or not), playing or
  paused and the same time everywhere, and anyone's play, pause, next,
  previous, shuffle, song pick or new time slider changes it for everyone
  (`/v1/playback`, `music/playback.js`, every change a transaction). One
  device plays the sound — whoever pressed play first, normally the phone
  cast to the TV; the others are remotes showing *On Sam's phone*, and
  **Play here** (tap that line) moves the sound. The speaker reports back
  what its player really does (buffering, ads, the video's own controls),
  writes a beat every 20 s, and a speaker gone 70 s stops the clock. The
  mini bar gains ⏭ and a progress line. Time uses the server's clock.
  Replaces 2.4's per-profile "pick up where you were" (`listening`).

- **2.6.0 — Mini player, tidier phones.** Closed, the music is now a thin
  mini bar along the bottom of every screen (phones and desktop): artwork,
  song, play and ⌃; **♪** or a tap pops the player open, and its play opens
  it and plays (closing still pauses — YouTube's rules). Phone landscape:
  the player keeps YouTube's 200 × 200 minimum with previous / play / next
  stacked beside it and the rest in one row under it, and the middle rail
  is slimmer with smaller, quieter controls — all of it fits the ~300 px a
  browser leaves in landscape. The tracker reorganises itself when the
  screen is short (the music open on a phone): card titles step aside, the
  shared cards merge, the seed line moves below — 3–4 players fit with the
  music open. The score chip over the map is gone (the score is in
  Settings). The music & tracker view is desktop-only again. A full-screen
  button where the browser allows it (Android, iPad; iPhone browsers
  can't — the installed app is the way there).

- **2.5.0 — Music & tracker view; smaller desktop player.** A split-screen
  icon in the top bar (every device) hides the map and splits the screen
  between the tracker and the music — side by side, or tracker over music
  on an upright phone — with a bar to drag between them, the video across
  its half and the song list under it; back brings the map back. On
  desktop the music column's player is now 200 × 200 with its controls
  beside it, so the song list shows about twice as many songs. The WALKER
  letters shake about half as hard. Phones: the top bar's icons shrink a
  little instead of wrapping onto a second row (six fit on a 360 px phone
  and in the landscape rail). Desktop computers no longer get the install
  button or the *Get the app* card (phones and tablets still do).

- **2.4.0 — Install as an app.** Web app manifest (full screen), app icons,
  and a service worker: Pangaea installs from the browser — Android's
  install dialog behind a phone icon and a *Get the app* card on the
  welcome screen; on iPhone the same places explain Share → Add to Home
  Screen — and the installed app opens without the browser bars and with
  no signal (fresh files whenever it's online, the last good copy when it
  isn't). About explains it.
- **2.3.1 — Gentler winter; capped desktop column.** About half the snow
  at every level (and sparser early on), shallower and more see-through
  frost, half the cold tint — all from one `STRENGTH` setting in
  `WinterEffect.js`. The desktop left column now stops at 759 px, so the
  tracker can't be stretched into its two-column layout (dragging, the
  arrow keys and older saved widths all stop there).
- **2.3.0 — Walker, winter, devices, desktop.** WALKER on the tracker
  (one letter per 7 with the barbarians, + on the full word starts over):
  the letters glow and shake harder as it fills, and every phone gets
  8-bit pixel snow that blinks, twinkles and pulses, plus pixel frost from
  the edges — all fading out when it starts over. Logging in on another
  device takes a seated player straight to the tracker and picks the music
  up where they were (song, time, playing); a reload cues it. Desktop: a
  left column with the tracker on top and the music below (big player and
  the song list when it has room), the map usable beside it, and drag
  handles for the column, the split and the settings column. The tracker
  still fits one phone screen for 3–6 players (rows 42–54 px).
- **2.2.3 — Fix:** a playlist switch made while a song is changing (just
  after Next, or as one song ends) keeps playing too. YouTube briefly
  reports *paused* between songs; only a pause that lasts counts now.
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
