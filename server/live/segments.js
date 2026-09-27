/**
 * The live channel's recent segments. Each item's ffmpeg lists the segments it
 * finishes in its own HLS playlist; they are added here, old ones are deleted,
 * and listeners (continuous-stream viewers) hear about each new one.
 */
const fs = require("fs");
const path = require("path");
const { spawn: nodeSpawn } = require("child_process");

const KEEP_SEGMENTS = 8; // about 30 seconds
const POLL_MS = 300;

class SegmentWindow {
  constructor(dir, { keep = KEEP_SEGMENTS, fsModule = fs } = {}) {
    this.dir = dir;
    this.keep = keep;
    this.fs = fsModule;
    this.segments = []; // { name, duration, seq }
    this.offset = 0; // where the next item's timestamps start (seconds)
    this.nextNumber = 1; // segment number the next item starts at
    this.listeners = new Set();
  }

  add(name, duration) {
    // The number in the name is the HLS media sequence number
    const seq = Number(name.match(/\d+/)[0]);
    const segment = { name, duration, seq };
    this.offset += duration;
    this.nextNumber = seq + 1;
    this.segments.push(segment);
    while (this.segments.length > this.keep) {
      const old = this.segments.shift();
      this.fs.rm(path.join(this.dir, old.name), { force: true }, () => {});
    }
    this.listeners.forEach(listener => listener(segment));
    return segment;
  }

  /** Add the segments of an item playlist not seen yet; `seen` is per item */
  addFromPlaylist(text, seen) {
    const entries = [
      ...String(text).matchAll(/#EXTINF:([\d.]+),\s*\n(seg_\d+\.ts)/g),
    ];
    for (const [, duration, name] of entries) {
      if (seen.has(name)) continue;
      seen.add(name);
      this.add(name, Number(duration));
    }
  }

  has(name) {
    return this.segments.some(segment => segment.name === name);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A live HLS playlist of the segments in the window */
  playlist() {
    const target = Math.ceil(
      Math.max(4, ...this.segments.map(s => s.duration))
    );
    const first = this.segments[0]?.seq ?? 0;
    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${target}`,
      `#EXT-X-MEDIA-SEQUENCE:${first}`,
      ...this.segments.flatMap(s => [
        `#EXTINF:${s.duration.toFixed(3)},`,
        s.name,
      ]),
    ];
    return lines.join("\n") + "\n";
  }
}

/**
 * Run one item's ffmpeg, adding the segments it lists in `playlistPath` to
 * the window. Resolves `done` with { code, stopped, error } when ffmpeg
 * exits; stop() ends it early, letting it finish the current segment first.
 */
function runItem(window, ffmpegArgs, options = {}) {
  const {
    playlistPath,
    spawn = nodeSpawn,
    ffmpeg = "ffmpeg",
    log = console,
  } = options;
  const readFile =
    options.readFile || (file => fs.promises.readFile(file, "utf8"));
  let stopped = false;
  let stderr = "";
  const seen = new Set();
  const collect = () =>
    readFile(playlistPath).then(
      text => window.addFromPlaylist(text, seen),
      () => {} // not written yet
    );
  const poll = setInterval(collect, POLL_MS);
  const child = spawn(ffmpeg, ffmpegArgs, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", chunk => {
    stderr = (stderr + chunk).slice(-2000);
  });
  const done = new Promise(resolve => {
    child.on("error", error => {
      log.error(`[live] couldn't start ffmpeg: ${error.message}`);
      resolve({ code: -1, stopped, error: error.message });
    });
    child.on("close", code => resolve({ code, stopped, error: stderr.trim() }));
  }).then(async result => {
    clearInterval(poll);
    await collect();
    fs.rm(playlistPath, { force: true }, () => {});
    return result;
  });
  const stop = () => {
    if (stopped) return done;
    stopped = true;
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 3000);
    return done.finally(() => clearTimeout(force));
  };
  return { done, stop };
}

module.exports = { SegmentWindow, runItem, KEEP_SEGMENTS };
