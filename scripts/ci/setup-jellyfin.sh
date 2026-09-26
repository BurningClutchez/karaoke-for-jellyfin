#!/usr/bin/env bash
# Sets up a freshly started Jellyfin for CI: runs the startup wizard, adds the
# music library, waits for the scan (and the Karaoke CDG plugin's zip
# placeholders), creates an API key and a playlist, and writes .env.local.
#
#   scripts/ci/setup-jellyfin.sh <music path as Jellyfin sees it> [env file]
#
# JELLYFIN_URL defaults to http://localhost:8096. Needs curl and python3.
set -euo pipefail

MUSIC=${1:?usage: setup-jellyfin.sh <music path> [env file]}
ENV_FILE=${2:-.env.local}
URL=${JELLYFIN_URL:-http://localhost:8096}
USER_NAME=admin
PASSWORD=karaoke-ci
CLIENT='MediaBrowser Client="Karaoke CI", Device="ci", DeviceId="karaoke-ci", Version="1.0"'
TOKEN=""

api() { # api METHOD PATH [json body]
  local auth=$CLIENT
  [ -n "$TOKEN" ] && auth="$auth, Token=\"$TOKEN\""
  curl -fsS -X "$1" "$URL$2" -H "Authorization: $auth" \
    -H "Content-Type: application/json" ${3:+-d "$3"}
}
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

echo "Waiting for Jellyfin at $URL"
# While starting, Jellyfin answers 200 with a plain-text "loading" page
for _ in $(seq 1 180); do
  curl -fsS "$URL/System/Info/Public" 2> /dev/null | grep -q '"Version"' && break
  sleep 1
done
curl -fsS "$URL/System/Info/Public" | json '"Jellyfin", d["Version"]'

echo "Startup wizard"
api POST /Startup/Configuration \
  '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}'
api GET /Startup/User > /dev/null
api POST /Startup/User "{\"Name\":\"$USER_NAME\",\"Password\":\"$PASSWORD\"}"
api POST /Startup/Complete

LOGIN=$(api POST /Users/AuthenticateByName \
  "{\"Username\":\"$USER_NAME\",\"Pw\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | json 'd["AccessToken"]')
USER_ID=$(echo "$LOGIN" | json 'd["User"]["Id"]')

echo "Adding the music library ($MUSIC)"
api POST "/Library/VirtualFolders?name=Music&collectionType=music&refreshLibrary=false" \
  "{\"LibraryOptions\":{\"PathInfos\":[{\"Path\":\"$MUSIC\"}]}}"

scan_state() {
  api GET "/ScheduledTasks?isHidden=false" |
    json '[t["State"] for t in d if t["Key"] == "RefreshLibrary"][0]'
}
audio_count() {
  api GET "/Items?Recursive=true&IncludeItemTypes=Audio&Limit=0&userId=$USER_ID" |
    json 'd["TotalRecordCount"]'
}

# The plugin makes zip placeholders (and a Karaoke library) after a scan, so
# scan until the zipped song is in the library too
for pass in 1 2 3 4 5; do
  api POST /Library/Refresh
  sleep 3
  for _ in $(seq 1 120); do [ "$(scan_state)" = Idle ] && break; sleep 2; done
  found=$(api GET "/Items?Recursive=true&IncludeItemTypes=Audio&SearchTerm=Zipped&userId=$USER_ID" |
    json 'd["TotalRecordCount"]')
  echo "Scan $pass: $(audio_count) songs, zipped song found: $found"
  [ "$found" -ge 1 ] && break
  sleep 5
done
[ "$found" -ge 1 ] || { echo "The zipped song never appeared"; exit 1; }

echo "Creating an API key"
api POST "/Auth/Keys?app=karaoke-ci"
API_KEY=$(api GET /Auth/Keys |
  json '[k["AccessToken"] for k in d["Items"] if k["AppName"] == "karaoke-ci"][0]')

echo "Creating a playlist"
SONGS=$(api GET "/Items?Recursive=true&IncludeItemTypes=Audio&Fields=HasLyrics&SortBy=SortName&userId=$USER_ID" |
  json '",".join("\"%s\"" % i["Id"] for i in [i for i in d["Items"] if i.get("HasLyrics")][:5])')
api POST /Playlists \
  "{\"Name\":\"Karaoke Classics\",\"Ids\":[$SONGS],\"UserId\":\"$USER_ID\",\"MediaType\":\"Audio\"}"
echo

cat > "$ENV_FILE" <<EOF
JELLYFIN_SERVER_URL=$URL
JELLYFIN_API_KEY=$API_KEY
JELLYFIN_USERNAME=$USER_NAME
EOF
echo "Wrote $ENV_FILE"
