import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaylist, describePlayerError, playlistUrl } from "../catan-pangea/src/music/playlist.js";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { GameService, GameError } from "../catan-pangea/src/game/GameService.js";
import {
  BEAT_MS, SPEAKER_TIMEOUT_MS, livePosition, isPlaying, speakerOnline, shuffled,
  load, play, pause, skip, ended, seek, setShuffle, takeOver, hold, unhold, isHeld, wantsToPlay, sync, COMMANDS,
} from "../catan-pangea/src/music/playback.js";

test("playlist links: YouTube, YouTube Music, share links and bare ids all give the list id", () => {
  const ok = {
    "https://music.youtube.com/playlist?list=PLabc123XYZ_-": "PLabc123XYZ_-",
    "https://www.youtube.com/playlist?list=PLQ_PIlf6Oz&si=share123": "PLQ_PIlf6Oz",
    "youtube.com/playlist?list=PLnoscheme": "PLnoscheme",
    "https://m.youtube.com/playlist?list=PLmobile": "PLmobile",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLfromwatch&index=3": "PLfromwatch",
    "https://youtu.be/dQw4w9WgXcQ?list=PLshort": "PLshort",
    "https://music.youtube.com/playlist?list=RDCLAK5uy_k0UsUzNCizrQ": "RDCLAK5uy_k0UsUzNCizrQ",
    "  PLbareId123  ": "PLbareId123",
  };
  for(const [input, id] of Object.entries(ok)) assert.deepEqual(parsePlaylist(input), { listId:id }, input);
});

test("playlist links: private lists, single videos and other sites are explained, not accepted", () => {
  assert.match(parsePlaylist("https://music.youtube.com/playlist?list=LM").error, /Liked music.*private/);
  assert.match(parsePlaylist("https://www.youtube.com/playlist?list=WL").error, /Watch later/);
  assert.match(parsePlaylist("https://www.youtube.com/watch?v=dQw4w9WgXcQ").error, /single video/);
  assert.match(parsePlaylist("https://open.spotify.com/playlist/37i9?list=x").error, /isn't a YouTube/);
  assert.match(parsePlaylist("https://www.youtube.com/playlist?list=PL<script>").error, /incomplete/);
  assert.match(parsePlaylist("").error, /Paste/);
  assert.match(parsePlaylist("two words").error, /isn't a link/);
  assert.equal(playlistUrl("PLx"), "https://music.youtube.com/playlist?list=PLx");
});

test("player errors: blocked or removed songs are skipped; a broken playlist is reported", () => {
  for(const code of [100, 101, 150, 5]) assert.equal(describePlayerError(code).skip, true, String(code));
  assert.equal(describePlayerError(2).skip, false);
  assert.match(describePlayerError(2).message, /public or unlisted/);
});

test("the playlist is shared: one phone sets it, every phone sees it; bad links are rejected", async () => {
  const store = new MemoryStore();
  const a = new GameService(store, { deviceId:"dev-a", now:() => 1000 });
  const b = new GameService(store, { deviceId:"dev-b" });
  assert.equal((await b.state()).music, null);

  const id = await a.setPlaylist("https://music.youtube.com/playlist?list=PLtable", "p_alice");
  assert.equal(id, "PLtable");
  assert.deepEqual((await b.state()).music, { listId:"PLtable", setAt:1000, setBy:"p_alice" });

  await assert.rejects(b.setPlaylist("https://www.youtube.com/watch?v=abc"), e => e instanceof GameError && e.code === "bad-playlist");
  assert.equal((await a.state()).music.listId, "PLtable", "a rejected link changes nothing");

  const seen = [];
  const off = b.watch(st => seen.push(st.music?.listId ?? null));
  await new Promise(r => setTimeout(r, 0));
  await b.setPlaylist("PLnext");
  await new Promise(r => setTimeout(r, 0));
  off();
  assert.deepEqual(seen, ["PLtable", "PLnext"]);
});

/* ---------------- one shared playback for the table ---------------- */

const SONGS = ["a1", "b2", "c3", "d4", "e5", "f6"];
const ctx = (t, deviceId = "dev-tv", extra = {}) => ({ t, deviceId, name:"Sam", kind:"phone", random:Math.random, ...extra });
/** A fixed "random" so shuffles are predictable. */
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test("playback: the clock runs only while playing and the speaker is there", () => {
  let pb = load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(1000));
  assert.deepEqual([pb.now.index, pb.now.videoId, pb.now.playing, pb.now.pos], [0, "a1", false, 0]);
  assert.equal(livePosition(pb, 60_000), 0, "paused: stays put");
  pb = play(pb, {}, ctx(10_000));
  assert.equal(pb.now.speaker, "dev-tv", "nobody was playing: the device that pressed play is the speaker");
  assert.equal(pb.beat, 10_000);
  assert.equal(livePosition(pb, 25_000), 15);
  assert.ok(isPlaying(pb, 25_000));
  assert.equal(livePosition({ ...pb, now:{ ...pb.now, duration:12 } }, 25_000), 12, "never past the end");
  const gone = 10_000 + SPEAKER_TIMEOUT_MS + 1;
  assert.equal(speakerOnline(pb, gone), false);
  assert.equal(isPlaying(pb, gone), false, "a speaker that went quiet isn't playing");
  assert.equal(livePosition(pb, gone), 0, "…and its clock stops where it was last stamped");
  pb = pause(pb, null, ctx(16_000));
  assert.deepEqual([pb.now.playing, pb.now.pos], [false, 6]);
  assert.equal(pause(pb, null, ctx(17_000)), undefined, "already paused: no change");
});

test("playback: the sound stays on the speaker whatever anyone does — only Play here moves it", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), {}, ctx(0, "dev-tv"));
  pb = pause(pb, null, ctx(5000, "dev-alex"));
  pb = play(pb, {}, ctx(6000, "dev-alex", { name:"Alex" }));
  assert.equal(pb.now.speaker, "dev-tv", "the speaker is still there: it plays");
  assert.equal(pb.now.by, "dev-alex");
  pb = play(pb, { index:3 }, ctx(7000, "dev-alex"));
  assert.deepEqual([pb.now.index, pb.now.videoId, pb.now.pos, pb.now.speaker], [3, "d4", 0, "dev-tv"], "a song from the list");

  /* the TV phone went quiet (locked, closed): a remote's play still plays there — it picks up when it's back */
  const later = 7000 + SPEAKER_TIMEOUT_MS + 1;
  const quiet = play(pause(pb, null, ctx(8000)), {}, ctx(later, "dev-alex", { name:"Alex", kind:"computer" }));
  assert.equal(quiet.now.speaker, "dev-tv", "a speaker that isn't responding keeps the sound");
  assert.equal(quiet.now.playing, true);
  assert.equal(isPlaying(quiet, later), false, "…but nothing shows as playing until it's back");
  assert.equal(play(quiet, { index:1 }, ctx(later, "dev-alex")).now.speaker, "dev-tv", "nor does picking a song move it");
  assert.equal(skip(quiet, 1, ctx(later, "dev-alex")).now.speaker, "dev-tv");
  /* Play here on a remote moves it, quiet speaker or not */
  const moved = takeOver(quiet, null, ctx(later, "dev-alex", { name:"Alex", kind:"computer" }));
  assert.deepEqual([moved.now.speaker, moved.now.speakerName, moved.now.speakerKind, moved.beat], ["dev-alex", "Alex", "computer", later]);

  /* Play here keeps the song, the time and playing as they were */
  const here = takeOver(pb, null, ctx(9000, "dev-alex", { name:"Alex" }));
  assert.deepEqual([here.now.speaker, here.now.videoId, here.now.playing, here.now.pos], ["dev-alex", "d4", true, 2]);
  assert.equal(takeOver(here, null, ctx(9500, "dev-alex")), undefined, "already here");
  assert.equal(play(here, { here:true }, ctx(9600, "dev-alex")).now.speaker, "dev-alex");
  assert.equal("release" in COMMANDS, false, "nothing hands the sound on by itself — not even closing the page");
});

test("playback: the speaker holds the music while its player is put away — a remote's play waits for it instead of calling the player back", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), {}, ctx(0, "dev-tv"));   /* the computer plays */
  assert.equal(hold(pb, { why:"wins" }, ctx(1000, "dev-alex")), undefined, "only the speaker holds it");

  /* the speaker opens the season wins: paused, and it'll play on when it's back */
  pb = hold(pb, { why:"wins" }, ctx(10_000, "dev-tv"));
  assert.deepEqual([pb.now.playing, pb.now.pos, pb.now.held, pb.now.heldFor, pb.now.resume], [false, 10, "dev-tv", "wins", true]);
  assert.ok(isHeld(pb) && wantsToPlay(pb, 20_000), "it shows as on its way back");
  assert.equal(hold(pb, { why:"wins" }, ctx(11_000, "dev-tv")), undefined, "already held");

  /* someone pauses meanwhile: it won't play on; their play puts it back — still paused, still held */
  pb = pause(pb, null, ctx(12_000, "dev-alex"));
  assert.deepEqual([pb.now.playing, pb.now.resume, isHeld(pb), wantsToPlay(pb, 12_000)], [false, false, true, false]);
  pb = play(pb, {}, ctx(13_000, "dev-alex"));
  assert.deepEqual([pb.now.playing, pb.now.resume, pb.now.speaker, pb.now.held], [false, true, "dev-tv", "dev-tv"], "the play waits — the player isn't called back");
  assert.equal(play(pb, {}, ctx(13_500, "dev-alex")), undefined, "a second play changes nothing");
  pb = play(pb, { index:2 }, ctx(14_000, "dev-alex"));
  assert.deepEqual([pb.now.videoId, pb.now.pos, pb.now.playing, pb.now.resume], ["c3", 0, false, true], "picking a song: that song, waiting");
  assert.equal(livePosition(pb, 60_000), 0, "the clock doesn't run while it's held");
  assert.equal(sync(pb, { rev:pb.now.rev, playing:true, pos:3 }, ctx(15_000, "dev-tv")).now.playing, false, "nor does a report from the speaker start it");

  /* the speaker leaves the season wins: it plays */
  assert.equal(unhold(pb, null, ctx(20_000, "dev-alex")), undefined, "only the device holding it lets go");
  const back = unhold(pb, null, ctx(20_000, "dev-tv"));
  assert.deepEqual([back.now.playing, back.now.videoId, back.now.held, back.now.resume, isHeld(back)], [true, "c3", null, null, false]);
  assert.equal(livePosition(back, 25_000), 5);
  assert.equal(unhold(back, null, ctx(21_000, "dev-tv")), undefined, "not held any more");
  /* …and paused when nobody wanted it meanwhile */
  const quietly = unhold(pause(pb, null, ctx(16_000, "dev-alex")), null, ctx(20_000, "dev-tv"));
  assert.deepEqual([quietly.now.playing, isHeld(quietly)], [false, false]);

  /* Play here while it's held: the sound moves, and the waiting play plays there */
  const moved = takeOver(pb, null, ctx(17_000, "dev-alex", { name:"Alex" }));
  assert.deepEqual([moved.now.speaker, moved.now.playing, moved.now.held, isHeld(moved)], ["dev-alex", true, null, false]);
  assert.equal(play(pb, { here:true }, ctx(17_000, "dev-alex")).now.speaker, "dev-alex", "play here too");
  assert.equal(play(pb, { here:true }, ctx(17_000, "dev-alex")).now.held, null);
});

test("playback: the sign-in screen holds the music the same way, and the welcome after it keeps the play waiting", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), {}, ctx(0, "dev-tv"));
  /* the speaker signs out: the sign-in screen puts its player away */
  pb = hold(pb, { why:"join" }, ctx(10_000, "dev-tv"));
  assert.deepEqual([pb.now.playing, pb.now.held, pb.now.heldFor, pb.now.resume], [false, "dev-tv", "join", true]);
  pb = play(pause(pb, null, ctx(10_500, "dev-alex")), {}, ctx(11_000, "dev-alex"));   /* someone pauses, then plays again */
  assert.deepEqual([pb.now.playing, pb.now.resume, pb.now.held, pb.now.speaker], [false, true, "dev-tv", "dev-tv"],
    "a remote's play waits — it never calls the player back over the sign-in screen");
  /* someone signs in there: the welcome holds it a moment longer, the play still waiting */
  pb = hold(pb, { why:"welcome" }, ctx(12_000, "dev-tv"));
  assert.deepEqual([pb.now.heldFor, pb.now.resume, pb.now.playing], ["welcome", true, false]);
  pb = unhold(pb, null, ctx(14_000, "dev-tv"));
  assert.deepEqual([pb.now.playing, isHeld(pb)], [true, false], "the welcome over: it plays");
});

test("playback: next, previous and a song ending go round the playlist — a song's end counts once", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), {}, ctx(0));
  pb = skip(pb, -1, ctx(1000, "dev-alex"));
  assert.deepEqual([pb.now.index, pb.now.videoId, pb.now.playing], [5, "f6", true], "previous from the first song: the last");
  pb = ended(pb, { videoId:"f6" }, ctx(2000));
  assert.deepEqual([pb.now.index, pb.now.videoId, pb.now.pos], [0, "a1", 0], "round to the start");
  assert.equal(ended(pb, { videoId:"f6" }, ctx(2100)), undefined, "the same end reported again moves nothing");
  assert.equal(skip(pb, 0, ctx(2200)), undefined);
  const paused = skip(pause(pb, null, ctx(3000)), 1, ctx(3000));
  assert.equal(paused.now.playing, false, "skipping while paused stays paused");
});

test("playback: seek clamps to the song; shuffle is one stored order for everyone and keeps the song playing", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), { index:2 }, ctx(0));
  pb = sync(pb, { rev:pb.now.rev, duration:200.4 }, ctx(1000));
  assert.equal(pb.now.duration, 200);
  assert.equal(seek(pb, 500, ctx(2000)).now.pos, 199);
  assert.equal(seek(pb, -5, ctx(2000)).now.pos, 0);
  assert.equal(seek(pb, NaN, ctx(2000)), undefined);

  pb = setShuffle(pb, true, ctx(3000, "dev-alex", { random:seq(0.1, 0.7, 0.3, 0.9, 0.5) }));
  assert.equal(pb.queue.shuffle, true);
  assert.deepEqual([pb.now.index, pb.now.videoId], [0, "c3"], "the song playing comes first");
  assert.deepEqual([...pb.queue.order].sort(), [...SONGS].sort(), "every song, once");
  assert.notDeepEqual(pb.queue.order, SONGS);
  assert.equal(pb.now.pos, 3, "the song carries on");
  assert.equal(pb.now.duration, 200, "same song: its length is kept");
  assert.equal(setShuffle(pb, true, ctx(3100)), undefined);
  const next = skip(pb, 1, ctx(4000));
  assert.equal(next.now.videoId, pb.queue.order[1], "next follows the shuffled order");

  const off = setShuffle(next, false, ctx(5000));
  assert.deepEqual(off.queue.order, SONGS);
  assert.equal(off.now.videoId, next.now.videoId);
  assert.equal(off.now.index, SONGS.indexOf(next.now.videoId));

  assert.deepEqual(shuffled(["x"], "x"), ["x"]);
  assert.deepEqual(shuffled([], null), []);
});

test("playback: a new playlist keeps shuffle and playing; reading the same list again keeps the song", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), { index:4 }, ctx(0));
  assert.equal(load(pb, { listId:"PL", setAt:1, songs:SONGS }, ctx(10)), undefined, "already read");
  assert.equal(load(pb, { listId:"PL2", setAt:2, songs:[] }, ctx(10)), undefined, "no songs: nothing to play");
  pb = setShuffle(pb, true, ctx(1000));
  const reread = load(pb, { listId:"PL", setAt:3, songs:[...SONGS, "g7"] }, ctx(5000));
  assert.equal(reread.now.videoId, "e5", "re-pasting the link: the song playing carries on");
  assert.equal(reread.queue.order[0], "e5");
  assert.equal(reread.queue.songs.length, 7);
  assert.equal(reread.now.pos, 5);
  const fresh = load(pb, { listId:"PL2", setAt:4, songs:["z1", "z2", "z3"] }, ctx(6000));
  assert.deepEqual([fresh.queue.shuffle, fresh.now.playing, fresh.now.pos, fresh.now.speaker], [true, true, 0, "dev-tv"]);
  assert.equal(fresh.queue.order.length, 3);
});

test("playback: only the speaker reports what its player does, and only about the latest change", () => {
  let pb = play(load(null, { listId:"PL", setAt:1, songs:SONGS }, ctx(0)), {}, ctx(0, "dev-tv"));
  const rev = pb.now.rev;
  assert.equal(sync(pb, { rev, pos:1 }, ctx(5000, "dev-alex")), undefined, "a remote can't");
  const behind = sync(pb, { rev, pos:2.5 }, ctx(5000));
  assert.deepEqual([behind.now.pos, behind.now.at, behind.beat], [2.5, 5000, 5000], "buffering held it back");
  const skipped = skip(pb, 1, ctx(5000, "dev-alex"));
  assert.equal(sync(skipped, { rev, playing:false }, ctx(5100)), undefined, "a report about an older change never undoes a newer one");
  assert.equal(sync(pb, { rev }, ctx(5000)), undefined, "nothing to report");
  assert.equal(sync(pb, { rev, playing:false, pos:4 }, ctx(5000)).now.playing, false, "paused on the video itself");
});

test("playback through the service: two phones on one store, transactions, the beat", async () => {
  const store = new MemoryStore();
  let t = 1000;
  const tv = new GameService(store, { deviceId:"dev-tv", now:() => t });
  const alex = new GameService(store, { deviceId:"dev-alex", now:() => t });
  const seen = [];
  const off = alex.watchPlayback(pb => seen.push(pb?.now?.videoId ?? null));
  await new Promise(r => setTimeout(r, 0));

  assert.equal(await alex.controlMusic("play"), false, "no songs yet: nothing happens");
  assert.equal(await tv.controlMusic("load", { listId:"PL", setAt:1, songs:SONGS }), true);
  assert.equal(await alex.controlMusic("load", { listId:"PL", setAt:1, songs:SONGS }), false, "two phones reading the same list: once");
  await tv.controlMusic("play", {}, { name:"Sam", kind:"phone" });
  t = 2000;
  await Promise.all([alex.controlMusic("skip", 1), alex.controlMusic("skip", 1)]);
  let pb = await tv.store.get("v1/playback");
  assert.deepEqual([pb.now.index, pb.now.videoId, pb.now.speaker, pb.now.speakerName], [2, "c3", "dev-tv", "Sam"], "both taps count; the TV still plays");
  t = 3000;
  await Promise.all([tv.controlMusic("ended", { videoId:"c3" }), tv.controlMusic("ended", { videoId:"c3" })]);
  pb = await tv.store.get("v1/playback");
  assert.equal(pb.now.videoId, "d4", "one song end, one step");
  assert.equal(pb.now.duration, undefined, "a new song's length is unknown until the speaker reports it");

  t = 3000 + BEAT_MS;
  await tv.musicBeat();
  assert.equal((await alex.store.get("v1/playback")).beat, t);
  await new Promise(r => setTimeout(r, 0));
  off();
  /* every change reaches the other phone (the two quick skips arrive as one) */
  assert.deepEqual(seen.filter((v, i) => v !== seen[i - 1]), [null, "a1", "c3", "d4"]);
  await assert.rejects(tv.controlMusic("explode"), e => e instanceof GameError && e.code === "bad-command");
});
