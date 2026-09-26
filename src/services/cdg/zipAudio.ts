// Zipped karaoke songs: Jellyfin lists a silent placeholder MP3 for each zip, and
// the Karaoke CDG plugin serves the real audio from the extracted zip
import { getJellyfinService } from "@/services/jellyfin";
import type { JellyfinContext } from "@/services/jellyfin/types";
import { authHeaders, isValidItemId, pluginUrl } from "./source";
import { jellyfinFetch } from "@/lib/jellyfinFetch";

const CACHE_TTL_MS = 10 * 60 * 1000;
const zipBackedCache = new Map<string, { zip: boolean; expires: number }>();

export interface AudioSource {
  url: string;
  headers: Record<string, string>;
}

/** Test hook: forget cached answers */
export function clearZipCache(): void {
  zipBackedCache.clear();
}

/**
 * Asks the plugin whether an item is a zip placeholder (which also extracts
 * the zip). Answers are cached; failures are not, so a plugin hiccup doesn't
 * stick. Items without the plugin get a 404 and count as not zip-backed.
 */
export async function isZipBacked(
  ctx: JellyfinContext,
  itemId: string,
  now: number = Date.now()
): Promise<boolean> {
  const cached = zipBackedCache.get(itemId);
  if (cached && cached.expires > now) return cached.zip;

  const response = await jellyfinFetch(pluginUrl(ctx, "Prepare", itemId), {
    headers: authHeaders(ctx),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Karaoke prepare failed: ${response.status}`);
  }
  const zip = response.ok && (await response.json()).ZipBacked === true;
  zipBackedCache.set(itemId, { zip, expires: now + CACHE_TTL_MS });
  return zip;
}

/** The plugin's audio for a zipped song, or null to stream the item normally */
export async function getZipAudioSource(
  itemId: string
): Promise<AudioSource | null> {
  if (!isValidItemId(itemId)) return null;
  try {
    const ctx = await getJellyfinService().ensureAuth();
    if (!(await isZipBacked(ctx, itemId))) return null;
    return { url: pluginUrl(ctx, "Audio", itemId), headers: authHeaders(ctx) };
  } catch (error) {
    console.warn("Could not check for a zipped karaoke song:", error);
    return null;
  }
}
