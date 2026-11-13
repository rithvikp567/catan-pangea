/**
 * Playlist links, without any DOM or network: turn whatever people paste
 * into a YouTube playlist id, and explain YouTube player errors.
 * The same ids work for YouTube and YouTube Music.
 */

const HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com",
]);

/** Lists that only exist for the signed-in owner — the embedded player can't open them. */
const PRIVATE_LISTS = new Map([
  ["LL", "Liked videos"], ["LM", "Liked music"], ["WL", "Watch later"],
]);

const ID = /^[A-Za-z0-9_-]{2,64}$/;

/**
 * @param {string} raw  a playlist link (YouTube or YouTube Music), a watch
 *   or youtu.be link that plays from a playlist, or a bare playlist id
 * @returns {{ listId:string } | { error:string }}
 */
export function parsePlaylist(raw){
  const text = String(raw ?? "").trim();
  if(!text) return { error:"Paste a playlist link." };

  let listId = null;
  if(ID.test(text) && !/^(https?|www)/i.test(text)) listId = text;
  else{
    let url;
    try{ url = new URL(/^https?:\/\//i.test(text) ? text : "https://" + text); }
    catch{ return { error:"That isn't a link." }; }
    if(!HOSTS.has(url.hostname.toLowerCase())) return { error:"That isn't a YouTube or YouTube Music link." };
    listId = url.searchParams.get("list");
    if(!listId) return { error:"That link is a single video, not a playlist. Open the playlist and share that link." };
  }

  if(!ID.test(listId)) return { error:"That playlist link looks incomplete." };
  if(PRIVATE_LISTS.has(listId)){
    return { error:`"${PRIVATE_LISTS.get(listId)}" is private to your account, so YouTube won't play it here. Copy its songs into a public or unlisted playlist and paste that link.` };
  }
  return { listId };
}

/** Link to open the playlist in YouTube Music (the app, if installed). */
export const playlistUrl = listId => `https://music.youtube.com/playlist?list=${encodeURIComponent(listId)}`;

/** Thumbnail for a song (16:9, 320×180). */
export const thumbnailUrl = videoId => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;

/**
 * YouTube IFrame player error codes.
 * @returns {{ skip:boolean, message:string }}  skip: move on to the next song
 */
export function describePlayerError(code){
  switch(Number(code)){
    case 101: case 150:
      return { skip:true, message:"Skipped a song its owner doesn't allow outside YouTube." };
    case 100:
      return { skip:true, message:"Skipped a song that was removed or made private." };
    case 5:
      return { skip:true, message:"Skipped a song that won't play in this browser." };
    case 2:
      return { skip:false, message:"YouTube couldn't open that playlist. Check that it's public or unlisted." };
    default:
      return { skip:false, message:"YouTube had a problem playing this." };
  }
}
