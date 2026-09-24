/**
 * CD+G video pre-rendering
 *
 * When a song is queued, ask the Karaoke CDG Jellyfin plugin to render its
 * graphics video (option C) straight away, so the video is already cached
 * when the song's turn comes. Songs without a .cdg file get a quick 404.
 */

const ITEM_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Pre-render by default only when the TV always uses plugin video
 * (CDG_MODE=video). CDG_PRERENDER=true/false overrides that.
 */
function shouldPrerender(env = process.env) {
  const setting = (env.CDG_PRERENDER || "").toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;
  return (env.CDG_MODE || "").toLowerCase() === "video";
}

/**
 * Fire-and-forget request that makes the plugin render and cache the video.
 * Asks for a single byte, so the plugin does the full render but sends back
 * almost nothing. Resolves to the HTTP status, or null if skipped or failed.
 */
function prerenderCdgVideo(mediaItem, options = {}) {
  const { env = process.env, fetchImpl = fetch, log = console } = options;
  const itemId = mediaItem && mediaItem.jellyfinId;
  const baseUrl = (env.JELLYFIN_SERVER_URL || "").replace(/\/$/, "");
  if (
    !shouldPrerender(env) ||
    !baseUrl ||
    !ITEM_ID_PATTERN.test(itemId || "")
  ) {
    return Promise.resolve(null);
  }

  return fetchImpl(`${baseUrl}/Karaoke/Video/${itemId}`, {
    headers: {
      "X-Emby-Token": env.JELLYFIN_API_KEY || "",
      Range: "bytes=0-0",
    },
  })
    .then(response => response.status)
    .catch(error => {
      log.warn("CDG video pre-render failed:", error.message);
      return null;
    });
}

module.exports = { shouldPrerender, prerenderCdgVideo };
