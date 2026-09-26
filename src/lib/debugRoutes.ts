import { NextResponse } from "next/server";

/**
 * Debug routes expose library and session details without a login, so in
 * production they answer 404 unless ENABLE_DEBUG_ROUTES=true.
 */
export function debugRoutesEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NODE_ENV !== "production" ||
    (env.ENABLE_DEBUG_ROUTES || "").toLowerCase() === "true"
  );
}

export function debugRouteNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
