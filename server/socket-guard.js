/**
 * Socket.IO safety net: every handler registered on a socket is wrapped so a
 * thrown error or rejected promise is logged and reported to that client
 * instead of crashing the server (which would lose the in-memory queue).
 * Payloads of the main events are checked before the handler runs.
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
};

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
function guardSocketHandlers(socket, log = console) {
  const on = socket.on.bind(socket);
  socket.on = (event, handler) =>
    on(event, (...args) => {
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

module.exports = { guardSocketHandlers, validatePayload };
