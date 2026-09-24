// Jellyfin's standard auth header. Jellyfin 12 rejects the legacy
// X-Emby-Token header and api_key query parameter unless an admin turns
// "Enable legacy authorization" back on; this header works on every version.
export function mediaBrowserToken(apiKey: string): string {
  return `MediaBrowser Token="${apiKey}"`;
}

export function jellyfinAuthHeaders(apiKey: string): { Authorization: string } {
  return { Authorization: mediaBrowserToken(apiKey) };
}
