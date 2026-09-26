// Server-side configuration

/**
 * How the TV shows CD+G karaoke graphics:
 * - auto: decode in the browser, fall back to plugin-rendered video
 * - canvas: browser decoding only
 * - video: always use plugin-rendered video (for weak TV browsers)
 * - off: ignore CDG files, always show lyrics
 */
export type CdgMode = "auto" | "canvas" | "video" | "off";

const CDG_MODES: CdgMode[] = ["auto", "canvas", "video", "off"];

export function parseCdgMode(value: string | undefined): CdgMode {
  const mode = (value || "").toLowerCase() as CdgMode;
  return CDG_MODES.includes(mode) ? mode : "auto";
}

export interface AppConfig {
  autoplayDelay: number;
  queueAutoplayDelay: number;
  controlsAutoHideDelay: number;
  timeUpdateInterval: number;
  ratingAnimationDuration: number;
  nextSongDuration: number;
  cdgMode: CdgMode;
}

export function getServerConfig(): AppConfig {
  return {
    autoplayDelay: parseInt(process.env.AUTOPLAY_DELAY || "500"),
    queueAutoplayDelay: parseInt(process.env.QUEUE_AUTOPLAY_DELAY || "1000"),
    controlsAutoHideDelay: parseInt(
      process.env.CONTROLS_AUTO_HIDE_DELAY || "10000"
    ),
    timeUpdateInterval: parseInt(process.env.TIME_UPDATE_INTERVAL || "2000"),
    ratingAnimationDuration: parseInt(
      process.env.RATING_ANIMATION_DURATION || "15000"
    ),
    nextSongDuration: parseInt(process.env.NEXT_SONG_DURATION || "15000"),
    cdgMode: parseCdgMode(process.env.CDG_MODE),
  };
}
