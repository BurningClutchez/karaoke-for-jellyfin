/**
 * HTTP endpoints of the live channel, answered by server.js before Next.js:
 *
 *   /api/live/channel.m3u   M3U playlist for Jellyfin's M3U tuner (?format=hls for HLS)
 *   /api/live/stream.ts     the channel as one continuous MPEG-TS stream
 *   /api/live/stream.m3u8   the channel as live HLS
 *   /api/live/seg_N.ts      an HLS segment
 *   /api/live/status        what the channel is doing (JSON)
 */
const fs = require("fs");
const path = require("path");

const PREFIX = "/api/live/";
const FIRST_SEGMENT_WAIT_MS = 15000;

function baseUrlOf(req) {
  const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return `${proto}://${req.headers.host || "localhost"}`;
}

function channelM3u(req, format) {
  const base = baseUrlOf(req);
  const stream = format === "hls" ? "stream.m3u8" : "stream.ts";
  return [
    "#EXTM3U",
    `#EXTINF:-1 tvg-id="karaoke-party" tvg-name="Karaoke Party" tvg-logo="${base}/icons/icon-512x512.png" group-title="Karaoke",Karaoke Party`,
    `${base}${PREFIX}${stream}`,
    "",
  ].join("\n");
}

/** Send segments one after another, in order, as they are finished */
function streamTs(req, res, { channel, window }) {
  res.writeHead(200, {
    "Content-Type": "video/mp2t",
    "Cache-Control": "no-store",
  });
  const queue = window.segments.slice(-2).map(segment => segment.name);
  let sending = false;
  let closed = false;
  const sendNext = () => {
    if (sending || closed || queue.length === 0) return;
    sending = true;
    const file = fs.createReadStream(path.join(window.dir, queue.shift()));
    file.on("error", () => {
      sending = false;
      sendNext(); // deleted before we got to it; skip it
    });
    file.on("end", () => {
      sending = false;
      sendNext();
    });
    file.pipe(res, { end: false });
  };
  const unsubscribe = window.subscribe(segment => {
    queue.push(segment.name);
    sendNext();
  });
  const leave = channel.addViewer();
  req.on("close", () => {
    closed = true;
    unsubscribe();
    leave();
  });
  sendNext();
}

/** The HLS playlist, waiting briefly for the first segment when starting up */
async function streamM3u8(
  res,
  { channel, window },
  wait = FIRST_SEGMENT_WAIT_MS
) {
  channel.touch();
  const deadline = Date.now() + wait;
  while (window.segments.length < 2 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    channel.touch();
  }
  res.writeHead(200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": "no-store",
  });
  res.end(window.playlist());
}

function sendSegment(res, name, { channel, window }) {
  if (!window.has(name)) {
    res.writeHead(404);
    return res.end();
  }
  channel.touch();
  res.writeHead(200, { "Content-Type": "video/mp2t" });
  fs.createReadStream(path.join(window.dir, name))
    .on("error", () => res.end())
    .pipe(res);
}

/** Answer a live-channel request; returns false for other URLs */
function handleLiveRequest(req, res, live) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith(PREFIX) || req.method !== "GET") return false;
  const name = url.pathname.slice(PREFIX.length);
  // Jellyfin reaches the channel on the address phones use too (for the QR code)
  if (!live.channel.joinUrl && name !== "status") {
    live.channel.joinUrl = baseUrlOf(req);
  }
  if (name === "channel.m3u") {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    res.end(channelM3u(req, url.searchParams.get("format")));
  } else if (name === "stream.ts") {
    streamTs(req, res, live);
  } else if (name === "stream.m3u8") {
    streamM3u8(res, live);
  } else if (/^seg_\d+\.ts$/.test(name)) {
    sendSegment(res, name, live);
  } else if (name === "status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(live.channel.status()));
  } else {
    return false;
  }
  return true;
}

module.exports = { handleLiveRequest, channelM3u, baseUrlOf };
