# RohBar free routing stack

RohBar routing must remain usable without paid map, geocoding, routing or traffic APIs.

## Production data path

1. **Basemap:** Yandex Tiles API only. The free Tiles terms allow commercial and non-commercial use in open and closed systems up to the documented RPS limit. RohBar overlays only its own route data and must display the official clickable Yandex logo.
2. **Locality search:** GeoNames Russia (`RU.zip` + `admin1CodesASCII.txt`), imported into PostgreSQL `geo_places`. GeoNames attribution is required under CC BY 4.0.
3. **Road graph:** current Russia OpenStreetMap extract from Geofabrik.
4. **Truck routing:** self-hosted Valhalla. No route request is sent to Yandex or another paid routing provider.
5. **Traffic:** baseline road speeds until RohBar has enough first-party telemetry. Never present synthetic or guessed congestion as live traffic.

## Truck restrictions

Valhalla receives only explicit external vehicle constraints from the fleet routing profile:

- `route_weight_kg`: actual/gross routing weight;
- `route_axle_load_kg`: actual axle load;
- `route_height_mm`: external vehicle height;
- `route_width_mm`: external vehicle width;
- `route_length_mm`: external vehicle length.

Cargo payload, cargo capacity and internal body dimensions are not substitutes for these values. Missing values are omitted from Valhalla so RohBar never invents a truck specification.

Valhalla truck routing uses OpenStreetMap road access and restriction data such as maximum height, width, length, weight and axle load. The default route objective is Valhalla's truck dynamic costing rather than naive geometric shortest distance.

## Traffic roadmap

Traffic becomes live only after RohBar owns a sufficient data stream. The intended pipeline is:

1. collect driver location/speed only during an active shipment and only after explicit product consent;
2. map-match points to Valhalla/OSM edges;
3. reject impossible speeds, low-accuracy fixes and duplicate samples;
4. aggregate per-edge speed by short live windows and historical time-of-week buckets;
5. use sample count, age and variance to calculate confidence;
6. blend live speed with historical speed only above minimum confidence;
7. accept operator incidents/closures as a separate, auditable source;
8. expose `live`, `historical` or `baseline` mode to users instead of pretending all ETAs are equally fresh.

Raw location retention, aggregation windows and deletion policy must be defined before telemetry collection is enabled.

## Data refresh

- GeoNames: refresh periodically with `scripts/load-geonames-ru.sh`.
- OSM/Valhalla: rebuild from the current Geofabrik Russia extract with `scripts/setup-valhalla-russia.sh` during a maintenance window, then restart only the Valhalla service.
- Keep the previous `tiles.tar` until the new graph passes route smoke tests so a graph update can be rolled back independently from the RohBar application.

## Operational boundaries

The API must degrade cleanly when Valhalla is unavailable: shipment creation remains functional and route preview returns a bounded service error. Valhalla is not exposed publicly; only the RohBar API calls it on the internal Docker network.

The Yandex Tiles key is a browser-visible map key and must be restricted to RohBar domains in the Yandex developer dashboard. No paid Yandex Router, Geocoder, Search, Geosuggest or traffic API is required by this architecture.
