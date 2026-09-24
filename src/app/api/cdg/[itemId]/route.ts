import { NextRequest, NextResponse } from "next/server";
import { getJellyfinService } from "@/services/jellyfin";
import { getCdgFile, isValidItemId } from "@/services/cdg/source";

/**
 * GET /api/cdg/:itemId — raw CD+G graphics for a song, decoded on the TV.
 * Looks in the locally mounted library first (A), then the Jellyfin plugin (B).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  if (!isValidItemId(itemId)) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  try {
    const ctx = await getJellyfinService().ensureAuth();
    const file = await getCdgFile(ctx, itemId);
    if (!file) {
      return NextResponse.json({ error: "No CDG graphics" }, { status: 404 });
    }

    return new NextResponse(Buffer.from(file.data), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(file.data.length),
        "Cache-Control": "public, max-age=3600",
        "X-Cdg-Source": file.source,
      },
    });
  } catch (error) {
    console.error("CDG lookup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
