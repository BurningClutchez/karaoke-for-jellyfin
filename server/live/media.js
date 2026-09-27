/**
 * What the live channel needs for each item, fetched from the app's own API so
 * the existing logic applies unchanged: /api/stream (audio, zipped songs too),
 * /api/cdg (CD+G from the local mount or the plugin) and /api/lyrics.
 */
const fs = require("fs/promises");
const path = require("path");
const QRCode = require("qrcode");
const { lyricsAss, cardAss } = require("./ass");

async function fetchCdg(baseUrl, jellyfinId, fetchImpl) {
  if ((process.env.CDG_MODE || "").toLowerCase() === "off") return null;
  const response = await fetchImpl(
    `${baseUrl}/api/cdg/${encodeURIComponent(jellyfinId)}`
  );
  if (!response.ok) return null;
  const data = Buffer.from(await response.arrayBuffer());
  return data.length > 0 ? data : null;
}

async function fetchLyrics(baseUrl, songId, fetchImpl) {
  const response = await fetchImpl(
    `${baseUrl}/api/lyrics/${encodeURIComponent(songId)}`
  );
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body?.data?.lines) ? body.data.lines : [];
}

/**
 * Files for a song item: { audioUrl, cdgPath } for CD+G songs, otherwise
 * { audioUrl, assPath } with the lyrics (or just the title when there are none).
 */
async function prepareSong(
  song,
  { baseUrl, dir, fetchImpl = fetch, log = console }
) {
  const item = song.mediaItem;
  const id = item.jellyfinId || String(item.id).replace(/^jellyfin_/, "");
  const audioUrl = `${baseUrl}/api/stream/${encodeURIComponent(id)}`;
  const safeId = id.replace(/[^\w-]/g, "");
  const cdg = await fetchCdg(baseUrl, id, fetchImpl).catch(error => {
    log.warn(`[live] CD+G lookup failed for "${item.title}": ${error.message}`);
    return null;
  });
  if (cdg) {
    const cdgPath = path.join(dir, `${safeId}.cdg`);
    await fs.writeFile(cdgPath, cdg);
    return { audioUrl, cdgPath };
  }
  const lines = await fetchLyrics(baseUrl, item.id, fetchImpl).catch(() => []);
  const assPath = path.join(dir, `${safeId}.ass`);
  await fs.writeFile(
    assPath,
    lyricsAss({
      title: item.title,
      artist: item.artist,
      singer: song.addedBy,
      lines,
      duration: item.duration || undefined,
    })
  );
  return { audioUrl, assPath };
}

/** The card's text lines */
function cardLines(card, joinUrl) {
  const join = joinUrl ? [{ text: `Scan to join: ${joinUrl}` }] : [];
  const song = card.song?.mediaItem;
  switch (card.kind) {
    case "nextup":
      return [
        { text: "Up next" },
        { text: song?.title || "", style: "Big" },
        { text: song?.artist || "" },
        { text: card.song?.addedBy ? `Sung by ${card.song.addedBy}` : "" },
        ...join,
      ];
    case "paused":
      return [
        { text: "Paused" },
        { text: song?.title || "", style: "Big" },
        ...join,
      ];
    default:
      return [
        { text: "Karaoke Party" },
        { text: "Pick a song!", style: "Big" },
        { text: "Scan the code with your phone to add songs" },
        ...join,
      ];
  }
}

/** Files for a card item: { assPath, qrPath } */
async function prepareCard(card, { dir, joinUrl }) {
  const assPath = path.join(dir, `card-${card.kind}.ass`);
  await fs.writeFile(
    assPath,
    cardAss(cardLines(card, joinUrl).filter(l => l.text))
  );
  if (!joinUrl) return { assPath };
  const qrPath = path.join(dir, "join-qr.png");
  await QRCode.toFile(qrPath, joinUrl, { width: 320, margin: 2 });
  return { assPath, qrPath };
}

/** Delete a song's temporary files once it has played */
function cleanup(files) {
  [files?.cdgPath, files?.assPath]
    .filter(Boolean)
    .forEach(file => fs.rm(file, { force: true }).catch(() => {}));
}

module.exports = { prepareSong, prepareCard, cardLines, cleanup };
