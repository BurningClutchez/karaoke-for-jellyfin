"use client";

import { useCallback, useEffect, useState } from "react";
import type { CdgMode } from "@/lib/config";
import { isValidCdg } from "@/lib/cdg/decoder";
import { reportClientError } from "@/lib/clientLog";

export type CdgSource =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "canvas"; data: Uint8Array }
  | { kind: "video"; url: string };

/** H.264 MP4 plays almost everywhere; VP9 WebM covers browsers built without H.264 */
export function preferredVideoFormat(): "mp4" | "webm" {
  if (typeof document === "undefined") return "mp4";
  const video = document.createElement("video");
  if (video.canPlayType('video/mp4; codecs="avc1.64001f"')) return "mp4";
  return video.canPlayType('video/webm; codecs="vp9"') ? "webm" : "mp4";
}

export function cdgVideoUrl(
  itemId: string,
  format: "mp4" | "webm" = preferredVideoFormat()
): string {
  const query = format === "webm" ? "?format=webm" : "";
  return `/api/cdg/${encodeURIComponent(itemId)}/video${query}`;
}

/** Where to start before (or instead of) fetching the raw CDG file */
export function initialCdgSource(
  itemId: string | undefined,
  mode: CdgMode
): CdgSource {
  if (!itemId || mode === "off") return { kind: "none" };
  if (mode === "video") return { kind: "video", url: cdgVideoUrl(itemId) };
  return { kind: "loading" };
}

/** Decide how to show a song once the raw CDG request settles */
export function cdgSourceFromData(
  itemId: string,
  mode: CdgMode,
  data: Uint8Array | null
): CdgSource {
  if (!data) return { kind: "none" };
  if (isValidCdg(data)) return { kind: "canvas", data };
  return mode === "auto"
    ? { kind: "video", url: cdgVideoUrl(itemId) }
    : { kind: "none" };
}

/** Next source to try after the current one failed to display */
export function fallbackCdgSource(
  current: CdgSource,
  itemId: string,
  mode: CdgMode
): CdgSource {
  if (current.kind === "canvas" && mode === "auto") {
    return { kind: "video", url: cdgVideoUrl(itemId) };
  }
  return { kind: "none" };
}

interface CdgFetchResult {
  data: Uint8Array | null;
  /** Set when graphics were expected but couldn't be loaded (not for 404) */
  problem: string | null;
}

/** Fetch the raw CDG file; a 404 simply means the song has no graphics */
export async function fetchCdg(
  itemId: string,
  signal?: AbortSignal
): Promise<CdgFetchResult> {
  try {
    const response = await fetch(`/api/cdg/${encodeURIComponent(itemId)}`, {
      signal,
    });
    if (response.ok) {
      return {
        data: new Uint8Array(await response.arrayBuffer()),
        problem: null,
      };
    }
    return {
      data: null,
      problem: response.status === 404 ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { data: null, problem: (error as Error).message || "network error" };
  }
}

type SourceState = { key: string; source: CdgSource; problem: string | null };

function reportProblem(itemId: string, problem: string) {
  reportClientError("warn", `Karaoke graphics for ${itemId}: ${problem}`);
}

export function useCdgSource(itemId: string | undefined, mode: CdgMode) {
  const key = `${itemId}:${mode}`;
  const [state, setState] = useState<SourceState>(() => ({
    key,
    source: initialCdgSource(itemId, mode),
    problem: null,
  }));
  const current: SourceState =
    state.key === key
      ? state
      : { key, source: initialCdgSource(itemId, mode), problem: null };

  useEffect(() => {
    if (initialCdgSource(itemId, mode).kind !== "loading" || !itemId) return;

    const controller = new AbortController();
    fetchCdg(itemId, controller.signal).then(({ data, problem }) => {
      if (controller.signal.aborted) return;
      if (problem) reportProblem(itemId, problem);
      setState({ key, source: cdgSourceFromData(itemId, mode, data), problem });
    });
    return () => controller.abort();
  }, [itemId, mode, key]);

  const fallBack = useCallback(() => {
    const next = fallbackCdgSource(current.source, itemId || "", mode);
    const problem =
      next.kind === "none" ? `${current.source.kind} display failed` : null;
    if (problem) reportProblem(itemId || "", problem);
    setState({ key, source: next, problem });
  }, [current.source, itemId, mode, key]);

  return { source: current.source, problem: current.problem, fallBack };
}
