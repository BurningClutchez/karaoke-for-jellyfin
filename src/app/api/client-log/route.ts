import { NextRequest, NextResponse } from "next/server";

// Browser errors from the TV and phones, written to the server log
const MAX_PER_MINUTE_PER_CLIENT = 30;
const clients = new Map<string, number[]>();

function allowed(client: string, now: number): boolean {
  const times = (clients.get(client) || []).filter(t => now - t < 60000);
  if (times.length >= MAX_PER_MINUTE_PER_CLIENT) return false;
  times.push(now);
  clients.set(client, times);
  return true;
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

/** Test hook */
export function resetClientLogLimits() {
  clients.clear();
}

export async function POST(request: NextRequest) {
  // Set by server.js from the connection (or a trusted proxy), never the client
  const client = request.headers.get("x-karaoke-client-address") || "local";
  if (!allowed(client, Date.now())) {
    return new NextResponse(null, { status: 429 });
  }

  let report: Record<string, unknown>;
  try {
    report = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const message = text(report.message, 1000);
  if (!message) return new NextResponse(null, { status: 400 });
  const source = text(report.source, 20) || "browser";
  const stack = text(report.stack, 4000);
  const line = `[client:${source}] ${message} (${text(report.url, 200)})${stack ? `\n${stack}` : ""}`;
  if (report.level === "warn") console.warn(line);
  else console.error(line);
  return new NextResponse(null, { status: 204 });
}
