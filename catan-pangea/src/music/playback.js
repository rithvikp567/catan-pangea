/**
 * The table's music as ONE shared playback (DOM-free, unit-tested).
 *
 * Every device shows the same song, the same order (shuffled or not), the
 * same play / pause and the same time. One device plays the sound — the
 * *speaker*, normally the phone cast to the TV — and every other device is
 * a remote whose buttons drive it. The sound stays on the speaker whatever
 * anyone changes; only "Play here" (takeOver) moves it. The one exception
 * is the very first play, when there's no speaker yet.
 *
 * The speaker can *hold* the music while its player is put away (the
 * season wins screen, the intro — a hidden player mustn't play): it's
 * paused, and a play from anyone else meanwhile doesn't call the player
 * back — it waits (`resume`) and the music plays once the speaker unholds
 * it. Play here takes the sound (and the wait) somewhere else.
 *
 * Stored at /v1/playback and only ever changed by the commands below, each
 * run inside a store transaction, so taps from several phones at once
 * never step on each other:
 *
 *   queue: { listId, setAt,              ← the playlist (GameState.music) it was read from
 *            songs:[videoId…],           ← the playlist's own order
 *            order:[videoId…],           ← play order: the same, or shuffled (stored, so every device agrees)
 *            shuffle }
 *   now:   { index, videoId,             ← the song: order[index]
 *            playing, pos, at,           ← the clock: pos seconds in at time `at` (ms, server clock)
 *            duration?,                  ← seconds, once the speaker knows it
 *            speaker?, speakerName?, speakerKind?,   ← the device playing the sound (its device id), for "On Sam's phone"
 *            held?, heldFor?, resume?,   ← the speaker holds it (its device id; "wins" | "splash"; play once it's back?)
 *            rev, by }                   ← bumped by every change, and which device made it
 *   beat:  ms                            ← the speaker's last "still here" (every BEAT_MS)
 *
 * Where the song is now = pos + (now − at) while playing. Clocks are the
 * server's (GameController corrects Date.now()), so every device agrees.
 *
 * Commands are pure: (playback, arg, ctx) → the new playback, or undefined
 * for "no change" (the transaction aborts). ctx = { t, deviceId, name,
 * kind, random }.
 */

/** The speaker writes `beat` this often while its page is open… */
export const BEAT_MS = 20_000;
/** …and a speaker silent for this long isn't responding (closed, locked, offline):
 *  its clock stops and nothing shows as playing — but it stays the speaker until someone's Play here. */
export const SPEAKER_TIMEOUT_MS = 70_000;

export const songCount = pb => pb?.queue?.order?.length ?? 0;

/** Is the speaker still there? (It may be paused.) */
export const speakerOnline = (pb, t) => !!pb?.now?.speaker && t - (pb.beat ?? 0) < SPEAKER_TIMEOUT_MS;

/**
 * Where the song is at time t, in seconds. The clock only runs while the
 * speaker is there to play it: a speaker that's gone leaves it where it was.
 */
export function livePosition(pb, t){
  const now = pb?.now;
  if(!now) return 0;
  let pos = now.pos ?? 0;
  if(now.playing && speakerOnline(pb, t)) pos += Math.max(0, t - (now.at ?? t)) / 1000;
  return now.duration ? Math.min(pos, now.duration) : pos;
}

/** Is the music playing somewhere it can be heard? */
export const isPlaying = (pb, t) => !!pb?.now?.playing && speakerOnline(pb, t);

/** Is the speaker holding the music (its player put away for now)? */
export const isHeld = pb => !!pb?.now?.held && pb.now.held === pb.now.speaker;

/** Playing — or held with a play waiting for the speaker to be back. What a play / pause button shows. */
export const wantsToPlay = (pb, t) => isPlaying(pb, t) || (isHeld(pb) && pb.now.resume === true);

/** Fisher–Yates, with `first` (the song playing) kept at the front. */
export function shuffled(songs, first, random = Math.random){
  const rest = songs.filter(id => id !== first);
  for(let i = rest.length - 1; i > 0; i--){
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first != null && songs.includes(first) ? [first, ...rest] : rest;
}

const round = s => Math.round(s * 100) / 100;
const song = (pb, index) => ({ index, videoId:pb.queue.order[index], pos:0, duration:null });
const speakerHere = ctx => ({ speaker:ctx.deviceId, speakerName:ctx.name ?? null, speakerKind:ctx.kind ?? null });
const UNHELD = Object.freeze({ held:null, heldFor:null, resume:null });   /* (nulls aren't stored) */

/** A change to `now`: restamps the clock (keeping the position unless the patch moves it) and bumps rev. */
function stamp(pb, patch, ctx){
  const pos = "pos" in patch ? patch.pos : livePosition(pb, ctx.t);
  return { ...pb, now:{ ...pb.now, ...patch, pos:round(Math.max(0, pos)), at:ctx.t, rev:(pb.now?.rev ?? 0) + 1, by:ctx.deviceId } };
}

/** The playlist's songs, read by any device's player. Re-reading the same list keeps the song playing. */
export function load(pb, { listId, setAt = null, songs }, ctx){
  if(!listId || !songs?.length) return undefined;
  if(pb?.queue?.listId === listId && (pb.queue.setAt ?? null) === setAt) return undefined;
  const shuffle = pb?.queue?.shuffle === true;
  const keepSong = pb?.queue?.listId === listId && songs.includes(pb?.now?.videoId) ? pb.now.videoId : null;
  const order = shuffle ? shuffled(songs, keepSong, ctx.random) : [...songs];
  const base = { ...pb, queue:{ listId, setAt, songs:[...songs], order, shuffle }, now:{ ...pb?.now, playing:pb?.now?.playing === true } };
  return stamp(base, keepSong ? { index:order.indexOf(keepSong), videoId:keepSong } : song(base, 0), ctx);
}

/**
 * Play (index: that song). From a remote, the speaker plays it — even one
 * that isn't responding (it picks up when it's back). This device becomes
 * the speaker only with `here`, or when there's no speaker at all yet.
 * While the speaker holds the music, a remote's play waits for it.
 */
export function play(pb, { index = null, here = false } = {}, ctx){
  const n = songCount(pb);
  if(!n) return undefined;
  const take = here || !pb.now?.speaker;
  const patch = { playing:true };
  if(Number.isInteger(index) && index >= 0 && index < n && index !== pb.now?.index) Object.assign(patch, song(pb, index));
  if(isHeld(pb)){
    if(!take && pb.now.speaker !== ctx.deviceId){
      if(pb.now.resume === true && !("index" in patch)) return undefined;
      return stamp(pb, { ...patch, playing:false, resume:true }, ctx);          /* plays once the speaker's back */
    }
    Object.assign(patch, UNHELD);
  }
  if(take) Object.assign(patch, speakerHere(ctx));
  const next = stamp(pb, patch, ctx);
  if(take) next.beat = ctx.t;
  return next;
}

/** Pause — or, while the speaker holds the music, take back the play that was waiting. */
export function pause(pb, _arg, ctx){
  if(!songCount(pb)) return undefined;
  if(isHeld(pb) && pb.now.resume === true) return stamp(pb, { resume:false }, ctx);
  if(!pb.now?.playing) return undefined;
  return stamp(pb, { playing:false }, ctx);
}

/** Next (+1) / previous (−1), round the playlist; playing or paused stays as it was. */
export function skip(pb, delta, ctx){
  const n = songCount(pb);
  if(!n || !Number.isInteger(delta) || !delta) return undefined;
  return stamp(pb, song(pb, (((pb.now?.index ?? 0) + delta) % n + n) % n), ctx);
}

/** The speaker's song ended (or won't play): move on — once, however many times it's reported. */
export function ended(pb, { videoId } = {}, ctx){
  if(!songCount(pb) || !videoId || pb.now?.videoId !== videoId) return undefined;
  return skip(pb, 1, ctx);
}

export function seek(pb, seconds, ctx){
  if(!songCount(pb) || !Number.isFinite(seconds)) return undefined;
  const max = pb.now?.duration ? pb.now.duration - 1 : Infinity;
  return stamp(pb, { pos:Math.min(Math.max(0, seconds), max) }, ctx);
}

/** Shuffle on: a new random order with the song playing first. Off: the playlist's own order. The song carries on. */
export function setShuffle(pb, on, ctx){
  if(!songCount(pb) || (pb.queue.shuffle === true) === !!on) return undefined;
  const current = pb.now?.videoId ?? null;
  const order = on ? shuffled(pb.queue.songs, current, ctx.random) : [...pb.queue.songs];
  const index = Math.max(0, order.indexOf(current));
  return stamp({ ...pb, queue:{ ...pb.queue, order, shuffle:!!on } }, { index, videoId:order[index] }, ctx);
}

/** Play here: this device plays the sound from now on (playing or paused as it was — held, as it would be). */
export function takeOver(pb, _arg, ctx){
  if(!songCount(pb) || (pb.now?.speaker === ctx.deviceId && speakerOnline(pb, ctx.t))) return undefined;
  const patch = speakerHere(ctx);
  if(isHeld(pb)) Object.assign(patch, UNHELD, { playing:pb.now.resume === true });
  return { ...stamp(pb, patch, ctx), beat:ctx.t };
}

/**
 * The speaker puts its player away (`why`: "wins" — the season wins
 * screen — or "splash", the intro). A hidden player mustn't play, so the
 * music pauses; it plays on when it's unheld if it was playing, or if
 * anyone presses play meanwhile.
 */
export function hold(pb, { why = "away" } = {}, ctx){
  if(!songCount(pb) || pb.now?.speaker !== ctx.deviceId) return undefined;
  const already = isHeld(pb);
  if(already && pb.now.heldFor === why) return undefined;
  const resume = already ? pb.now.resume === true : pb.now.playing === true;
  return { ...stamp(pb, { held:ctx.deviceId, heldFor:why, resume, playing:false }, ctx), beat:ctx.t };
}

/** The speaker's player is back: the music plays if a play was waiting for it. */
export function unhold(pb, _arg, ctx){
  if(!pb?.now?.held || pb.now.held !== ctx.deviceId) return undefined;
  const mine = pb.now.speaker === ctx.deviceId;
  const next = stamp(pb, { ...UNHELD, playing:mine && pb.now.resume === true ? true : pb.now.playing === true }, ctx);
  return mine ? { ...next, beat:ctx.t } : next;
}

/**
 * The speaker reports what its player is really doing — buffering or an ad
 * put it behind, someone used the video's own controls, or a phone never
 * started (it needs a tap on the video). Only the speaker, and only about
 * the change it last followed (rev), so it never undoes a newer command.
 */
export function sync(pb, { rev, pos, playing, duration } = {}, ctx){
  if(!songCount(pb) || pb.now?.speaker !== ctx.deviceId || pb.now.rev !== rev) return undefined;
  const patch = {};
  if(Number.isFinite(pos)) patch.pos = pos;
  if(typeof playing === "boolean" && !(playing && isHeld(pb))) patch.playing = playing;   /* (held: its player is away) */
  if(Number.isFinite(duration) && duration > 0) patch.duration = Math.round(duration);
  if(!Object.keys(patch).length) return undefined;
  return { ...stamp(pb, patch, ctx), beat:ctx.t };
}

/** Every command, by name (GameService.controlMusic runs them in a transaction). */
export const COMMANDS = Object.freeze({ load, play, pause, skip, ended, seek, shuffle:setShuffle, takeOver, hold, unhold, sync });
