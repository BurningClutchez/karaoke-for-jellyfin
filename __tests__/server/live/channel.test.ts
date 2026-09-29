import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveChannel, GRACE_MS } from "../../../server/live/channel";

interface Song {
  id: string;
  status: string;
  mediaItem: { title: string };
}
const song = (id: string, status = "pending"): Song => ({
  id,
  status,
  mediaItem: { title: id },
});

function setup() {
  let now = 1000;
  const session: {
    currentSong: Song | null;
    queue: Song[];
    playbackState: { isPlaying: boolean } | null;
  } = { currentSong: null, queue: [], playbackState: { isPlaying: true } };
  const runs: {
    args: string[];
    resolve: (r: object) => void;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const run = vi.fn((_w: unknown, args: string[]) => {
    let resolve!: (r: object) => void;
    const done = new Promise<object>(r => (resolve = r));
    const stop = vi.fn(() => {
      resolve({ code: 255, stopped: true });
      return done;
    });
    runs.push({ args, resolve, stop });
    return { done, stop };
  });
  const prepare = {
    prepareSong: vi.fn(async () => ({
      audioUrl: "http://a",
      assPath: "/d/s.ass",
    })),
    prepareCard: vi.fn(async () => ({ assPath: "/d/c.ass" })),
    cleanup: vi.fn(),
  };
  const actions = {
    completeSong: vi.fn(),
    startNextSong: vi.fn(),
    skipSong: vi.fn(),
    progress: vi.fn(),
  };
  const window = { offset: 0, nextNumber: 1, segments: [] };
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const channel = new LiveChannel({
    getSession: () => session,
    actions,
    window,
    dir: "/d",
    baseUrl: "http://app",
    config: { nextUpSeconds: 5 },
    deps: { run, prepare, log, now: () => now },
  });
  const settle = () => new Promise(r => setTimeout(r, 0));
  return {
    channel,
    session,
    runs,
    run,
    prepare,
    actions,
    log,
    settle,
    advance: (ms: number) => (now += ms),
  };
}

describe("LiveChannel", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("does nothing while nobody watches", async () => {
    t.channel.sync();
    await t.settle();
    expect(t.run).not.toHaveBeenCalled();
    expect(t.channel.status().watched).toBe(false);
  });

  it("shows the waiting card to a viewer", async () => {
    t.channel.addViewer();
    await t.settle();
    expect(t.prepare.prepareCard).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "waiting" }),
      expect.anything()
    );
    expect(t.runs[0].args).not.toContain("-t"); // runs until replaced
    expect(t.channel.status().showing).toBe("waiting");
  });

  it("plays the current song and completes it when ffmpeg finishes", async () => {
    t.session.currentSong = song("a", "playing");
    t.channel.addViewer();
    await t.settle();
    expect(t.channel.status().showing).toBe("song:a");
    t.advance(3000);
    t.channel.reportProgress();
    expect(t.actions.progress).toHaveBeenCalledWith(3);
    t.session.currentSong = null;
    t.runs[0].resolve({ code: 0, stopped: false });
    await t.settle();
    expect(t.actions.completeSong).toHaveBeenCalled();
    expect(t.prepare.cleanup).toHaveBeenCalled();
  });

  it("shows up next, then starts the next song", async () => {
    t.session.queue = [song("b")];
    t.channel.addViewer();
    await t.settle();
    expect(t.channel.status().showing).toBe("nextup:b");
    expect(t.runs[0].args).toContain("-t");
    t.runs[0].resolve({ code: 0, stopped: false });
    await t.settle();
    expect(t.actions.startNextSong).toHaveBeenCalled();
  });

  it("switches when a song is skipped, stopping the old item first", async () => {
    t.session.currentSong = song("a", "playing");
    t.channel.addViewer();
    await t.settle();
    t.session.currentSong = song("b", "playing");
    t.channel.sync();
    await t.settle();
    await t.settle();
    expect(t.runs[0].stop).toHaveBeenCalled();
    expect(t.channel.status().showing).toBe("song:b");
  });

  it("pauses on a card and resumes the song where it stopped", async () => {
    t.session.currentSong = song("a", "playing");
    t.channel.addViewer();
    await t.settle();
    t.advance(12000);
    t.session.playbackState = { isPlaying: false };
    t.channel.sync();
    await t.settle();
    await t.settle();
    expect(t.channel.status().showing).toBe("paused:a");
    t.session.playbackState = { isPlaying: true };
    t.channel.sync();
    await t.settle();
    await t.settle();
    const resumed = t.runs.at(-1)!.args;
    expect(resumed[resumed.indexOf("-ss") + 1]).toBe("12.00");
  });

  it("skips a song ffmpeg can't play, and retries a failed card later", async () => {
    t.session.currentSong = song("a", "playing");
    t.channel.addViewer();
    await t.settle();
    t.runs[0].resolve({ code: 1, stopped: false, error: "bad input" });
    await t.settle();
    expect(t.actions.skipSong).toHaveBeenCalledWith(
      expect.stringContaining("couldn't play")
    );

    t.session.currentSong = null;
    t.channel.sync();
    await t.settle();
    const card = t.runs.at(-1)!;
    card.resolve({ code: 1, stopped: false });
    await t.settle();
    const count = t.run.mock.calls.length;
    t.channel.sync();
    await t.settle();
    expect(t.run.mock.calls.length).toBe(count); // waiting before retrying
    t.advance(6000);
    t.channel.sync();
    await t.settle();
    expect(t.run.mock.calls.length).toBe(count + 1);
  });

  it("keeps going for a while after the last viewer leaves, then stops", async () => {
    const leave = t.channel.addViewer();
    await t.settle();
    leave();
    t.channel.sync();
    expect(t.runs[0].stop).not.toHaveBeenCalled();
    t.advance(GRACE_MS + 1);
    t.channel.sync();
    expect(t.runs[0].stop).toHaveBeenCalled();
  });

  it("counts HLS playlist requests as watching", async () => {
    t.channel.touch();
    await t.settle();
    expect(t.run).toHaveBeenCalled();
  });

  it("reports preparation failures and waits before retrying", async () => {
    t.prepare.prepareCard.mockRejectedValueOnce(new Error("disk full"));
    t.channel.addViewer();
    await t.settle();
    await t.settle();
    expect(t.log.error).toHaveBeenCalledWith(
      expect.stringContaining("disk full")
    );
    expect(t.run).not.toHaveBeenCalled();
  });

  it("stops what is playing", async () => {
    t.channel.addViewer();
    await t.settle();
    await t.channel.stop();
    expect(t.runs[0].stop).toHaveBeenCalled();
    expect(t.channel.status().showing).toBeNull();
  });
});
