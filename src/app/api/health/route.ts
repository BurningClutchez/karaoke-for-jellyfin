import { NextRequest, NextResponse } from "next/server";
import { jellyfinFetch } from "@/lib/jellyfinFetch";
import { jellyfinAuthHeaders } from "@/lib/jellyfinAuth";
// Shared with the startup check and `npm run check:jellyfin`
import { check, loadSettings } from "../../../../server/jellyfin-check";

const CACHE_MS = 10000;
let cached: { at: number; body: HealthBody } | null = null;

interface HealthBody {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  jellyfin: { ok: boolean; problems: string[] };
  karaokePlugin: { installed: boolean; [key: string]: unknown };
}

async function pluginStatus(settings: Record<string, string>) {
  try {
    const response = await jellyfinFetch(
      `${settings.JELLYFIN_SERVER_URL.replace(/\/$/, "")}/Karaoke/Status`,
      { headers: jellyfinAuthHeaders(settings.JELLYFIN_API_KEY) }
    );
    return response.ok
      ? { installed: true, ...(await response.json()) }
      : { installed: false };
  } catch {
    return { installed: false };
  }
}

async function measure(): Promise<HealthBody> {
  const settings = loadSettings(process.env, "");
  const problems: string[] = await check(
    settings,
    jellyfinFetch as unknown as typeof fetch
  );
  return {
    status: problems.length === 0 ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    jellyfin: { ok: problems.length === 0, problems },
    karaokePlugin:
      problems.length === 0
        ? await pluginStatus(settings)
        : { installed: false },
  };
}

/**
 * GET /api/health — app and Jellyfin status. Answers 200 while the app is
 * running even if Jellyfin is down (restarting the app would lose the queue);
 * add ?strict=1 to get 503 when Jellyfin has problems.
 */
export async function GET(request: NextRequest) {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), body: await measure() };
  }
  const strict = request.nextUrl.searchParams.get("strict") === "1";
  const status = strict && cached.body.status !== "ok" ? 503 : 200;
  return NextResponse.json(cached.body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Test hook */
export function clearHealthCache() {
  cached = null;
}
