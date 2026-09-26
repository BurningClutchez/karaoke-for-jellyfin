/**
 * Notices a TV that has stopped playing: the server thinks a song is playing
 * and a TV is connected, but the TV hasn't reported any progress (a
 * "time-update" with a new position) for a while. Causes: stuck buffering, a
 * hung tab, a TV that went to sleep, or autoplay being blocked.
 *
 *   PLAYBACK_STALL_SECONDS  seconds without progress before acting (default 60, 0 = off)
 *   PLAYBACK_STALL_ACTION   notify (default: log and tell the phones) | skip (also skip the song)
 */
const DEFAULT_STALL_SECONDS = 60;
const CHECK_INTERVAL_MS = 5000;

function stallSettings(env = process.env) {
  const raw = env.PLAYBACK_STALL_SECONDS;
  const seconds =
    raw === undefined || raw.trim() === ""
      ? DEFAULT_STALL_SECONDS
      : Number(raw);
  const action = (env.PLAYBACK_STALL_ACTION || "notify").toLowerCase();
  return {
    stallMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0,
    action: action === "skip" ? "skip" : "notify",
  };
}

/**
 * check() returns { song, seconds } once per stalled song, or null.
 * noteProgress(position) returns true when a reported stall has recovered.
 */
function createPlaybackWatchdog({
  getSession,
  isTvConnected,
  stallMs,
  now = Date.now,
}) {
  let songId = null;
  let lastPosition = null;
  let lastProgressAt = now();
  let reported = false;

  const restart = id => {
    songId = id;
    lastPosition = null;
    lastProgressAt = now();
    reported = false;
  };

  return {
    noteProgress(position) {
      if (position === lastPosition) return false;
      lastPosition = position;
      lastProgressAt = now();
      const recovered = reported;
      reported = false;
      return recovered;
    },

    check() {
      const session = getSession();
      const song = session?.currentSong;
      // Paused, between songs or no TV: nothing to watch, restart the clock
      if (!song || !session.playbackState?.isPlaying || !isTvConnected()) {
        restart(song?.id ?? null);
        return null;
      }
      if (song.id !== songId) {
        restart(song.id);
        return null;
      }
      if (reported || now() - lastProgressAt < stallMs) return null;
      reported = true;
      return { song, seconds: Math.round((now() - lastProgressAt) / 1000) };
    },
  };
}

/** The message phones see when the TV is stuck */
function stallNotice(title, action) {
  return action === "skip"
    ? `The TV got stuck on "${title}", so it was skipped`
    : `The TV seems stuck on "${title}". Check the TV or skip the song`;
}

module.exports = {
  createPlaybackWatchdog,
  stallSettings,
  stallNotice,
  CHECK_INTERVAL_MS,
};
