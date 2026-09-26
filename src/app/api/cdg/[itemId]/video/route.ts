import { NextRequest, NextResponse } from "next/server";
import { getJellyfinService } from "@/services/jellyfin";
import { authHeaders, isValidItemId, pluginUrl } from "@/services/cdg/source";
import { jellyfinFetch } from "@/lib/jellyfinFetch";

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
];

/**
 * GET /api/cdg/:itemId/video[?format=webm] — option C: CD+G graphics
 * pre-rendered to a silent video by the Jellyfin plugin, proxied with Range
 * support so the TV can seek it in step with the song's audio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  if (!isValidItemId(itemId)) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  try {
    const ctx = await getJellyfinService().ensureAuth();
    const headers = authHeaders(ctx);
    const range = request.headers.get("range");
    if (range) headers["Range"] = range;

    // Only forward known formats; the plugin defaults to H.264 MP4
    const webm = request.nextUrl.searchParams.get("format") === "webm";
    const url = pluginUrl(ctx, "Video", itemId) + (webm ? "?format=webm" : "");
    const response = await jellyfinFetch(url, { headers });
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: "No CDG video available" },
        { status: response.ok ? 502 : response.status }
      );
    }

    const outHeaders = new Headers({ "Cache-Control": "public, max-age=3600" });
    for (const name of PASSTHROUGH_HEADERS) {
      const value = response.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    return new NextResponse(response.body, {
      status: response.status,
      headers: outHeaders,
    });
  } catch (error) {
    console.error("CDG video proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
