/**
 * Knight duels (the Battle mod): the rules, as pure functions — no I/O, no
 * DOM. RoomService runs the commands inside store transactions and
 * RoomState derives everyone's cards from the battles fought.
 *
 * Each player holds the cards 1–6. A duel: the challenger picks an
 * opponent, who may Fight or Retreat. Fighting, each secretly picks the
 * level of the knight they send (basic 1, strong 2, mighty 3) and a card;
 * once both have, the higher card + level wins (equal: a standoff). A
 * card played is spent until all six have been played — then the whole
 * hand comes back. So nobody's cards are stored: they're replayed from
 * the battles of this game (RoomState#spent), and can never be spent
 * twice.
 *
 * A battle, stored at rooms/{id}/session/battles/{battleId}:
 *   { from, to (profile ids), at (ms), state, answeredAt?, doneAt?,
 *     picks?: { [profileId]: { level, card } } }
 *   state: "asked" → "fight" | "retreat" | "cancelled";
 *          "fight" → "done" (both picked) | "cancelled"
 */

export const CARDS = Object.freeze([1, 2, 3, 4, 5, 6]);

export const KNIGHTS = Object.freeze([
  Object.freeze({ level:1, label:"Basic" }),
  Object.freeze({ level:2, label:"Strong" }),
  Object.freeze({ level:3, label:"Mighty" }),
]);

export const BATTLE_TIMES = Object.freeze({
  askMs:60_000,        /* a challenge nobody answers lapses */
  fightMs:180_000,     /* a fight nobody finishes lapses */
  showMs:10_000,       /* the result closes itself after this */
});

/** Every card spent: the bits 1…6 of a mask. */
const ALL_SPENT = CARDS.reduce((m, c) => m | 1 << c, 0);

export const isSpent = (mask, card) => ((mask ?? 0) >> card & 1) === 1;

/** Play a card: it's spent — and playing the last one brings the whole hand back. */
export function spend(mask, card){
  const next = (mask ?? 0) | 1 << card;
  return next === ALL_SPENT ? 0 : next;
}

/** A pick's strength: its card plus its knight's level. */
export const strength = pick => (pick?.card ?? 0) + (pick?.level ?? 0);

const validPick = ({ level, card } = {}) => KNIGHTS.some(k => k.level === level) && CARDS.includes(card);

/**
 * Where a battle stands at `now`: its state, or "lapsed" for a challenge
 * or a fight left too long.
 */
export function battleStatus(b, now){
  if(!b) return null;
  if(b.state === "asked" && now - (b.at ?? 0) > BATTLE_TIMES.askMs) return "lapsed";
  if(b.state === "fight" && now - (b.answeredAt ?? b.at ?? 0) > BATTLE_TIMES.fightMs) return "lapsed";
  return b.state;
}

/** Still being asked or fought (a player in one can't start or take another). */
export const isOpen = (b, now) => ["asked", "fight"].includes(battleStatus(b, now));

/**
 * A finished fight: each side's strength and the winner (null: a
 * standoff), or null if it isn't done.
 */
export function outcome(b){
  if(b?.state !== "done") return null;
  const a = strength(b.picks?.[b.from]), d = strength(b.picks?.[b.to]);
  return { strength:{ [b.from]:a, [b.to]:d }, winner: a > d ? b.from : d > a ? b.to : null };
}

/** A new challenge. */
export const challenge = ({ from, to, at }) => ({ from, to, at, state:"asked" });

/**
 * The transitions, each `(battle, arg, ctx:{ t }) => next | undefined`
 * (undefined: no change — the transaction aborts).
 */
export const BATTLE_COMMANDS = Object.freeze({
  /** The one challenged fights or retreats (moves the knight away, still active). */
  answer(b, { by, fight }, { t }){
    if(battleStatus(b, t) !== "asked" || b.to !== by) return undefined;
    return { ...b, state: fight ? "fight" : "retreat", answeredAt:t };
  },
  /** A knight and a card, ready to fight; the second pick finishes it. */
  pick(b, { by, level, card }, { t }){
    if(battleStatus(b, t) !== "fight" || ![b.from, b.to].includes(by) || b.picks?.[by] || !validPick({ level, card })) return undefined;
    const picks = { ...b.picks, [by]: { level, card } };
    const done = !!(picks[b.from] && picks[b.to]);
    return { ...b, picks, ...(done ? { state:"done", doneAt:t } : {}) };
  },
  /** Either side calls it off before it's decided. */
  cancel(b, { by }, { t }){
    if(!isOpen(b, t) || ![b.from, b.to].includes(by)) return undefined;
    return { ...b, state:"cancelled" };
  },
});

/**
 * A player's spent cards (a mask), replayed from the game's finished
 * battles in the order they finished.
 * @param {object} battles  { battleId: battle }
 */
export function spentCards(battles, profileId){
  return Object.values(battles ?? {})
    .filter(b => b?.state === "done" && b.picks?.[profileId])
    .sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))
    .reduce((mask, b) => spend(mask, b.picks[profileId].card), 0);
}
