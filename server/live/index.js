/**
 * Sets up the live channel when LIVE_CHANNEL=true: a Jellyfin Live TV channel
 * that plays the party queue (see the README section "Karaoke Party channel").
 *
 *   LIVE_CHANNEL           true to turn it on
 *   LIVE_NEXT_UP_SECONDS   how long the "up next" card shows (default 8)
 *   PUBLIC_URL             address phones use to join, for the QR code
 *                          (default: the address Jellyfin reached the channel on)
 *   FFMPEG_PATH            ffmpeg to use (default: ffmpeg)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { SegmentWindow } = require("./segments");
const { LiveChannel } = require("./channel");
const { handleLiveRequest } = require("./http");

function liveSettings(env = process.env) {
  const nextUp = Number(env.LIVE_NEXT_UP_SECONDS);
  return {
    enabled: (env.LIVE_CHANNEL || "").toLowerCase() === "true",
    nextUpSeconds: Number.isFinite(nextUp) && nextUp > 0 ? nextUp : 8,
    ffmpeg: env.FFMPEG_PATH || "ffmpeg",
    joinUrl: (env.PUBLIC_URL || "").replace(/\/+$/, "") || null,
  };
}

function createLiveChannel({
  port,
  getSession,
  actions,
  env = process.env,
  log = console,
}) {
  const settings = liveSettings(env);
  if (!settings.enabled) return null;
  if (spawnSync(settings.ffmpeg, ["-version"]).status !== 0) {
    log.error(
      `[live] LIVE_CHANNEL is on but ffmpeg wasn't found (${settings.ffmpeg})`
    );
  }
  const dir = path.join(os.tmpdir(), "karaoke-live");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const window = new SegmentWindow(dir);
  const channel = new LiveChannel({
    getSession,
    actions,
    window,
    dir,
    baseUrl: `http://127.0.0.1:${port}`,
    config: settings,
  });
  const timers = [
    setInterval(() => channel.sync(), 1000),
    setInterval(() => channel.reportProgress(), 2000),
  ];
  timers.forEach(timer => timer.unref());
  log.info("[live] Karaoke Party channel ready at /api/live/channel.m3u");
  return {
    channel,
    window,
    handle: (req, res) => handleLiveRequest(req, res, { channel, window }),
    stop() {
      timers.forEach(clearInterval);
      return channel.stop();
    },
  };
}

module.exports = { createLiveChannel, liveSettings };
