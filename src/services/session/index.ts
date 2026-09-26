// DISABLED (kept for reference): the REST session store never shared state with
// the Socket.IO queue in server.js, so it was removed from service. The live
// queue is managed by server.js; /api/queue GET reads it.
// // Re-exports for @/services/session
// export { KaraokeSessionManager } from "./session-manager";
// export type { SessionStats, EventCallback, SessionEventType } from "./types";
//
// // Singleton instance
// import { KaraokeSessionManager } from "./session-manager";
//
// let sessionManager: KaraokeSessionManager | null = null;
//
// export function getSessionManager(): KaraokeSessionManager {
//   if (!sessionManager) {
//     sessionManager = new KaraokeSessionManager();
//   }
//   return sessionManager;
// }

export {};
