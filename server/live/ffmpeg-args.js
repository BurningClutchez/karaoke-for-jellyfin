/**
 * ffmpeg arguments for the live channel. Every item (song or card) is encoded
 * in real time (-re) to the same format, 1280x720 30 fps H.264 + 48 kHz
 * stereo AAC, and cut into MPEG-TS segments by the HLS muxer (it keeps the
 * continuity counters running across segments). -output_ts_offset continues
 * the timestamps from the previous item, so viewers see one unbroken stream.
 */
const path = require("path");

const SEGMENT_SECONDS = 4;
const BACKGROUND = "color=c=0x1e1b4b:s=1280x720:r=30";
const SILENCE = "anullsrc=r=48000:cl=stereo";

/** Escape a path for use inside a filter graph argument */
function filterPath(file) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** Where an item's own playlist goes; segments.js watches it for new segments */
const itemPlaylist = (dir, startNumber) =>
  path.join(dir, `item-${startNumber}.m3u8`);

function outputArgs({ offset, startNumber, dir }) {
  return [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-b:v",
    "2500k",
    "-maxrate",
    "3000k",
    "-bufsize",
    "6000k",
    "-force_key_frames",
    `expr:gte(t,n_forced*${SEGMENT_SECONDS / 2})`,
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-output_ts_offset",
    offset.toFixed(3),
    "-f",
    "hls",
    "-hls_time",
    String(SEGMENT_SECONDS),
    "-hls_list_size",
    "0",
    "-start_number",
    String(startNumber),
    "-hls_segment_filename",
    path.join(dir, "seg_%06d.ts"),
    itemPlaylist(dir, startNumber),
  ];
}

const base = ["-hide_banner", "-loglevel", "error", "-nostdin"];
const seekArgs = startAt => (startAt > 0 ? ["-ss", startAt.toFixed(2)] : []);

/**
 * A song: CD+G graphics when there is a .cdg file, otherwise a background
 * with the lyrics (or just the title) from an ASS file. Ends with the audio.
 */
function songArgs({ audioUrl, cdgPath, assPath, startAt = 0, ...output }) {
  const video = cdgPath
    ? ["-re", ...seekArgs(startAt), "-f", "cdg", "-i", cdgPath]
    : ["-re", "-f", "lavfi", "-i", BACKGROUND];
  const filter = cdgPath
    ? "[0:v]scale=-2:720:flags=neighbor,pad=1280:720:(ow-iw)/2:0:black,fps=30,format=yuv420p[v]"
    : `[0:v]setpts=PTS+${startAt.toFixed(2)}/TB,subtitles=filename='${filterPath(assPath)}',setpts=PTS-STARTPTS,format=yuv420p[v]`;
  return [
    ...base,
    ...video,
    ...seekArgs(startAt),
    "-i",
    audioUrl,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "1:a",
    "-shortest",
    ...outputArgs(output),
  ];
}

/**
 * A card: background, text from an ASS file, the join QR code on the right
 * and silence. Runs for `seconds`, or until stopped when omitted.
 */
function cardArgs({ assPath, qrPath, seconds, ...output }) {
  const qr = qrPath ? ["-loop", "1", "-i", qrPath] : [];
  const text = `[0:v]subtitles=filename='${filterPath(assPath)}'`;
  const filter = qrPath
    ? `${text}[bg];[bg][2:v]overlay=W-w-100:(H-h)/2,format=yuv420p[v]`
    : `${text},format=yuv420p[v]`;
  return [
    ...base,
    "-re",
    "-f",
    "lavfi",
    "-i",
    BACKGROUND,
    "-f",
    "lavfi",
    "-i",
    SILENCE,
    ...qr,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "1:a",
    ...(seconds ? ["-t", String(seconds)] : []),
    ...outputArgs(output),
  ];
}

module.exports = {
  songArgs,
  cardArgs,
  outputArgs,
  filterPath,
  itemPlaylist,
  SEGMENT_SECONDS,
};
