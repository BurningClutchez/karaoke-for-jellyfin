/**
 * Moves a pending song to a new place among the pending songs.
 *
 * `newPosition` counts pending songs only (what the host controls show), so
 * the playing and finished songs keep their places. Returns an error code, or
 * null when the queue was changed.
 */
function movePendingSong(queue, queueItemId, newPosition) {
  const slots = [];
  queue.forEach((item, idx) => {
    if (item.status === "pending") slots.push(idx);
  });
  const pending = slots.map(idx => queue[idx]);
  const from = pending.findIndex(item => item.id === queueItemId);
  if (from === -1) return "SONG_NOT_FOUND";

  const to = Math.min(Math.max(newPosition, 0), pending.length - 1);
  const [moved] = pending.splice(from, 1);
  pending.splice(to, 0, moved);
  slots.forEach((idx, i) => {
    queue[idx] = pending[i];
  });
  queue.forEach((item, idx) => {
    item.position = idx;
  });
  return null;
}

function handleReorderQueue(io, socket, data, currentSession) {
  if (!currentSession) {
    socket.emit("error", {
      code: "NOT_IN_SESSION",
      message: "You must join a session first",
    });
    return;
  }

  const { queueItemId, newPosition } = data;
  const error = movePendingSong(currentSession.queue, queueItemId, newPosition);
  if (error) {
    socket.emit("error", {
      code: error,
      message: "That song isn't waiting in the queue any more",
    });
    return;
  }

  io.to(currentSession.id || "main-session").emit(
    "queue-updated",
    currentSession.queue
  );
  console.log(`Queue reordered: ${queueItemId} moved to ${newPosition}`);
}

module.exports = { handleReorderQueue, movePendingSong };
