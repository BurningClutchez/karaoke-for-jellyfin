import type { Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";

// The queue lives in server.js and only changes over Socket.IO; GET /api/queue
// is a read-only view of it. These helpers drive the queue the way the apps do.

const BASE_URL = "http://localhost:3000";
const SESSION_ID = "main-session";

interface QueueView {
  queue: { id: string; status: string }[];
  currentSong: { id: string } | null;
}

async function readQueue(page: Page): Promise<QueueView | null> {
  const response = await page.request.get(`${BASE_URL}/api/queue`);
  if (!response.ok()) return null;
  const body = await response.json();
  return body.data ?? null;
}

async function withSessionSocket<T>(
  userName: string,
  action: (socket: Socket) => Promise<T>
): Promise<T> {
  const socket = io(BASE_URL, { transports: ["websocket"], forceNew: true });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    socket.emit("join-session", { sessionId: SESSION_ID, userName });
    await new Promise(resolve => setTimeout(resolve, 300));
    return await action(socket);
  } finally {
    socket.disconnect();
  }
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Remove every pending song and skip whatever is playing */
export async function clearQueue(page: Page): Promise<void> {
  const initial = await readQueue(page);
  if (!initial || (!initial.queue.length && !initial.currentSong)) return;

  await withSessionSocket("E2E Cleanup", async socket => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const view = await readQueue(page);
      if (!view || (!view.queue.length && !view.currentSong)) return;
      for (const item of view.queue) {
        if (item.status === "pending") {
          socket.emit("remove-song", { queueItemId: item.id });
        }
      }
      await pause(200);
      if (view.currentSong) socket.emit("skip-song");
      await pause(500);
    }
  });
}

/** Skip the current song, as the host or TV would */
export async function skipCurrentSong(): Promise<void> {
  await withSessionSocket("E2E Skip", async socket => {
    socket.emit("skip-song");
    await pause(300);
  });
}
