CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE geo_places (
    geoname_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    ascii_name TEXT NOT NULL DEFAULT '',
    alternate_names TEXT NOT NULL DEFAULT '',
    search_name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    feature_code TEXT NOT NULL,
    admin1_code TEXT,
    population BIGINT NOT NULL DEFAULT 0 CHECK (population >= 0),
    country_code TEXT NOT NULL DEFAULT 'RU' CHECK (country_code = 'RU'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX geo_places_search_trgm_idx
    ON geo_places USING GIN (search_name gin_trgm_ops);
CREATE INDEX geo_places_population_idx
    ON geo_places (population DESC);

ALTER TABLE fleet_vehicles
    ADD COLUMN route_weight_kg INTEGER CHECK (route_weight_kg > 0),
    ADD COLUMN route_axle_load_kg INTEGER CHECK (route_axle_load_kg > 0),
    ADD COLUMN route_height_mm INTEGER CHECK (route_height_mm > 0),
    ADD COLUMN route_width_mm INTEGER CHECK (route_width_mm > 0),
    ADD COLUMN route_length_mm INTEGER CHECK (route_length_mm > 0),
    ADD COLUMN route_has_trailer BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN fleet_vehicles.route_weight_kg IS
    'Actual/gross routing weight. Never derive from cargo capacity.';
COMMENT ON COLUMN fleet_vehicles.route_axle_load_kg IS
    'Actual axle load for road restrictions.';
COMMENT ON COLUMN fleet_vehicles.route_height_mm IS
    'External vehicle height for road restrictions.';
COMMENT ON COLUMN fleet_vehicles.route_width_mm IS
    'External vehicle width for road restrictions.';
COMMENT ON COLUMN fleet_vehicles.route_length_mm IS
    'External vehicle length for road restrictions.';
