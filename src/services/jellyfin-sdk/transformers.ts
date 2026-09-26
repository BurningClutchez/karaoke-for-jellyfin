// Transform Jellyfin API responses into app domain models
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { MediaItem, Artist, Playlist } from "@/types";
import type { SingableItem } from "./singable";

/**
 * Transform Jellyfin artist items to our Artist format
 */
export function transformArtists(
  items: BaseItemDto[],
  baseUrl: string
): Artist[] {
  return items
    .filter(item => item.Type === "MusicArtist")
    .map(item => transformArtist(item, baseUrl))
    .filter(Boolean) as Artist[];
}

function transformArtist(item: BaseItemDto, baseUrl: string): Artist | null {
  if (item.Type !== "MusicArtist") {
    return null;
  }

  return {
    id: `jellyfin_artist_${item.Id}`,
    name: item.Name || "Unknown Artist",
    jellyfinId: item.Id || "",
    imageUrl: item.ImageTags?.Primary
      ? `${baseUrl}/Items/${item.Id}/Images/Primary?maxHeight=300&maxWidth=300&quality=90`
      : undefined,
  };
}

/**
 * Transform Jellyfin audio items to our MediaItem format. Which songs are
 * shown is decided before this, by keepSingable (SONG_FILTER).
 */
export function transformMediaItems(items: SingableItem[]): MediaItem[] {
  return items
    .map(item => transformMediaItem(item))
    .filter(Boolean) as MediaItem[];
}

function transformMediaItem(item: SingableItem): MediaItem | null {
  if (item.Type !== "Audio") {
    return null;
  }

  const duration = item.RunTimeTicks
    ? Math.round(item.RunTimeTicks / 10000000)
    : 0;

  return {
    id: `jellyfin_${item.Id}`,
    title: item.Name || "Unknown Title",
    artist: item.Artists?.join(", ") || "Unknown Artist",
    album: item.Album || undefined,
    duration,
    jellyfinId: item.Id || "",
    streamUrl: `/api/stream/${item.Id || ""}`,
    lyricsPath: `jellyfin_${item.Id}`,
    hasLyrics: item.HasLyrics === true,
    ...(item.HasKaraokeGraphics ? { hasGraphics: true } : {}),
  };
}

/**
 * Transform Jellyfin playlist items to our Playlist format
 */
export function transformPlaylists(
  items: BaseItemDto[],
  baseUrl: string
): Playlist[] {
  return items
    .filter(item => item.Type === "Playlist")
    .map(item => ({
      id: `jellyfin_playlist_${item.Id}`,
      name: item.Name || "Unknown Playlist",
      jellyfinId: item.Id || "",
      imageUrl: item.ImageTags?.Primary
        ? `${baseUrl}/Items/${item.Id}/Images/Primary?maxHeight=300&maxWidth=300&quality=90`
        : undefined,
      trackCount: item.ChildCount || 0,
      description: item.Overview || undefined,
      createdAt: item.DateCreated ? new Date(item.DateCreated) : undefined,
    }));
}
