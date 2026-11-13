/**
 * Game-tracker rules: limits, colors and the pure state transitions.
 * No I/O — GameService applies these inside store transactions, and the
 * UI uses the same bounds to enable / disable buttons.
 */

export const MAX_VP = 13;
export const KNIGHTS_PER_PLAYER = 12;          /* each island's knight track tops out at 12 × players */
export const CITIES_PER_PLAYER = 4;            /* city pieces in the box */
export const KARMA_LIMIT = 99;                  /* karma is ± and unbounded in spirit; ±99 keeps the display sane */
export const ROBBER_VALUES = Object.freeze([1, 2, 3]);
export const WALKER_WORD = "WALKER";           /* one letter per 7 rolled with the barbarians; + on the last letter starts over */
export const NAME_MAX = 20;
export const ADMIN_PASSWORD = "password";       /* not security — the admin is a shared management account */

export const PLAYER_COLORS = Object.freeze([
  { id:"red",    label:"Red",    hex:"#C8412E" },
  { id:"blue",   label:"Blue",   hex:"#2F6DB5" },
  { id:"white",  label:"White",  hex:"#ECE8DF" },
  { id:"orange", label:"Orange", hex:"#E58A2B" },
  { id:"green",  label:"Green",  hex:"#3F8F52" },
  { id:"brown",  label:"Brown",  hex:"#7B5435" },
]);
export const colorById = id => PLAYER_COLORS.find(c => c.id === id) ?? null;

/** Shared counters on the board, with their bounds for a given table size. */
export const COUNTERS = Object.freeze({
  knightsMain:{ label:"Main island knights", min:() => 0, max:players => KNIGHTS_PER_PLAYER * players },
  knightsOff: { label:"Off island knights",  min:() => 0, max:players => KNIGHTS_PER_PLAYER * players },
  cities:     { label:"Cities",              min:() => 0, max:players => CITIES_PER_PLAYER * players },
  karma:      { label:"Karma",               min:() => -KARMA_LIMIT, max:() => KARMA_LIMIT },
  walker:     { label:"Walker",              min:() => 0, max:() => WALKER_WORD.length, wraps:true },
});

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clampVP = vp => clamp(vp, 0, MAX_VP);
/**
 * One step of a bounded counter. A value already past a bound (e.g. a game
 * saved under older, looser limits) can still step back toward the range
 * one at a time instead of snapping to the bound.
 */
export const stepWithin = (value, delta, lo, hi) =>
  delta > 0 ? Math.min(value + delta, Math.max(value, hi)) : Math.max(value + delta, Math.min(value, lo));
/**
 * One step of a COUNTERS entry. A counter that `wraps` (the walker) goes
 * back to its minimum when + is pressed on its maximum.
 */
export const stepCounter = (rule, value, delta, players) =>
  rule.wraps && delta > 0 && value >= rule.max(players)
    ? rule.min(players)
    : stepWithin(value, delta, rule.min(players), rule.max(players));
export const nextRobber = v => ROBBER_VALUES[(ROBBER_VALUES.indexOf(v) + 1) % ROBBER_VALUES.length] ?? ROBBER_VALUES[0];
export const collectRobber = (karma, robber) => clamp(karma - robber, -KARMA_LIMIT, KARMA_LIMIT);

/** Wins are tallied per calendar year. */
export const seasonOf = ms => new Date(ms).getFullYear();

/** Seat keys are "s0", "s1", … (not 0, 1, … — the RTDB would turn those into arrays). */
export const seatKey = i => "s" + i;
export const seatIndex = key => Number(String(key).slice(1));

/** Trimmed, collapsed display name, or an error message. */
export function validateName(raw, existingNames = []){
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if(!name) return { error:"Enter a name." };
  if(name.length > NAME_MAX) return { error:`Keep it to ${NAME_MAX} characters.` };
  if(existingNames.some(n => n.toLowerCase() === name.toLowerCase())) return { error:"That name is taken." };
  return { name };
}

/**
 * A fresh session (one game, tied to one board / seed).
 * @param {object} p
 * @param {string} p.id
 * @param {import("../engine/Board.js").BoardSnapshot} p.board
 * @param {object} p.settings   Settings#toJSON() the board was made with
 * @param {number} p.createdAt  ms
 * @param {string} [p.createdBy] profile id
 */
export function newSession({ id, board, settings, createdAt, createdBy }){
  const players = board.request.players;
  const seats = {};
  for(let i = 0; i < players; i++) seats[seatKey(i)] = { vp:0, honorable:true };
  return {
    meta:{ id, seed:board.request.seed, players, createdAt, createdBy:createdBy ?? null, season:seasonOf(createdAt) },
    board, settings, seats,
    counters:{ ...Object.fromEntries(Object.keys(COUNTERS).map(k => [k, 0])), robber:ROBBER_VALUES[0] },
  };
}

/**
 * Seat the previous game's players in a new session with the same
 * colors (scores start over). Players beyond the new seat count lose
 * their seat and pick again.
 * @param {ReturnType<typeof newSession>} session
 * @param {object} [prevSeats]   the old session's seats
 * @param {(profileId:string) => boolean} [exists]  skip removed profiles
 */
export function carrySeats(session, prevSeats = {}, exists = () => true){
  const seated = Object.entries(prevSeats ?? {})
    .filter(([, s]) => s?.profileId && s.color && exists(s.profileId))
    .sort(([a], [b]) => seatIndex(a) - seatIndex(b))
    .slice(0, session.meta.players);
  const seats = { ...session.seats };
  seated.forEach(([, s], i) => { seats[seatKey(i)] = { ...seats[seatKey(i)], profileId:s.profileId, color:s.color }; });
  return { ...session, seats };
}
