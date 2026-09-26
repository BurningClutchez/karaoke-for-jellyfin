// Option A: map Jellyfin's media paths onto a locally mounted copy of the library
import path from "path";

export interface CdgPathConfig {
  /** Library root as Jellyfin sees it, e.g. /media/music */
  jellyfinRoot: string;
  /** Same folder as mounted in this app, e.g. /music */
  localRoot: string;
}

function trimTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/[\\/]+$/, "") : value;
}

/** Returns null when no local mount is configured (option A disabled) */
export function getCdgPathConfig(
  env: NodeJS.ProcessEnv = process.env
): CdgPathConfig | null {
  const localRoot = env.CDG_LOCAL_ROOT;
  if (!localRoot) return null;
  return {
    localRoot: path.resolve(localRoot),
    jellyfinRoot: trimTrailingSlash(env.CDG_JELLYFIN_ROOT || localRoot),
  };
}

/**
 * Translate a Jellyfin media path into a path under the local root.
 * Returns null for paths outside the configured root or that would escape it.
 */
export function mapToLocalPath(
  jellyfinPath: string,
  config: CdgPathConfig
): string | null {
  const normalized = jellyfinPath.replace(/\\/g, "/");
  const root = config.jellyfinRoot.replace(/\\/g, "/");
  const prefix = root.endsWith("/") ? root : root + "/";
  if (!normalized.startsWith(prefix)) return null;

  const relative = normalized.slice(prefix.length);
  const local = path.resolve(config.localRoot, relative);
  const localPrefix = config.localRoot.endsWith(path.sep)
    ? config.localRoot
    : config.localRoot + path.sep;
  if (!local.startsWith(localPrefix)) return null;
  return local;
}

/** Sidecar CDG file names to try for an audio file (.cdg and .CDG) */
export function cdgCandidates(audioPath: string): string[] {
  const extension = path.extname(audioPath);
  const base = extension ? audioPath.slice(0, -extension.length) : audioPath;
  return [`${base}.cdg`, `${base}.CDG`];
}
