// Helpers for building synthetic CD+G subcode packets in tests
export const INSTR = {
  MEMORY_PRESET: 1,
  BORDER_PRESET: 2,
  TILE: 6,
  SCROLL_PRESET: 20,
  SCROLL_COPY: 24,
  COLORS_LOW: 30,
  COLORS_HIGH: 31,
  TILE_XOR: 38,
};

export function packet(instruction: number, data: number[] = []): number[] {
  const bytes = new Array(24).fill(0);
  bytes[0] = 0x09;
  bytes[1] = instruction;
  data.forEach((value, i) => (bytes[4 + i] = value));
  return bytes;
}

/** A non-graphics packet (e.g. CD-TEXT subcode) that must be ignored */
export function emptyPacket(): number[] {
  return new Array(24).fill(0);
}

export function cdg(...packets: number[][]): Uint8Array {
  return new Uint8Array(packets.flat());
}

/** Encode a 4-bit-per-channel color into the two CD+G palette bytes */
export function colorBytes(r: number, g: number, b: number): number[] {
  return [(r << 2) | (g >> 2), ((g & 0x03) << 4) | b];
}

export function tile(
  color0: number,
  color1: number,
  row: number,
  column: number,
  rows: number[]
): number[] {
  return [color0, color1, row, column, ...rows];
}
