// DISABLED (kept for reference): synced songs into the REST session store,
// which never shared state with the Socket.IO queue in server.js.
// const fetch = require("node-fetch");
//
// async function syncWithApiQueue(mediaItem, user, position) {
//   try {
//     const response = await fetch("http://localhost:3000/api/queue", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         action: "add-song",
//         mediaItem,
//         userId: user.id,
//         userName: user.name,
//         position,
//       }),
//     });
//
//     if (!response.ok) {
//       await fetch("http://localhost:3000/api/queue", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ action: "create-session", userName: user.name }),
//       });
//       await fetch("http://localhost:3000/api/queue", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           action: "add-song",
//           mediaItem,
//           userId: user.id,
//           userName: user.name,
//           position,
//         }),
//       });
//     }
//   } catch (error) {
//     console.log("Failed to sync with session manager:", error.message);
//   }
// }
//
// module.exports = { syncWithApiQueue };
