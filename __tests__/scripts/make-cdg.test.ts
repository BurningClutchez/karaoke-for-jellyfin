import { describe, it, expect } from "vitest";
import { CdgDecoder, isValidCdg } from "@/lib/cdg/decoder";
import { CDG_WIDTH } from "@/lib/cdg/instructions";
import { makeCdg } from "../../scripts/ci/make-cdg";

// Pixel in the middle of tile row 8 (rows 96..107), for a given tile column
const pixel = (decoder: CdgDecoder, column: number) =>
  decoder.state.pixels[100 * CDG_WIDTH + column * 6 + 3];

describe("CI CD+G fixture", () => {
  it("is valid CD+G of the requested length", () => {
    const data = new Uint8Array(makeCdg(20));
    expect(data.length).toBe(20 * 300 * 24);
    expect(isValidCdg(data)).toBe(true);
    expect(new CdgDecoder(data).duration).toBe(20);
  });

  it("draws a yellow bar that grows over time", () => {
    const decoder = new CdgDecoder(new Uint8Array(makeCdg(30)));
    decoder.seekToTime(1);
    expect(pixel(decoder, 1)).toBe(1);
    expect(pixel(decoder, 10)).toBe(0);
    decoder.seekToTime(10);
    expect(pixel(decoder, 10)).toBe(1);
    expect(Array.from(decoder.state.palette.slice(3, 6))).toEqual([
      255, 255, 0,
    ]);
  });
});
