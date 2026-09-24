// DISABLED (kept for reference): the REST queue handlers wrote to a session
// store that never shared state with the Socket.IO queue in server.js.
// route.ts now serves a read-only GET and answers other methods with 410.
// export { handleGet } from "./get";
// export { handlePost } from "./post";
// export { handleDelete } from "./delete";
// export { handlePut } from "./put";

export {};
