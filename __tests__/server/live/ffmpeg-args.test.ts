import { describe, it, expect } from "vitest";
import {
  songArgs,
  cardArgs,
  outputArgs,
  filterPath,
  itemPlaylist,
} from "../../../server/live/ffmpeg-args";

const output = { offset: 12.5, startNumber: 7, dir: "/tmp/live" };
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("outputArgs", () => {
  it("continues timestamps and segment numbers into the item's playlist", () => {
    const args = outputArgs(output);
    expect(after(args, "-output_ts_offset")).toBe("12.500");
    expect(after(args, "-start_number")).toBe("7");
    expect(after(args, "-f")).toBe("hls");
    expect(args.at(-1)).toBe(itemPlaylist("/tmp/live", 7));
    expect(after(args, "-hls_segment_filename")).toBe("/tmp/live/seg_%06d.ts");
  });
});

describe("songArgs", () => {
  it("draws CD+G graphics with the song's audio", () => {
    const args = songArgs({
      audioUrl: "http://a/1",
      cdgPath: "/tmp/live/1.cdg",
      ...output,
    });
    expect(args).toContain("cdg");
    expect(args).toContain("/tmp/live/1.cdg");
    expect(args).toContain("http://a/1");
    expect(after(args, "-filter_complex")).toContain("flags=neighbor");
    expect(args).toContain("-shortest");
    expect(args).not.toContain("-ss");
  });

  it("renders lyrics on a background, seeking when resuming", () => {
    const args = songArgs({
      audioUrl: "http://a/1",
      assPath: "/tmp/live/1.ass",
      startAt: 42,
      ...output,
    });
    expect(args).toContain("lavfi");
    expect(after(args, "-filter_complex")).toContain(
      "setpts=PTS+42.00/TB,subtitles=filename='/tmp/live/1.ass'"
    );
    expect(args.filter(a => a === "-ss")).toHaveLength(1); // only the audio seeks
  });

  it("seeks both inputs of a CD+G song", () => {
    const args = songArgs({
      audioUrl: "u",
      cdgPath: "c.cdg",
      startAt: 10,
      ...output,
    });
    expect(args.filter(a => a === "-ss")).toHaveLength(2);
  });
});

describe("cardArgs", () => {
  it("overlays the QR code and stops after the given seconds", () => {
    const args = cardArgs({
      assPath: "/tmp/c.ass",
      qrPath: "/tmp/qr.png",
      seconds: 8,
      ...output,
    });
    expect(args).toContain("/tmp/qr.png");
    expect(after(args, "-filter_complex")).toContain("overlay=");
    expect(after(args, "-t")).toBe("8");
  });

  it("runs until stopped without a QR code when there's no join address", () => {
    const args = cardArgs({ assPath: "/tmp/c.ass", ...output });
    expect(args).not.toContain("-t");
    expect(after(args, "-filter_complex")).not.toContain("overlay");
  });
});

describe("filterPath", () => {
  it("escapes characters special in filter graphs", () => {
    expect(filterPath("C:\\x\\it's.ass")).toBe("C\\:/x/it\\'s.ass");
  });
});
