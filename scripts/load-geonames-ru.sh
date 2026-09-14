#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV="$(mktemp /tmp/rohbar-geonames-ru.XXXXXX.csv)"
trap 'rm -f "$CSV"' EXIT

python3 "$ROOT/scripts/import-geonames-ru.py" --output "$CSV"

{
  cat <<'SQL'
BEGIN;
CREATE TEMP TABLE geo_places_stage (LIKE geo_places INCLUDING DEFAULTS);
COPY geo_places_stage (
  geoname_id,name,ascii_name,alternate_names,search_name,
  latitude,longitude,feature_code,admin1_code,admin1_name,
  population,country_code
) FROM STDIN WITH (FORMAT csv, HEADER true);
SQL
  cat "$CSV"
  printf '\\.\n'
  cat <<'SQL'
TRUNCATE geo_places;
INSERT INTO geo_places (
  geoname_id,name,ascii_name,alternate_names,search_name,
  latitude,longitude,feature_code,admin1_code,admin1_name,
  population,country_code
)
SELECT
  geoname_id,name,ascii_name,alternate_names,search_name,
  latitude,longitude,feature_code,admin1_code,admin1_name,
  population,country_code
FROM geo_places_stage;
COMMIT;
ANALYZE geo_places;
SQL
} | docker compose -f "$ROOT/infra/docker-compose.yml" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U rohbar -d rohbar

docker compose -f "$ROOT/infra/docker-compose.yml" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U rohbar -d rohbar -Atc \
  "SELECT 'geo_places=' || count(*) FROM geo_places;"

echo "GeoNames attribution required: https://www.geonames.org/ (CC BY 4.0)"
