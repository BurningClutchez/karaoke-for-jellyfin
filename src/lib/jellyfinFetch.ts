// fetch() for calls to Jellyfin: gives up if Jellyfin doesn't start answering
// within the timeout, and retries read-only requests once when the network
// fails or Jellyfin is briefly unavailable. The timeout covers only the wait
// for the response headers, so long audio and video streams aren't cut off.

export const JELLYFIN_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 300;
const RETRY_STATUSES = new Set([502, 503, 504]);

export class JellyfinTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(
      `Jellyfin did not respond within ${timeoutMs / 1000}s: ${redactUrl(url)}`
    );
    this.name = "JellyfinTimeoutError";
  }
}

/** Hides API keys in URLs before they reach logs or error messages */
export function redactUrl(url: string): string {
  return url.replace(/(api_key|ApiKey|token)=[^&]*/gi, "$1=***");
}

async function attempt(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted)
      throw new JellyfinTimeoutError(url, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const isReadOnly = (init: RequestInit) =>
  !init.method || ["GET", "HEAD"].includes(init.method.toUpperCase());

export async function jellyfinFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = JELLYFIN_TIMEOUT_MS
): Promise<Response> {
  if (!isReadOnly(init)) return attempt(url, init, timeoutMs);
  try {
    const response = await attempt(url, init, timeoutMs);
    if (!RETRY_STATUSES.has(response.status)) return response;
  } catch (error) {
    if (error instanceof JellyfinTimeoutError) throw error;
  }
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  return attempt(url, init, timeoutMs);
}
export { mediaBrowserToken, jellyfinAuthHeaders } from "./jellyfinAuth";
