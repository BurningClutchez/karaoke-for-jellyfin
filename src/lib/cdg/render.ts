// Convert decoder state (palette indices) into RGBA pixels for a canvas
import { CDG_HEIGHT, CDG_WIDTH, CdgState } from "./instructions";

export function renderToRgba(state: CdgState, out: Uint8ClampedArray): void {
  const { pixels, palette, hOffset, vOffset } = state;
  for (let y = 0; y < CDG_HEIGHT; y++) {
    const sy = Math.min(y + vOffset, CDG_HEIGHT - 1);
    for (let x = 0; x < CDG_WIDTH; x++) {
      const sx = Math.min(x + hOffset, CDG_WIDTH - 1);
      const color = pixels[sy * CDG_WIDTH + sx] * 3;
      const target = (y * CDG_WIDTH + x) * 4;
      out[target] = palette[color];
      out[target + 1] = palette[color + 1];
      out[target + 2] = palette[color + 2];
      out[target + 3] = 255;
    }
  }
}
