/**
 * The address a request came from, for per-client limits. X-Forwarded-For is
 * only believed with TRUST_PROXY=true (the app sits behind a reverse proxy),
 * since any client can send that header. The proxy appends the address it
 * saw, so the last entry is the one it vouches for.
 */
const CLIENT_ADDRESS_HEADER = "x-karaoke-client-address";

function clientAddress(req, env = process.env) {
  if ((env.TRUST_PROXY || "").toLowerCase() === "true") {
    const forwarded = req.headers["x-forwarded-for"];
    const list = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    const last = (list || "")
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean)
      .pop();
    if (last) return last;
  }
  return req.socket?.remoteAddress || "unknown";
}

/** Set the header API routes read, replacing any value the client sent */
function tagClientAddress(req, env = process.env) {
  req.headers[CLIENT_ADDRESS_HEADER] = clientAddress(req, env);
}

module.exports = { clientAddress, tagClientAddress, CLIENT_ADDRESS_HEADER };
