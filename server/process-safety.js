/**
 * Process-level safety: log (rather than die on) unexpected errors, and shut
 * down cleanly when Docker or systemd asks, so sockets close and in-flight
 * requests finish.
 */

function installProcessHandlers(proc = process, log = console) {
  proc.on("unhandledRejection", reason => {
    log.error("[process] Unhandled promise rejection:", reason);
  });
  proc.on("uncaughtException", error => {
    // Keep serving: the queue lives in memory and a restart would lose it
    log.error("[process] Uncaught exception:", error);
  });
}

/**
 * Close Socket.IO and the HTTP server on SIGTERM/SIGINT, then exit. Forces
 * the exit after timeoutMs if something hangs.
 */
function installGracefulShutdown(
  { server, io },
  { proc = process, log = console, timeoutMs = 10000 } = {}
) {
  let stopping = false;
  const shutdown = signal => {
    if (stopping) return;
    stopping = true;
    log.info(`[process] ${signal} received, shutting down`);
    const timer = setTimeout(() => proc.exit(1), timeoutMs);
    if (timer.unref) timer.unref();
    io.close(() => {
      server.close(() => proc.exit(0));
    });
  };
  proc.on("SIGTERM", () => shutdown("SIGTERM"));
  proc.on("SIGINT", () => shutdown("SIGINT"));
  return shutdown;
}

module.exports = { installProcessHandlers, installGracefulShutdown };
