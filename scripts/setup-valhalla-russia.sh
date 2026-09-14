#!/usr/bin/env bash
set -euo pipefail

IMAGE="${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla:3.8.3}"
DATA_DIR="${VALHALLA_DATA_DIR:-/opt/rohbar-routing}"
PBF_URL="https://download.geofabrik.de/russia-latest.osm.pbf"
PBF="$DATA_DIR/russia-latest.osm.pbf"
CONFIG="$DATA_DIR/valhalla.json"
TILES="$DATA_DIR/tiles"
EXTRACT="$DATA_DIR/tiles.tar"

mkdir -p "$DATA_DIR" "$TILES"
chmod 0755 "$DATA_DIR"

if [[ ! -s "$PBF" ]]; then
  echo "Downloading current Geofabrik Russia OSM extract..."
  curl --fail --location --retry 5 --retry-delay 5 \
    --connect-timeout 20 --max-time 7200 \
    "$PBF_URL" -o "$PBF.part"
  mv "$PBF.part" "$PBF"
fi

if [[ $(stat -c '%s' "$PBF") -lt 1000000000 ]]; then
  echo "Russia PBF is unexpectedly small" >&2
  exit 1
fi

curl --fail --location --retry 3 --connect-timeout 20 \
  "${PBF_URL}.md5" -o "$DATA_DIR/russia-latest.osm.pbf.md5"
(
  cd "$DATA_DIR"
  expected="$(awk '{print $1}' russia-latest.osm.pbf.md5)"
  actual="$(md5sum russia-latest.osm.pbf | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || { echo "Geofabrik PBF checksum mismatch" >&2; exit 1; }
)

echo "Pulling Valhalla $IMAGE..."
docker pull "$IMAGE"

echo "Generating Valhalla configuration..."
docker run --rm -v "$DATA_DIR:/data" "$IMAGE" \
  valhalla_build_config \
    --mjolnir-tile-dir /data/tiles \
    --mjolnir-tile-extract /data/tiles.tar \
    --mjolnir-admin /data/admin.sqlite \
    --mjolnir-timezone /data/tz_world.sqlite \
    --mjolnir-concurrency 2 > "$CONFIG"

echo "Building administrative restrictions..."
docker run --rm -v "$DATA_DIR:/data" "$IMAGE" \
  valhalla_build_admins -c /data/valhalla.json /data/russia-latest.osm.pbf

echo "Building timezone database..."
docker run --rm -v "$DATA_DIR:/data" "$IMAGE" sh -c \
  'valhalla_build_timezones > /data/tz_world.sqlite'

echo "Building Russia routing graph (2 workers to protect VPS memory)..."
rm -rf "$TILES"
mkdir -p "$TILES"
docker run --rm -v "$DATA_DIR:/data" "$IMAGE" \
  valhalla_build_tiles -c /data/valhalla.json /data/russia-latest.osm.pbf

echo "Packing routing graph..."
rm -f "$EXTRACT"
docker run --rm -v "$DATA_DIR:/data" "$IMAGE" \
  valhalla_build_extract -c /data/valhalla.json -O

[[ -s "$EXTRACT" ]] || { echo "Valhalla tile extract was not created" >&2; exit 1; }

# Runtime uses the indexed extract, so unpacked graph tiles can be removed.
rm -rf "$TILES"
if [[ "${KEEP_PBF:-0}" != "1" ]]; then
  rm -f "$PBF" "$DATA_DIR/russia-latest.osm.pbf.md5"
fi

printf 'Valhalla Russia ready:\n  config: %s\n  tiles:  %s\n' "$CONFIG" "$EXTRACT"
