/**
 * The live channel's items: what should be on screen for the queue's state,
 * and how to prepare and encode each one.
 */
const { songArgs, cardArgs, itemPlaylist } = require("./ffmpeg-args");

/**
 * The item the queue calls for: the current song (or a paused card while it's
 * paused), an "up next" card before the next song, or the waiting card.
 */
function desiredItem(session) {
  const song = session?.currentSong;
  if (song) {
    return session.playbackState?.isPlaying === false
      ? { key: `paused:${song.id}`, kind: "paused", song }
      : { key: `song:${song.id}`, kind: "song", song };
  }
  const next = session?.queue?.find(item => item.status === "pending");
  if (next) return { key: `nextup:${next.id}`, kind: "nextup", song: next };
  return { key: "waiting", kind: "waiting" };
}

/** The files an item needs (see media.js) */
function prepareItem(want, prepare, { baseUrl, dir, joinUrl, log }) {
  return want.kind === "song"
    ? prepare.prepareSong(want.song, { baseUrl, dir, log })
    : prepare.prepareCard(want, { dir, joinUrl });
}

/**
 * ffmpeg arguments for an item, continuing the window's timestamps and segment
 * numbers, and the item playlist to watch. Only the "up next" card has a
 * fixed length.
 */
function encodeItem(want, files, { window, dir, startAt, nextUpSeconds }) {
  // A 0.1 s gap keeps the previous item's last audio packets in order
  const output = {
    offset: window.offset + 0.1,
    startNumber: window.nextNumber,
    dir,
  };
  const playlistPath = itemPlaylist(dir, output.startNumber);
  if (want.kind === "song") {
    return { args: songArgs({ ...files, startAt, ...output }), playlistPath };
  }
  const seconds = want.kind === "nextup" ? nextUpSeconds : undefined;
  return { args: cardArgs({ ...files, seconds, ...output }), playlistPath };
}

/** Who is watching: continuous-stream viewers, and HLS viewers seen lately */
class Audience {
  constructor(now, graceMs) {
    Object.assign(this, { now, graceMs, viewers: 0, seenAt: -Infinity });
  }

  /** Returns the function to call when the viewer leaves */
  join() {
    this.viewers += 1;
    return () => {
      this.viewers -= 1;
      this.seenAt = this.now();
    };
  }

  seen() {
    this.seenAt = this.now();
  }

  isWatching() {
    return this.viewers > 0 || this.now() - this.seenAt < this.graceMs;
  }
}

module.exports = { desiredItem, prepareItem, encodeItem, Audience };
