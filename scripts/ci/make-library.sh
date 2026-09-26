#!/usr/bin/env bash
# Builds the music library CI's Jellyfin serves. Needs ffmpeg, node and python3.
#
#   scripts/ci/make-library.sh <music folder>
#
# The end-to-end tests pick artists by position, so the first artists (A-T)
# all have songs with lyrics and no graphics. The CD+G songs sort last ("Zz").
set -euo pipefail

MUSIC=${1:?usage: make-library.sh <music folder>}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$MUSIC"
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=60" \
  -c:a libmp3lame -b:a 128k "$WORK/tone.mp3"
node "$HERE/make-cdg.js" "$WORK/song.cdg" 60

# song <artist> <title> <album> <lyrics|none> -> <artist>/<title>.mp3 (+ .lrc)
song() {
  local folder="$MUSIC/$1"
  mkdir -p "$folder"
  ffmpeg -v error -y -i "$WORK/tone.mp3" -c copy -map_metadata -1 \
    -metadata artist="$1" -metadata album_artist="$1" \
    -metadata title="$2" -metadata album="$3" "$folder/$2.mp3"
  if [ "$4" = lyrics ]; then
    for second in $(seq 0 5 55); do
      printf '[00:%02d.00]%s line %d\n' "$second" "$2" $((second / 5 + 1))
    done > "$folder/$2.lrc"
  fi
}

song "ABBA" "Dancing Queen" "Arrival" lyrics
song "ABBA" "Waterloo" "Waterloo" lyrics
song "Aerosmith" "Dream On" "Aerosmith" lyrics
song "Blondie" "Call Me" "Singles" lyrics
song "Bon Jovi" "Livin' on a Prayer" "Slippery When Wet" lyrics
song "Coldplay" "Yellow" "Parachutes" lyrics
song "Duran Duran" "Rio" "Rio" lyrics
song "Europe" "The Final Countdown" "The Final Countdown" lyrics
song "Journey" "Don't Stop Believin'" "Escape" lyrics
song "Queen" "Bohemian Rhapsody" "A Night at the Opera" lyrics
song "Queen" "Don't Stop Me Now" "Jazz" lyrics
song "Toto" "Africa" "Toto IV" lyrics

# CD+G song with a .cdg next to the audio, no lyrics
song "Zz CDG Artist" "Graphics Song" "CDG Hits" none
cp "$WORK/song.cdg" "$MUSIC/Zz CDG Artist/Graphics Song.cdg"

# Zipped CD+G song; the plugin makes a placeholder for it
song "Zz Zip Artist" "Zipped Song" "Zip Hits" none
mkdir -p "$MUSIC/Zips"
python3 - "$MUSIC" "$WORK/song.cdg" <<'EOF'
import sys, zipfile, os
music, cdg = sys.argv[1], sys.argv[2]
audio = os.path.join(music, "Zz Zip Artist", "Zipped Song.mp3")
with zipfile.ZipFile(os.path.join(music, "Zips", "Zz Zip Artist - Zipped Song.zip"), "w") as z:
    z.write(audio, "Zipped Song.mp3")
    z.write(cdg, "Zipped Song.cdg")
EOF
rm -r "$MUSIC/Zz Zip Artist"

# Neither lyrics nor graphics: hidden from singers by default
song "Zz Plain Band" "No Words" "Instrumentals" none

find "$MUSIC" -type f | sort
