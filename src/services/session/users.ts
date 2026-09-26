// DISABLED (kept for reference): the REST session store never shared state with
// the Socket.IO queue in server.js, so it was removed from service. The live
// queue is managed by server.js; /api/queue GET reads it.
// // User management operations
// import { KaraokeSession, ConnectedUser } from "@/types";
// import {
//   createConnectedUser,
//   addUserToSession,
//   removeUserFromSession,
// } from "@/lib/utils";
// import { ValidationError } from "@/lib/validation";
// import { SessionEventEmitter } from "./event-emitter";
//
// export function addUser(
//   session: KaraokeSession,
//   userName: string,
//   emitter: SessionEventEmitter,
//   socketId?: string
// ): { session: KaraokeSession; user: ConnectedUser } {
//   if (session.connectedUsers.length >= session.settings.maxUsers) {
//     throw new ValidationError("Session is full");
//   }
//   const user = createConnectedUser(userName, false, socketId);
//   const updatedSession = addUserToSession(session, user);
//   emitter.emit("user-joined", user);
//   return { session: updatedSession, user };
// }
//
// export function removeUser(
//   session: KaraokeSession,
//   userId: string,
//   emitter: SessionEventEmitter
// ): KaraokeSession {
//   const user = session.connectedUsers.find(u => u.id === userId);
//   if (!user) {
//     throw new ValidationError("User not found");
//   }
//
//   // Remove user's songs from queue if they're not playing
//   session.queue = session.queue.filter(
//     item => item.addedBy !== userId || item.status === "playing"
//   );
//
//   const updatedSession = removeUserFromSession(session, userId);
//   emitter.emit("user-left", { userId, user });
//   emitter.emit("queue-updated", updatedSession.queue);
//   return updatedSession;
// }
//
// export function updateUserSocketId(
//   session: KaraokeSession,
//   userId: string,
//   socketId: string
// ): void {
//   const userIndex = session.connectedUsers.findIndex(u => u.id === userId);
//   if (userIndex >= 0) {
//     session.connectedUsers[userIndex].socketId = socketId;
//     session.connectedUsers[userIndex].lastSeen = new Date();
//   }
// }

export {};
