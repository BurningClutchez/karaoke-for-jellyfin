// Authentication and library discovery for the Jellyfin SDK service
import { jellyfinFetch, mediaBrowserToken } from "@/lib/jellyfinFetch";

interface VirtualFolder {
  Name?: string;
  CollectionType?: string;
  ItemId?: string;
}

interface JellyfinUser {
  Id?: string;
  Name?: string;
}

/**
 * Pick the library to browse: the one named by JELLYFIN_MUSIC_LIBRARY, else
 * the only music library. With several music libraries (for example the
 * Karaoke placeholder library next to the main one) returns null, meaning
 * "search all of them".
 */
export function chooseMusicLibrary(
  libraries: VirtualFolder[],
  wanted: string | undefined = process.env.JELLYFIN_MUSIC_LIBRARY
): string | null {
  const music = libraries.filter(lib => lib.CollectionType === "music");
  if (wanted) {
    const named = music.find(
      lib => lib.Name?.toLowerCase() === wanted.toLowerCase()
    );
    if (named) return named.ItemId ?? null;
    console.warn(`JELLYFIN_MUSIC_LIBRARY "${wanted}" not found; using all`);
  }
  return music.length === 1 ? (music[0].ItemId ?? null) : null;
}

/**
 * Find the Music library ID from Jellyfin virtual folders
 */
export async function fetchMusicLibraryId(
  baseUrl: string,
  apiKey: string
): Promise<string | null> {
  try {
    const response = await jellyfinFetch(`${baseUrl}/Library/VirtualFolders`, {
      method: "GET",
      headers: {
        Authorization: mediaBrowserToken(apiKey),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const libraries: VirtualFolder[] = await response.json();
    const libraryId = chooseMusicLibrary(libraries);
    console.log(
      libraryId
        ? `Using music library ${libraryId}`
        : "Searching all music libraries"
    );
    return libraryId;
  } catch (error) {
    console.error("Error getting Music library ID:", error);
    return null;
  }
}

/**
 * Authenticate with Jellyfin by finding a user matching the given username.
 * Returns the user ID on success, or null on failure.
 */
export async function authenticateUser(
  baseUrl: string,
  apiKey: string,
  username: string
): Promise<string | null> {
  try {
    const response = await jellyfinFetch(`${baseUrl}/Users`, {
      method: "GET",
      headers: {
        Authorization: mediaBrowserToken(apiKey),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const users: JellyfinUser[] = await response.json();
    console.log(
      "Available users:",
      users?.map(u => u.Name)
    );

    if (!users || users.length === 0) return null;

    const targetUser = users.find(
      user => user.Name?.toLowerCase() === username.toLowerCase()
    );

    if (targetUser) {
      console.log(
        `Authenticated as user: ${targetUser.Name} (ID: ${targetUser.Id})`
      );
      return targetUser.Id ?? null;
    }

    console.error(
      `User "${username}" not found. Available users:`,
      users.map(u => u.Name)
    );
    return null;
  } catch (error) {
    console.error("Jellyfin authentication error:", error);
    return null;
  }
}

/**
 * Health check against Jellyfin system info endpoint
 */
export async function checkHealth(
  baseUrl: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await jellyfinFetch(`${baseUrl}/System/Info`, {
      method: "GET",
      headers: {
        Authorization: mediaBrowserToken(apiKey),
        "Content-Type": "application/json",
      },
    });
    return response.ok;
  } catch (error) {
    console.error("Jellyfin health check failed:", error);
    return false;
  }
}
