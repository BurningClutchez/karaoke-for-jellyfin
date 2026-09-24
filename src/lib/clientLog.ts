// Sends browser errors to the server log (/api/client-log), since nobody
// watches the TV's browser console. Throttled and de-duplicated so a
// repeating error can't flood the server.

export type ClientLogLevel = "error" | "warn";

const MAX_PER_MINUTE = 10;
const recent: { message: string; at: number }[] = [];

export function clientSource(pathname: string): string {
  if (pathname.startsWith("/tv")) return "tv";
  if (pathname.startsWith("/admin")) return "admin";
  return "mobile";
}

/** True when this report should be sent (not a repeat, not over the limit) */
export function shouldSend(message: string, now: number = Date.now()) {
  while (recent.length > 0 && now - recent[0].at > 60000) recent.shift();
  if (recent.length >= MAX_PER_MINUTE) return false;
  if (recent.some(entry => entry.message === message)) return false;
  recent.push({ message, at: now });
  return true;
}

/** Test hook */
export function resetClientLog() {
  recent.length = 0;
}

export function reportClientError(
  level: ClientLogLevel,
  message: string,
  stack?: string
): void {
  if (typeof window === "undefined" || !shouldSend(message)) return;
  const body = JSON.stringify({
    level,
    message,
    stack,
    url: window.location.pathname,
    source: clientSource(window.location.pathname),
  });
  try {
    if (navigator.sendBeacon?.("/api/client-log", body)) return;
    fetch("/api/client-log", { method: "POST", body, keepalive: true }).catch(
      () => {}
    );
  } catch {
    // Reporting must never cause another error
  }
}
