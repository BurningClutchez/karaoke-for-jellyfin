import { describe, it, expect } from "vitest";
import {
  cdgCandidates,
  getCdgPathConfig,
  mapToLocalPath,
} from "@/services/cdg/paths";

describe("getCdgPathConfig", () => {
  it("is disabled when CDG_LOCAL_ROOT is not set", () => {
    expect(getCdgPathConfig({})).toBeNull();
  });

  it("defaults the Jellyfin root to the local root", () => {
    expect(getCdgPathConfig({ CDG_LOCAL_ROOT: "/music/" })).toEqual({
      localRoot: "/music",
      jellyfinRoot: "/music",
    });
  });

  it("strips trailing slashes from the Jellyfin root", () => {
    const config = getCdgPathConfig({
      CDG_LOCAL_ROOT: "/music",
      CDG_JELLYFIN_ROOT: "/media/music/",
    });
    expect(config?.jellyfinRoot).toBe("/media/music");
  });
});

describe("mapToLocalPath", () => {
  const config = { jellyfinRoot: "/media/music", localRoot: "/music" };

  it("swaps the Jellyfin prefix for the local mount", () => {
    expect(mapToLocalPath("/media/music/Artist/Song.mp3", config)).toBe(
      "/music/Artist/Song.mp3"
    );
  });

  it("handles Windows-style Jellyfin paths", () => {
    const windows = { jellyfinRoot: "D:\\Karaoke", localRoot: "/music" };
    expect(mapToLocalPath("D:\\Karaoke\\Artist\\Song.mp3", windows)).toBe(
      "/music/Artist/Song.mp3"
    );
  });

  it("rejects paths outside the Jellyfin root", () => {
    expect(mapToLocalPath("/media/movies/Film.mkv", config)).toBeNull();
    expect(mapToLocalPath("/media/musicvideos/a.mp3", config)).toBeNull();
  });

  it("rejects paths that escape the local root", () => {
    expect(mapToLocalPath("/media/music/../../etc/passwd", config)).toBeNull();
  });

  it("supports a filesystem root on either side", () => {
    expect(
      mapToLocalPath("/Artist/Song.mp3", { jellyfinRoot: "/", localRoot: "/" })
    ).toBe("/Artist/Song.mp3");
  });
});

describe("cdgCandidates", () => {
  it("replaces the audio extension with .cdg and .CDG", () => {
    expect(cdgCandidates("/music/A - B.mp3")).toEqual([
      "/music/A - B.cdg",
      "/music/A - B.CDG",
    ]);
  });

  it("appends the extension when the file has none", () => {
    expect(cdgCandidates("/music/track")).toEqual([
      "/music/track.cdg",
      "/music/track.CDG",
    ]);
  });
});
