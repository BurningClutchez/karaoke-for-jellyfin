// Read-only view of the live queue. The queue itself lives in server.js and is
// changed over Socket.IO (add-song, remove-song, skip-song, ...). The old REST
// handlers in ./handlers wrote to a separate store and are disabled.
import { NextResponse } from "next/server";
import { createSuccessResponse, createErrorResponse } from "@/lib/utils";
import type { PlaybackState, QueueItem } from "@/types";

export interface QueueSnapshot {
  queue: QueueItem[];
  currentSong: QueueItem | null;
  playbackState: PlaybackState | null;
  session: { id: string; name: string };
}

type SnapshotReader = () => QueueSnapshot | null;

/** server.js publishes this; it is absent when Next.js runs without it */
function readSnapshot(): QueueSnapshot | null {
  const reader = (globalThis as { __karaokeQueueSnapshot?: SnapshotReader })
    .__karaokeQueueSnapshot;
  return reader ? reader() : null;
}

export async function GET(): Promise<NextResponse> {
  const snapshot = readSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      createErrorResponse("SESSION_NOT_FOUND", "No active karaoke session"),
      { status: 404 }
    );
  }
  return NextResponse.json(createSuccessResponse(snapshot));
}

function readOnly(): NextResponse {
  return NextResponse.json(
    createErrorResponse(
      "QUEUE_READ_ONLY",
      "The queue is managed over Socket.IO by server.js; /api/queue is read-only"
    ),
    { status: 410 }
  );
}

export const POST = readOnly;
export const PUT = readOnly;
export const DELETE = readOnly;
