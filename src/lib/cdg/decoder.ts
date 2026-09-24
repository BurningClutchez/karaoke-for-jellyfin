// Time-addressable CD+G decoder: replays packets up to a playback position
import {
  CdgState,
  PACKET_SIZE,
  PACKETS_PER_SECOND,
  borderPreset,
  createState,
  loadColors,
  memoryPreset,
  scroll,
  tileBlock,
} from "./instructions";

const CDG_COMMAND = 0x09;

type Handler = (state: CdgState, data: Uint8Array) => void;

const HANDLERS: Record<number, Handler> = {
  1: memoryPreset,
  2: borderPreset,
  6: (state, data) => tileBlock(state, data, false),
  20: (state, data) => scroll(state, data, false),
  24: (state, data) => scroll(state, data, true),
  30: (state, data) => loadColors(state, data, 0),
  31: (state, data) => loadColors(state, data, 8),
  38: (state, data) => tileBlock(state, data, true),
};

function isGraphicsPacket(data: Uint8Array, offset: number): boolean {
  return (data[offset] & 0x3f) === CDG_COMMAND;
}

/** True when the buffer looks like a CD+G file (has at least one graphics packet) */
export function isValidCdg(data: Uint8Array): boolean {
  const packets = Math.floor(data.length / PACKET_SIZE);
  for (let i = 0; i < packets; i++) {
    if (isGraphicsPacket(data, i * PACKET_SIZE)) return true;
  }
  return false;
}

export class CdgDecoder {
  state: CdgState = createState();
  /** Set whenever the picture changed; cleared by the renderer */
  dirty = true;
  private position = 0;
  private readonly packetCount: number;

  constructor(private readonly data: Uint8Array) {
    this.packetCount = Math.floor(data.length / PACKET_SIZE);
  }

  get duration(): number {
    return this.packetCount / PACKETS_PER_SECOND;
  }

  reset(): void {
    this.state = createState();
    this.position = 0;
    this.dirty = true;
  }

  /** Advance (or rewind and replay) to the given playback time in seconds */
  seekToTime(seconds: number): void {
    const target = Math.min(
      Math.max(Math.floor(seconds * PACKETS_PER_SECOND), 0),
      this.packetCount
    );
    if (target < this.position) this.reset();
    while (this.position < target) {
      this.applyPacket(this.position);
      this.position++;
    }
  }

  private applyPacket(index: number): void {
    const offset = index * PACKET_SIZE;
    if (!isGraphicsPacket(this.data, offset)) return;
    const handler = HANDLERS[this.data[offset + 1] & 0x3f];
    if (!handler) return;
    handler(this.state, this.data.subarray(offset + 4, offset + 20));
    this.dirty = true;
  }
}
