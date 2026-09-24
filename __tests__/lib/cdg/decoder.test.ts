import { describe, it, expect } from "vitest";
import { CdgDecoder, isValidCdg } from "@/lib/cdg/decoder";
import { CDG_HEIGHT, CDG_WIDTH } from "@/lib/cdg/instructions";
import { renderToRgba } from "@/lib/cdg/render";
import {
  INSTR,
  cdg,
  colorBytes,
  emptyPacket,
  packet,
  tile,
} from "./cdgPackets";

const pixelAt = (decoder: CdgDecoder, x: number, y: number) =>
  decoder.state.pixels[y * CDG_WIDTH + x];

/** Seek far enough to apply every packet */
const playAll = (decoder: CdgDecoder) => decoder.seekToTime(3600);

describe("isValidCdg", () => {
  it("accepts data containing a graphics packet", () => {
    expect(isValidCdg(cdg(emptyPacket(), packet(INSTR.MEMORY_PRESET)))).toBe(
      true
    );
  });

  it("rejects empty or non-graphics data", () => {
    expect(isValidCdg(new Uint8Array(0))).toBe(false);
    expect(isValidCdg(cdg(emptyPacket(), emptyPacket()))).toBe(false);
  });
});

describe("CdgDecoder", () => {
  it("reports duration from the packet count (300 packets per second)", () => {
    const packets = Array.from({ length: 600 }, () => emptyPacket());
    expect(new CdgDecoder(cdg(...packets)).duration).toBe(2);
  });

  it("fills the screen on memory preset", () => {
    const decoder = new CdgDecoder(cdg(packet(INSTR.MEMORY_PRESET, [5])));
    playAll(decoder);
    expect(decoder.state.pixels.every(p => p === 5)).toBe(true);
  });

  it("fills only the border on border preset", () => {
    const decoder = new CdgDecoder(cdg(packet(INSTR.BORDER_PRESET, [3])));
    playAll(decoder);
    expect(pixelAt(decoder, 0, 0)).toBe(3);
    expect(pixelAt(decoder, CDG_WIDTH - 1, CDG_HEIGHT - 1)).toBe(3);
    expect(pixelAt(decoder, 150, 100)).toBe(0);
  });

  it("draws a two-color tile at its row and column", () => {
    // Top row: left pixel color1, rest color0
    const rows = [0b100000, ...new Array(11).fill(0)];
    const decoder = new CdgDecoder(
      cdg(packet(INSTR.TILE, tile(2, 7, 1, 2, rows)))
    );
    playAll(decoder);
    expect(pixelAt(decoder, 12, 12)).toBe(7);
    expect(pixelAt(decoder, 13, 12)).toBe(2);
    expect(pixelAt(decoder, 17, 23)).toBe(2);
    expect(pixelAt(decoder, 18, 12)).toBe(0);
  });

  it("XORs tile colors with existing pixels", () => {
    const rows = new Array(12).fill(0b111111);
    const decoder = new CdgDecoder(
      cdg(
        packet(INSTR.MEMORY_PRESET, [0b0101]),
        packet(INSTR.TILE_XOR, tile(0, 0b0011, 0, 0, rows))
      )
    );
    playAll(decoder);
    expect(pixelAt(decoder, 0, 0)).toBe(0b0110);
    expect(pixelAt(decoder, 6, 0)).toBe(0b0101);
  });

  it("ignores tiles positioned off screen", () => {
    const decoder = new CdgDecoder(
      cdg(packet(INSTR.TILE, tile(1, 1, 31, 63, new Array(12).fill(0x3f))))
    );
    playAll(decoder);
    expect(decoder.state.pixels.every(p => p === 0)).toBe(true);
  });

  it("loads low and high palette entries", () => {
    const low = [...colorBytes(15, 0, 0), ...new Array(14).fill(0)];
    const high = [...colorBytes(0, 15, 1), ...new Array(14).fill(0)];
    const decoder = new CdgDecoder(
      cdg(packet(INSTR.COLORS_LOW, low), packet(INSTR.COLORS_HIGH, high))
    );
    playAll(decoder);
    expect(Array.from(decoder.state.palette.slice(0, 3))).toEqual([255, 0, 0]);
    expect(Array.from(decoder.state.palette.slice(24, 27))).toEqual([
      0, 255, 17,
    ]);
  });

  it("only applies packets up to the requested time", () => {
    const packets = [
      packet(INSTR.MEMORY_PRESET, [1]),
      ...Array.from({ length: 299 }, () => emptyPacket()),
      packet(INSTR.MEMORY_PRESET, [2]),
    ];
    const decoder = new CdgDecoder(cdg(...packets));
    decoder.seekToTime(0.5);
    expect(pixelAt(decoder, 0, 0)).toBe(1);
    decoder.seekToTime(1.01);
    expect(pixelAt(decoder, 0, 0)).toBe(2);
  });

  it("replays from the start when seeking backwards", () => {
    const packets = [
      packet(INSTR.MEMORY_PRESET, [1]),
      ...Array.from({ length: 299 }, () => emptyPacket()),
      packet(INSTR.MEMORY_PRESET, [2]),
    ];
    const decoder = new CdgDecoder(cdg(...packets));
    playAll(decoder);
    decoder.dirty = false;
    decoder.seekToTime(0.1);
    expect(pixelAt(decoder, 0, 0)).toBe(1);
    expect(decoder.dirty).toBe(true);
  });

  it("clamps negative times to the start", () => {
    const decoder = new CdgDecoder(cdg(packet(INSTR.MEMORY_PRESET, [4])));
    decoder.seekToTime(-5);
    expect(pixelAt(decoder, 0, 0)).toBe(0);
  });

  it("ignores unknown instructions without marking the frame dirty", () => {
    const decoder = new CdgDecoder(cdg(packet(28, [1])));
    decoder.dirty = false;
    playAll(decoder);
    expect(decoder.dirty).toBe(false);
  });
});

describe("scrolling", () => {
  const markedTile = packet(INSTR.TILE, tile(0, 9, 0, 0, [0b100000]));

  it("scroll preset shifts right and fills vacated pixels", () => {
    const decoder = new CdgDecoder(
      cdg(markedTile, packet(INSTR.SCROLL_PRESET, [4, 0x10, 0]))
    );
    playAll(decoder);
    expect(pixelAt(decoder, 6, 0)).toBe(9);
    expect(pixelAt(decoder, 0, 0)).toBe(4);
  });

  it("scroll copy wraps pixels around vertically", () => {
    const decoder = new CdgDecoder(
      cdg(markedTile, packet(INSTR.SCROLL_COPY, [0, 0, 0x20]))
    );
    playAll(decoder);
    expect(pixelAt(decoder, 0, CDG_HEIGHT - 12)).toBe(9);
  });

  it("scrolls left and down", () => {
    const decoder = new CdgDecoder(
      cdg(markedTile, packet(INSTR.SCROLL_COPY, [0, 0x20, 0x10]))
    );
    playAll(decoder);
    expect(pixelAt(decoder, CDG_WIDTH - 6, 12)).toBe(9);
  });

  it("stores smooth-scroll offsets used by the renderer", () => {
    const low = [...colorBytes(0, 0, 0), ...colorBytes(15, 15, 15)];
    const decoder = new CdgDecoder(
      cdg(
        packet(INSTR.COLORS_LOW, [...low, ...new Array(12).fill(0)]),
        packet(INSTR.TILE, tile(0, 1, 0, 0, [0b010000])),
        packet(INSTR.SCROLL_PRESET, [0, 0x07, 0x0f])
      )
    );
    playAll(decoder);
    expect(decoder.state.hOffset).toBe(5);
    expect(decoder.state.vOffset).toBe(11);

    decoder.state.hOffset = 1;
    decoder.state.vOffset = 0;
    const out = new Uint8ClampedArray(CDG_WIDTH * CDG_HEIGHT * 4);
    renderToRgba(decoder.state, out);
    // Pixel (1,0) is white and shows at (0,0) after a 1px offset
    expect(Array.from(out.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(out.slice(4, 8))).toEqual([0, 0, 0, 255]);
  });
});
