/**
 * Socket.IO safety net: every handler registered on a socket is wrapped so a
 * thrown error or rejected promise is logged and reported to that client
 * instead of crashing the server (which would lose the in-memory queue).
 * Payloads of the main events are checked before the handler runs, and each
 * socket may send the user-driven events only so often.
 */

const isObject = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const VALIDATORS = {
  "join-session": data =>
    isObject(data) && isText(data.sessionId, 100) && isText(data.userName, 100)
      ? null
      : "join-session needs a sessionId and userName",
  "add-song": data => {
    if (!isObject(data) || !isObject(data.mediaItem)) {
      return "add-song needs a mediaItem";
    }
    const { id, title } = data.mediaItem;
    if (!isText(id, 200) || !isText(title, 500)) {
      return "mediaItem needs an id and title";
    }
    const { position } = data;
    return position === undefined ||
      (Number.isInteger(position) && position >= 0)
      ? null
      : "position must be a whole number of 0 or more";
  },
  "remove-song": data =>
    isObject(data) && isText(data.queueItemId, 200)
      ? null
      : "remove-song needs a queueItemId",
  "playback-control": command =>
    isObject(command) && isText(command.action, 50)
      ? null
      : "playback-control needs an action",
  "send-reaction": data =>
    isObject(data) ? null : "send-reaction needs a reaction",
  "playback-failed": data =>
    isObject(data) && isText(data.title, 500) && isText(data.reason, 500)
      ? null
      : "playback-failed needs a title and reason",
};

// Most of each event one socket may send per minute. Events not listed (the
// TV's playback-control time updates, heartbeats, song-ended) aren't limited.
const RATE_LIMITS = {
  "join-session": 20,
  "add-song": 30,
  "remove-song": 60,
  "skip-song": 30,
  "send-reaction": 60,
  "playback-failed": 30,
};
const RATE_WINDOW_MS = 60000;

/** Returns allow(event): false once the socket is over that event's limit */
function createRateLimiter(limits = RATE_LIMITS, now = Date.now) {
  const sent = {};
  return event => {
    const limit = limits[event];
    if (!limit) return true;
    const at = now();
    const recent = (sent[event] || []).filter(t => at - t < RATE_WINDOW_MS);
    sent[event] = recent;
    if (recent.length >= limit) return false;
    recent.push(at);
    return true;
  };
}

/** Returns an error message for a bad payload, or null when it's acceptable */
function validatePayload(event, payload) {
  const validate = VALIDATORS[event];
  return validate ? validate(payload) : null;
}

function reportFailure(socket, event, error, log) {
  log.error(`[socket] "${event}" handler failed:`, error);
  try {
    socket.emit("error", {
      code: "SERVER_ERROR",
      message: "Something went wrong. Please try again.",
    });
  } catch {
    // The socket may already be gone
  }
}

/** Wrap every handler later registered with socket.on */
function guardSocketHandlers(
  socket,
  log = console,
  allow = createRateLimiter()
) {
  const on = socket.on.bind(socket);
  // Events already warned about, so a flood logs one line per event
  const limited = new Set();
  socket.on = (event, handler) =>
    on(event, (...args) => {
      if (!allow(event)) {
        if (!limited.has(event)) {
          limited.add(event);
          log.warn(`[socket] rate-limited "${event}" from ${socket.id}`);
        }
        socket.emit("error", {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait a moment and try again.",
        });
        return;
      }
      limited.delete(event);
      const problem = validatePayload(event, args[0]);
      if (problem) {
        log.warn(`[socket] rejected "${event}" from ${socket.id}: ${problem}`);
        socket.emit("error", { code: "INVALID_REQUEST", message: problem });
        return;
      }
      try {
        const result = handler(...args);
        if (result && typeof result.then === "function") {
          result.catch(error => reportFailure(socket, event, error, log));
        }
      } catch (error) {
        reportFailure(socket, event, error, log);
      }
    });
  return socket;
}

module.exports = {
  guardSocketHandlers,
  validatePayload,
  createRateLimiter,
  RATE_LIMITS,
};
