/**
 * ASS subtitles for the live channel: karaoke-style lyrics (each line fills
 * word by word) and the text of the between-song cards. ffmpeg's libass
 * renders them onto the video.
 */
const WIDTH = 1280;
const HEIGHT = 720;
const FOREVER = 35999; // 9:59:59, for cards that run until replaced

// &HAABBGGRR colours
const WHITE = "&H00FFFFFF";
const GREY = "&H00B0B0B0";
const PURPLE = "&H00FC84C0";
const BLACK = "&H00000000";
const SHADE = "&H80000000";

const style = (name, size, primary, secondary, bold, align) =>
  `Style: ${name},DejaVu Sans,${size},${primary},${secondary},${BLACK},${SHADE},${bold ? -1 : 0},0,0,0,100,100,0,0,1,3,1,${align},80,80,40,1`;

const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style("Sing", 60, PURPLE, WHITE, true, 5)}
${style("Next", 42, GREY, GREY, false, 5)}
${style("Info", 30, GREY, GREY, false, 8)}
${style("Big", 64, WHITE, WHITE, true, 4)}
${style("Small", 36, GREY, GREY, false, 4)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/** Text safe to put in a Dialogue line: no override blocks or line breaks */
function clean(text) {
  return String(text ?? "")
    .replace(/\\/g, "/")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

/** Seconds as H:MM:SS.cc */
function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  const pad = n => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

const dialogue = (start, end, styleName, text) =>
  `Dialogue: 0,${assTime(start)},${assTime(end)},${styleName},,0,0,0,,${text}`;

/** A line that fills word by word over its duration (\kf karaoke tags) */
function karaoke(text, seconds) {
  const words = clean(text).split(" ").filter(Boolean);
  const each = Math.max(1, Math.round((seconds * 100) / words.length));
  return words.map(word => `{\\kf${each}}${word}`).join(" ");
}

function songInfo({ title, artist, singer }) {
  const parts = [clean(title), clean(artist)].filter(Boolean).join(" — ");
  return singer ? `${parts} · sung by ${clean(singer)}` : parts;
}

/**
 * Lyrics for one song. lines: [{ timestamp (ms), text }] as /api/lyrics
 * returns them. Blank lines only mark pauses.
 */
function lyricsAss({ title, artist, singer, lines = [], duration = FOREVER }) {
  const timed = lines
    .map(line => ({ start: line.timestamp / 1000, text: clean(line.text) }))
    .sort((a, b) => a.start - b.start);
  const events = [
    dialogue(0, duration, "Info", songInfo({ title, artist, singer })),
  ];
  const first = timed.find(line => line.text);
  if (!first || first.start > 2) {
    const end = first ? first.start - 0.5 : duration;
    events.push(
      dialogue(0, end, "Big", `{\\an5\\pos(640,330)}${clean(title)}`)
    );
    events.push(dialogue(0, end, "Next", `{\\pos(640,420)}${clean(artist)}`));
  }
  timed.forEach((line, i) => {
    if (!line.text) return;
    const end = Math.min(timed[i + 1]?.start ?? line.start + 5, duration);
    if (end <= line.start) return;
    events.push(
      dialogue(
        line.start,
        end,
        "Sing",
        `{\\pos(640,340)}${karaoke(line.text, end - line.start)}`
      )
    );
    const next = timed.slice(i + 1).find(candidate => candidate.text);
    if (next) {
      events.push(
        dialogue(line.start, end, "Next", `{\\pos(640,440)}${next.text}`)
      );
    }
  });
  return HEADER + events.join("\n") + "\n";
}

/**
 * Text for a card. lines: [{ text, style: "Big" | "Small" }], stacked from
 * the top left (the QR code sits on the right).
 */
function cardAss(lines, duration = FOREVER) {
  let y = 200;
  const events = lines.map(({ text, style: name = "Small" }) => {
    const event = dialogue(
      0,
      duration,
      name,
      `{\\pos(100,${y})}${clean(text)}`
    );
    y += name === "Big" ? 90 : 60;
    return event;
  });
  return HEADER + events.join("\n") + "\n";
}

module.exports = { lyricsAss, cardAss, assTime, clean, karaoke, FOREVER };
