// Which songs singers can pick. SONG_FILTER=karaoke (default) keeps songs with
// lyrics or CD+G graphics, "lyrics" keeps songs with lyrics, "all" keeps all.
import { access } from "fs/promises";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { JellyfinContext } from "./types";
import { jellyfinFetch, mediaBrowserToken } from "@/lib/jellyfinFetch";
import {
  cdgCandidates,
  getCdgPathConfig,
  mapToLocalPath,
} from "@/services/cdg/paths";

export type SongFilter = "karaoke" | "lyrics" | "all";

const LIST_LIFETIME_MS = 5 * 60_000;
const MISSING_LIFETIME_MS = 60_000;
let graphicsCache: { ids: Set<string> | null; expires: number } | null = null;

export function songFilter(env: NodeJS.ProcessEnv = process.env): SongFilter {
  const value = (env.SONG_FILTER || "").toLowerCase();
  return value === "lyrics" || value === "all" ? value : "karaoke";
}

/** Only in "lyrics" mode can Jellyfin do the filtering itself */
export function lyricsQueryParams(): Record<string, string> {
  return songFilter() === "lyrics" ? { filters: "HasLyrics" } : {};
}

/** Jellyfin writes ids with or without dashes; compare them without */
const normalizeId = (id: string | null | undefined) =>
  (id || "").replace(/-/g, "").toLowerCase();

/**
 * Ids of songs with CD+G graphics, from the Karaoke CDG plugin. Cached for a
 * few minutes; null when the plugin isn't installed or can't be reached.
 */
export async function fetchGraphicsIds(
  ctx: JellyfinContext
): Promise<Set<string> | null> {
  if (graphicsCache && graphicsCache.expires > Date.now()) {
    return graphicsCache.ids;
  }
  let ids: Set<string> | null = null;
  try {
    const response = await jellyfinFetch(`${ctx.baseUrl}/Karaoke/Songs`, {
      headers: { Authorization: mediaBrowserToken(ctx.apiKey) },
    });
    if (response.ok) {
      const body: { ItemIds?: string[] } = await response.json();
      ids = new Set((body.ItemIds || []).map(normalizeId));
    }
  } catch (error) {
    console.debug("Karaoke song list unavailable:", (error as Error).message);
  }
  const lifetime = ids ? LIST_LIFETIME_MS : MISSING_LIFETIME_MS;
  graphicsCache = { ids, expires: Date.now() + lifetime };
  return ids;
}

export function resetGraphicsCache(): void {
  graphicsCache = null;
}

/** Without the plugin: look for the .cdg file in the local mount (option A) */
async function hasLocalCdg(item: BaseItemDto): Promise<boolean> {
  const config = getCdgPathConfig();
  const local = config && item.Path ? mapToLocalPath(item.Path, config) : null;
  if (!local) return false;
  for (const candidate of cdgCandidates(local)) {
    try {
      await access(candidate);
      return true;
    } catch {
      // Not under this name; try the next one
    }
  }
  return false;
}

/** A Jellyfin song, marked when it has CD+G graphics */
export type SingableItem = BaseItemDto & { HasKaraokeGraphics?: boolean };

/**
 * Drops the songs singers shouldn't see, according to SONG_FILTER, and marks
 * the ones that have CD+G graphics so the phone can badge them as karaoke.
 */
export async function keepSingable(
  ctx: JellyfinContext,
  items: BaseItemDto[]
): Promise<SingableItem[]> {
  const mode = songFilter();
  const withLyrics = (item: BaseItemDto) => item.HasLyrics === true;
  if (mode === "lyrics") return items.filter(withLyrics);
  if (items.every(withLyrics)) return items;

  const graphics = await fetchGraphicsIds(ctx);
  const marked: SingableItem[] = await Promise.all(
    items.map(async item => {
      if (withLyrics(item)) return item;
      const hasGraphics = graphics
        ? graphics.has(normalizeId(item.Id))
        : await hasLocalCdg(item);
      return hasGraphics ? { ...item, HasKaraokeGraphics: true } : item;
    })
  );
  if (mode === "all") return marked;

  const kept = marked.filter(
    item => withLyrics(item) || item.HasKaraokeGraphics
  );
  if (kept.length < items.length) {
    console.debug(
      `Hid ${items.length - kept.length} songs without lyrics or karaoke graphics`
    );
  }
  return kept;
}
