import { describe, it, expect } from "vitest";
import {
  createPlaybackWatchdog,
  stallSettings,
  stallNotice,
} from "../../server/playback-watchdog";

interface FakeSession {
  currentSong: { id: string; mediaItem: { title: string } } | null;
  playbackState: { isPlaying: boolean } | null;
}

function setup(stallMs = 60000) {
  let now = 0;
  let tv = true;
  const session: FakeSession = {
    currentSong: { id: "a", mediaItem: { title: "Song A" } },
    playbackState: { isPlaying: true },
  };
  const watchdog = createPlaybackWatchdog({
    getSession: () => session,
    isTvConnected: () => tv,
    stallMs,
    now: () => now,
  });
  return {
    watchdog,
    session,
    advance: (ms: number) => (now += ms),
    setTv: (connected: boolean) => (tv = connected),
  };
}

describe("createPlaybackWatchdog", () => {
  it("reports a playing song without progress once", () => {
    const { watchdog, advance } = setup();
    expect(watchdog.check()).toBeNull(); // starts watching song a
    advance(59000);
    expect(watchdog.check()).toBeNull();
    advance(2000);
    const stalled = watchdog.check();
    expect(stalled?.song.id).toBe("a");
    expect(stalled?.seconds).toBe(61);
    advance(60000);
    expect(watchdog.check()).toBeNull();
  });

  it("treats a new position as progress and reports recovery", () => {
    const { watchdog, advance } = setup();
    watchdog.check();
    advance(50000);
    expect(watchdog.noteProgress(12)).toBe(false);
    advance(50000);
    expect(watchdog.check()).toBeNull();
    advance(20000);
    expect(watchdog.check()).not.toBeNull();
    expect(watchdog.noteProgress(12)).toBe(false); // same position: no progress
    expect(watchdog.noteProgress(13)).toBe(true);
    expect(watchdog.noteProgress(14)).toBe(false);
  });

  it("doesn't watch while paused, between songs or without a TV", () => {
    const { watchdog, session, advance, setTv } = setup();
    watchdog.check();
    session.playbackState = { isPlaying: false };
    advance(120000);
    expect(watchdog.check()).toBeNull();
    session.playbackState = { isPlaying: true };
    advance(30000);
    expect(watchdog.check()).toBeNull(); // clock restarted on resume

    setTv(false);
    advance(120000);
    expect(watchdog.check()).toBeNull();
    setTv(true);

    session.currentSong = null;
    advance(120000);
    expect(watchdog.check()).toBeNull();
  });

  it("restarts the clock for each new song", () => {
    const { watchdog, session, advance } = setup();
    watchdog.check();
    advance(50000);
    session.currentSong = { id: "b", mediaItem: { title: "Song B" } };
    expect(watchdog.check()).toBeNull();
    advance(30000);
    expect(watchdog.check()).toBeNull();
    advance(31000);
    expect(watchdog.check()?.song.id).toBe("b");
  });

  it("copes with no session", () => {
    const watchdog = createPlaybackWatchdog({
      getSession: () => null,
      isTvConnected: () => true,
      stallMs: 1000,
    });
    expect(watchdog.check()).toBeNull();
  });
});

describe("stallSettings", () => {
  it("defaults to notifying after 60 seconds", () => {
    expect(stallSettings({})).toEqual({ stallMs: 60000, action: "notify" });
    expect(stallSettings({ PLAYBACK_STALL_SECONDS: " " }).stallMs).toBe(60000);
  });

  it("reads the wait and the action", () => {
    expect(
      stallSettings({
        PLAYBACK_STALL_SECONDS: "90",
        PLAYBACK_STALL_ACTION: "SKIP",
      })
    ).toEqual({ stallMs: 90000, action: "skip" });
  });

  it("turns off for 0 or nonsense, and ignores unknown actions", () => {
    expect(stallSettings({ PLAYBACK_STALL_SECONDS: "0" }).stallMs).toBe(0);
    expect(stallSettings({ PLAYBACK_STALL_SECONDS: "soon" }).stallMs).toBe(0);
    expect(stallSettings({ PLAYBACK_STALL_ACTION: "reboot" }).action).toBe(
      "notify"
    );
  });
});

describe("stallNotice", () => {
  it("says whether the song was skipped", () => {
    expect(stallNotice("Song A", "notify")).toContain("seems stuck");
    expect(stallNotice("Song A", "skip")).toContain("was skipped");
  });
});
