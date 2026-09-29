/**
 * The live channel: plays the party queue as one continuous stream while
 * someone is watching. It shows what the queue says should be on screen (the
 * current song, a paused card, an "up next" card, or the waiting card) and, as
 * the channel is the TV here, ends songs and starts the next one itself.
 */
const { desiredItem, prepareItem, encodeItem, Audience } = require("./items");
const { runItem } = require("./segments");
const media = require("./media");

const GRACE_MS = 30000; // keep going this long after the last viewer leaves
const RETRY_MS = 5000;

class LiveChannel {
  /** context: getSession, actions, window (SegmentWindow), dir, baseUrl */
  constructor({ config = {}, deps = {}, ...context }) {
    Object.assign(this, context);
    this.nextUpSeconds = config.nextUpSeconds ?? 8;
    this.ffmpeg = config.ffmpeg || "ffmpeg";
    this.joinUrl = config.joinUrl || null;
    this.run = deps.run || runItem;
    this.prepare = deps.prepare || media;
    this.log = deps.log || console;
    this.now = deps.now || Date.now;
    this.audience = new Audience(this.now, GRACE_MS);
    this.current = null;
    this.pending = null;
    this.retryAt = 0;
    this.positions = new Map();
  }

  /** A continuous-stream viewer; returns the function to call when they leave */
  addViewer() {
    const leave = this.audience.join();
    this.sync();
    return leave;
  }

  /** An HLS viewer fetched the playlist */
  touch() {
    this.audience.seen();
    this.sync();
  }

  isWatched() {
    return this.audience.isWatching();
  }

  /** Bring the stream in line with the queue; safe to call any time */
  sync() {
    if (!this.isWatched()) {
      if (this.current) this.stopCurrent();
      return;
    }
    if (this.now() < this.retryAt) return;
    const want = desiredItem(this.getSession());
    if (this.current?.key === want.key || this.pending === want.key) return;
    this.pending = want.key;
    this.switchTo(want)
      .catch(error => {
        this.log.error(`[live] couldn't start ${want.key}: ${error.message}`);
        this.retryAt = this.now() + RETRY_MS;
      })
      .finally(() => {
        if (this.pending === want.key) this.pending = null;
      });
  }

  async switchTo(want) {
    const files = await prepareItem(want, this.prepare, this);
    if (desiredItem(this.getSession()).key !== want.key || !this.isWatched())
      return;
    await this.stopCurrent();
    const startAt =
      want.kind === "song" ? this.positions.get(want.song.id) || 0 : 0;
    const { args, playlistPath } = encodeItem(want, files, {
      ...this,
      startAt,
    });
    const handle = this.run(this.window, args, {
      ffmpeg: this.ffmpeg,
      log: this.log,
      playlistPath,
    });
    const item = { ...want, handle, startAt, startedAt: this.now() };
    this.current = item;
    this.log.info(
      `[live] now showing ${want.key}${startAt ? ` from ${Math.round(startAt)}s` : ""}`
    );
    handle.done.then(result => {
      if (want.kind === "song") this.prepare.cleanup?.(files);
      this.finished(item, result);
    });
  }

  position(item = this.current) {
    return item ? item.startAt + (this.now() - item.startedAt) / 1000 : 0;
  }

  stopCurrent() {
    const item = this.current;
    if (!item) return Promise.resolve();
    if (item.kind === "song")
      this.positions.set(item.song.id, this.position(item));
    this.current = null;
    return item.handle.stop();
  }

  finished(item, { code, stopped, error }) {
    if (this.current !== item) return;
    this.current = null;
    if (stopped) return;
    const title = item.song?.mediaItem?.title;
    if (code !== 0) {
      this.log.error(
        `[live] ffmpeg failed on ${item.key}: ${error || `exit ${code}`}`
      );
      if (item.kind === "song")
        this.actions.skipSong(`"${title}" couldn't play on the channel`);
      else this.retryAt = this.now() + RETRY_MS;
    } else if (item.kind === "song") {
      this.positions.delete(item.song.id);
      this.actions.completeSong();
    } else if (item.kind === "nextup") {
      this.actions.startNextSong();
    }
    this.sync();
  }

  /** Report the song's position to the queue (phones show progress) */
  reportProgress() {
    if (this.current?.kind === "song") this.actions.progress(this.position());
  }

  status() {
    return {
      watched: this.isWatched(),
      viewers: this.audience.viewers,
      showing: this.current?.key || null,
      segments: this.window.segments.length,
    };
  }

  stop() {
    return this.stopCurrent();
  }
}

module.exports = { LiveChannel, GRACE_MS };
