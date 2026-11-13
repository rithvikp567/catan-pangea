import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaylist, describePlayerError, playlistUrl } from "../catan-pangea/src/music/playlist.js";
import { MemoryStore } from "../catan-pangea/src/sync/MemoryStore.js";
import { GameService, GameError } from "../catan-pangea/src/game/GameService.js";

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

test("where each player is in the music follows them to another device; removing the profile drops it", async () => {
  const store = new MemoryStore();
  const phone = new GameService(store, { deviceId:"dev-phone", now:() => 5000 });
  const laptop = new GameService(store, { deviceId:"dev-laptop" });
  const id = await phone.createProfile("Dee");
  assert.equal(await laptop.listening(id), null);
  const spot = { listId:"PLtable", videoId:"vid3", index:2, count:20, t:95, duration:200, playing:true, open:true, shuffle:false };
  await phone.saveListening(id, spot);
  assert.deepEqual(await laptop.listening(id), { ...spot, at:5000, deviceId:"dev-phone" });
  assert.equal((await laptop.state()).profiles.length, 1, "not part of the watched game state");
  await phone.saveListening(id, { listId:"PLtable" });
  assert.equal((await laptop.listening(id)).videoId, "vid3", "a spot without a song is ignored");
  await laptop.removeProfile(id);
  assert.equal(await laptop.listening(id), null);
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
