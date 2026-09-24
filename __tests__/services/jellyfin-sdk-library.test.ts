import { describe, it, expect, vi } from "vitest";
import { chooseMusicLibrary } from "@/services/jellyfin-sdk/auth";

const music = (Name: string, ItemId: string) => ({
  Name,
  ItemId,
  CollectionType: "music",
});
const movies = { Name: "Movies", ItemId: "m", CollectionType: "movies" };

describe("chooseMusicLibrary", () => {
  it("uses the only music library", () => {
    expect(chooseMusicLibrary([movies, music("Music", "a")], undefined)).toBe(
      "a"
    );
  });

  it("searches everything when there are several or none", () => {
    const libraries = [music("Karaoke", "k"), music("Music", "a")];
    expect(chooseMusicLibrary(libraries, undefined)).toBeNull();
    expect(chooseMusicLibrary([movies], undefined)).toBeNull();
  });

  it("uses the library named by JELLYFIN_MUSIC_LIBRARY", () => {
    const libraries = [music("Karaoke", "k"), music("Music", "a")];
    expect(chooseMusicLibrary(libraries, "music")).toBe("a");
  });

  it("warns and searches everything when the named library is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const libraries = [music("Karaoke", "k"), music("Music", "a")];
    expect(chooseMusicLibrary(libraries, "Nope")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads JELLYFIN_MUSIC_LIBRARY by default", () => {
    process.env.JELLYFIN_MUSIC_LIBRARY = "Karaoke";
    expect(
      chooseMusicLibrary([music("Karaoke", "k"), music("Music", "a")])
    ).toBe("k");
    delete process.env.JELLYFIN_MUSIC_LIBRARY;
  });
});
