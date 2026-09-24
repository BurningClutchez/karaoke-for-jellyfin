/**
 * The TV reports a song it couldn't play (after retrying) before skipping
 * it. Log it and tell everyone in the session, so the singer knows why their
 * song vanished.
 */
const clip = (text, max) => String(text).slice(0, max);

function handlePlaybackFailed(io, socket, data, currentSession, log = console) {
  const title = clip(data.title || "A song", 200);
  const reason = clip(data.reason || "unknown error", 200);
  log.warn(`[playback] "${title}" failed on the TV (${socket.id}): ${reason}`);
  if (!currentSession) return;
  io.to(currentSession.id).emit("notice", {
    level: "warn",
    message: `"${title}" couldn't play (${reason}) and was skipped`,
  });
}

module.exports = { handlePlaybackFailed };
