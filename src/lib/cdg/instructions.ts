// CD+G graphics instructions. Each handler mutates the decoder state using
// the 16-byte data field of one subcode packet.

export const CDG_WIDTH = 300;
export const CDG_HEIGHT = 216;
export const PACKET_SIZE = 24;
export const PACKETS_PER_SECOND = 300;

const TILE_WIDTH = 6;
const TILE_HEIGHT = 12;

export interface CdgState {
  /** One palette index (0-15) per pixel, row-major */
  pixels: Uint8Array;
  /** 16 RGB triplets, 0-255 per channel */
  palette: Uint8Array;
  /** Smooth-scroll display offsets */
  hOffset: number;
  vOffset: number;
}

export function createState(): CdgState {
  return {
    pixels: new Uint8Array(CDG_WIDTH * CDG_HEIGHT),
    palette: new Uint8Array(16 * 3),
    hOffset: 0,
    vOffset: 0,
  };
}

export function memoryPreset(state: CdgState, data: Uint8Array): void {
  state.pixels.fill(data[0] & 0x0f);
}

function isBorder(x: number, y: number): boolean {
  return (
    x < TILE_WIDTH ||
    x >= CDG_WIDTH - TILE_WIDTH ||
    y < TILE_HEIGHT ||
    y >= CDG_HEIGHT - TILE_HEIGHT
  );
}

export function borderPreset(state: CdgState, data: Uint8Array): void {
  const color = data[0] & 0x0f;
  for (let y = 0; y < CDG_HEIGHT; y++) {
    for (let x = 0; x < CDG_WIDTH; x++) {
      if (isBorder(x, y)) state.pixels[y * CDG_WIDTH + x] = color;
    }
  }
}

export function tileBlock(
  state: CdgState,
  data: Uint8Array,
  xor: boolean
): void {
  const color0 = data[0] & 0x0f;
  const color1 = data[1] & 0x0f;
  const x0 = (data[3] & 0x3f) * TILE_WIDTH;
  const y0 = (data[2] & 0x1f) * TILE_HEIGHT;
  if (x0 + TILE_WIDTH > CDG_WIDTH || y0 + TILE_HEIGHT > CDG_HEIGHT) return;

  for (let row = 0; row < TILE_HEIGHT; row++) {
    const bits = data[4 + row] & 0x3f;
    for (let col = 0; col < TILE_WIDTH; col++) {
      const color = (bits >> (5 - col)) & 1 ? color1 : color0;
      const index = (y0 + row) * CDG_WIDTH + x0 + col;
      state.pixels[index] = xor ? state.pixels[index] ^ color : color;
    }
  }
}

/** Load eight palette entries starting at `base` (0 or 8) */
export function loadColors(
  state: CdgState,
  data: Uint8Array,
  base: number
): void {
  for (let i = 0; i < 8; i++) {
    const high = data[i * 2];
    const low = data[i * 2 + 1];
    const red = (high & 0x3c) >> 2;
    const green = ((high & 0x03) << 2) | ((low & 0x30) >> 4);
    const blue = low & 0x0f;
    // Scale 4-bit channels to 8-bit (0x0 -> 0, 0xf -> 255)
    state.palette.set([red * 17, green * 17, blue * 17], (base + i) * 3);
  }
}

function scrollDelta(command: number, step: number): number {
  if (command === 1) return step;
  if (command === 2) return -step;
  return 0;
}

function wrap(value: number, size: number): number {
  return (value + size) % size;
}

function shiftPixels(
  state: CdgState,
  dx: number,
  dy: number,
  fill: number | null
): void {
  const source = state.pixels.slice();
  for (let y = 0; y < CDG_HEIGHT; y++) {
    for (let x = 0; x < CDG_WIDTH; x++) {
      const sx = x - dx;
      const sy = y - dy;
      const inside = sx >= 0 && sx < CDG_WIDTH && sy >= 0 && sy < CDG_HEIGHT;
      const wrapped =
        source[wrap(sy, CDG_HEIGHT) * CDG_WIDTH + wrap(sx, CDG_WIDTH)];
      state.pixels[y * CDG_WIDTH + x] =
        inside || fill === null ? wrapped : fill;
    }
  }
}

/**
 * Scroll Preset (copy=false) fills vacated pixels with a color;
 * Scroll Copy (copy=true) wraps pixels around to the other side.
 */
export function scroll(state: CdgState, data: Uint8Array, copy: boolean): void {
  const hCommand = (data[1] & 0x30) >> 4;
  const vCommand = (data[2] & 0x30) >> 4;
  state.hOffset = Math.min(data[1] & 0x07, TILE_WIDTH - 1);
  state.vOffset = Math.min(data[2] & 0x0f, TILE_HEIGHT - 1);

  const dx = scrollDelta(hCommand, TILE_WIDTH);
  const dy = scrollDelta(vCommand, TILE_HEIGHT);
  if (dx === 0 && dy === 0) return;
  shiftPixels(state, dx, dy, copy ? null : data[0] & 0x0f);
}
