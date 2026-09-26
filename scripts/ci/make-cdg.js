#!/usr/bin/env node
/**
 * Writes a small but valid CD+G file for test libraries: a dark blue screen
 * with a yellow bar that grows across the middle, one tile every half second.
 *
 *   node scripts/ci/make-cdg.js out.cdg [seconds]
 */
const fs = require("fs");

const PACKET_SIZE = 24;
const PACKETS_PER_SECOND = 300;
const CDG_COMMAND = 0x09;
const MEMORY_PRESET = 1;
const TILE_BLOCK = 6;
const LOAD_COLORS_LOW = 30;

function packet(instruction, data) {
  const bytes = Buffer.alloc(PACKET_SIZE);
  bytes[0] = CDG_COMMAND;
  bytes[1] = instruction;
  data.forEach((value, index) => (bytes[4 + index] = value & 0x3f));
  return bytes;
}

/** 4-bit red, green, blue packed into two 6-bit bytes */
function color([r, g, b]) {
  return [(r << 2) | (g >> 2), ((g & 3) << 4) | b];
}

function makeCdg(seconds) {
  const total = Math.round(seconds * PACKETS_PER_SECOND);
  const packets = Array.from({ length: total }, () =>
    Buffer.alloc(PACKET_SIZE)
  );
  const palette = [
    [0, 0, 4],
    [15, 15, 0],
  ];
  packets[0] = packet(LOAD_COLORS_LOW, palette.flatMap(color));
  packets[1] = packet(MEMORY_PRESET, [0, 0]);

  // Tile row 8 of 18, columns 1..48: color 1 wherever a pixel bit is set
  const solid = Array(12).fill(0x3f);
  for (let column = 1; column < 49; column++) {
    const index = 2 + column * (PACKETS_PER_SECOND / 2);
    if (index >= total) break;
    packets[index] = packet(TILE_BLOCK, [0, 1, 8, column, ...solid]);
  }
  return Buffer.concat(packets);
}

if (require.main === module) {
  const [out, seconds = "60"] = process.argv.slice(2);
  if (!out) {
    console.error("usage: make-cdg.js out.cdg [seconds]");
    process.exit(1);
  }
  fs.writeFileSync(out, makeCdg(Number(seconds)));
}

module.exports = { makeCdg };
