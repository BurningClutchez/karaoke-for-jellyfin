import { describe, it, expect } from "vitest";
import {
  assTime,
  clean,
  karaoke,
  lyricsAss,
  cardAss,
} from "../../../server/live/ass";

const dialogues = (ass: string) =>
  ass.split("\n").filter(line => line.startsWith("Dialogue:"));

describe("ass helpers", () => {
  it("formats times as H:MM:SS.cc", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(61.234)).toBe("0:01:01.23");
    expect(assTime(3725.5)).toBe("1:02:05.50");
    expect(assTime(-3)).toBe("0:00:00.00");
  });

  it("removes override blocks and line breaks from text", () => {
    expect(clean("a {\\b1}b\\N\nc")).toBe("a (/b1)b/N c");
    expect(clean(undefined)).toBe("");
  });

  it("fills a line word by word over its duration", () => {
    expect(karaoke("one two", 2)).toBe("{\\kf100}one {\\kf100}two");
  });
});

describe("lyricsAss", () => {
  const lines = [
    { timestamp: 5000, text: "First line" },
    { timestamp: 8000, text: "" },
    { timestamp: 9000, text: "Second line" },
  ];

  it("shows the song info, a title card before late lyrics, and each line with the next", () => {
    const events = dialogues(
      lyricsAss({
        title: "Song",
        artist: "Band",
        singer: "Ann",
        lines,
        duration: 20,
      })
    );
    expect(events[0]).toContain("Song — Band · sung by Ann");
    expect(events.some(e => e.includes(",Big,") && e.includes("Song"))).toBe(
      true
    );
    const sing = events.filter(e => e.includes(",Sing,"));
    expect(sing).toHaveLength(2);
    expect(sing[0]).toContain("0:00:05.00,0:00:08.00");
    expect(sing[1]).toContain("0:00:09.00,0:00:14.00");
    const next = events.filter(
      e => e.includes(",Next,") && e.includes("Second line")
    );
    expect(next).toHaveLength(1);
  });

  it("skips the title card when lyrics start right away, and copes with no lyrics", () => {
    const early = dialogues(
      lyricsAss({ title: "T", lines: [{ timestamp: 500, text: "Go" }] })
    );
    expect(early.some(e => e.includes(",Big,"))).toBe(false);
    const none = dialogues(lyricsAss({ title: "Only title", artist: "A" }));
    expect(
      none.some(e => e.includes(",Big,") && e.includes("Only title"))
    ).toBe(true);
  });

  it("drops lines that would end before they start", () => {
    const events = dialogues(
      lyricsAss({
        title: "T",
        lines: [{ timestamp: 30000, text: "Late" }],
        duration: 20,
      })
    );
    expect(events.some(e => e.includes(",Sing,"))).toBe(false);
  });
});

describe("cardAss", () => {
  it("stacks the lines from the top left", () => {
    const events = dialogues(
      cardAss(
        [{ text: "Up next" }, { text: "Song", style: "Big" }, { text: "Band" }],
        8
      )
    );
    expect(events).toHaveLength(3);
    expect(events[0]).toContain("\\pos(100,200)");
    expect(events[1]).toContain(",Big,");
    expect(events[2]).toContain("\\pos(100,350)");
    expect(events[0]).toContain("0:00:00.00,0:00:08.00");
  });
});
