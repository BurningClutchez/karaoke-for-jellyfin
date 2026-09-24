// Locate CDG graphics for a Jellyfin item: local mount first (A), then plugin (B)
import { readFile } from "fs/promises";
import type { JellyfinContext } from "@/services/jellyfin/types";
import { cdgCandidates, getCdgPathConfig, mapToLocalPath } from "./paths";

export type CdgSourceKind = "local" | "plugin";

export interface CdgFile {
  data: Uint8Array;
  source: CdgSourceKind;
}

const ITEM_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export function isValidItemId(itemId: string): boolean {
  return ITEM_ID_PATTERN.test(itemId);
}

function authHeaders(ctx: JellyfinContext): Record<string, string> {
  return { "X-Emby-Token": ctx.apiKey };
}

/** Plugin endpoint URL for raw CDG (B) or pre-rendered video (C) */
export function pluginUrl(
  ctx: JellyfinContext,
  kind: "Cdg" | "Video",
  itemId: string
): string {
  return `${ctx.baseUrl}/Karaoke/${kind}/${itemId}`;
}

export async function getItemPath(
  ctx: JellyfinContext,
  itemId: string
): Promise<string | null> {
  const response = await fetch(
    `${ctx.baseUrl}/Items/${itemId}?userId=${ctx.userId}&fields=Path`,
    { headers: authHeaders(ctx) }
  );
  if (!response.ok) return null;
  const item: { Path?: string } = await response.json();
  return item.Path || null;
}

async function readFirstExisting(paths: string[]): Promise<Uint8Array | null> {
  for (const candidate of paths) {
    try {
      return new Uint8Array(await readFile(candidate));
    } catch {
      // Not present under this name; try the next candidate
    }
  }
  return null;
}

/** Option A: read the sidecar .cdg from the locally mounted library */
export async function readLocalCdg(
  ctx: JellyfinContext,
  itemId: string
): Promise<Uint8Array | null> {
  const config = getCdgPathConfig();
  if (!config) return null;
  const itemPath = await getItemPath(ctx, itemId);
  if (!itemPath) return null;
  const localPath = mapToLocalPath(itemPath, config);
  if (!localPath) return null;
  return readFirstExisting(cdgCandidates(localPath));
}

/** Option B: ask the Karaoke CDG Jellyfin plugin for the sidecar file */
export async function fetchPluginCdg(
  ctx: JellyfinContext,
  itemId: string
): Promise<Uint8Array | null> {
  const response = await fetch(pluginUrl(ctx, "Cdg", itemId), {
    headers: authHeaders(ctx),
  });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function tryStep(
  step: () => Promise<Uint8Array | null>,
  label: string
): Promise<Uint8Array | null> {
  try {
    return await step();
  } catch (error) {
    console.warn(`CDG ${label} lookup failed:`, error);
    return null;
  }
}

export async function getCdgFile(
  ctx: JellyfinContext,
  itemId: string
): Promise<CdgFile | null> {
  const local = await tryStep(() => readLocalCdg(ctx, itemId), "local");
  if (local) return { data: local, source: "local" };
  const plugin = await tryStep(() => fetchPluginCdg(ctx, itemId), "plugin");
  if (plugin) return { data: plugin, source: "plugin" };
  return null;
}
