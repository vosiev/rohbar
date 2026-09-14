use crate::{SharedState, json_error, session_user};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sqlx::FromRow;
use std::{env, sync::OnceLock, time::Duration};

const MAX_ROUTE_BODY_BYTES: usize = 5 * 1024 * 1024;
const MAX_ROUTE_POINTS: usize = 200_000;

#[derive(Deserialize)]
pub(crate) struct GeoSearchQuery {
    q: String,
}

#[derive(Serialize, FromRow)]
struct GeoPlace {
    geoname_id: i64,
    name: String,
    admin1_code: Option<String>,
    feature_code: String,
    population: i64,
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
pub(crate) struct RoutePreviewRequest {
    from_id: i64,
    to_id: i64,
    vehicle_id: Option<String>,
}

#[derive(FromRow)]
struct RoutePoint {
    geoname_id: i64,
    name: String,
    latitude: f64,
    longitude: f64,
}

#[derive(FromRow, Default)]
struct TruckProfile {
    route_weight_kg: Option<i32>,
    route_axle_load_kg: Option<i32>,
    route_height_mm: Option<i32>,
    route_width_mm: Option<i32>,
    route_length_mm: Option<i32>,
}

#[derive(Deserialize)]
struct ValhallaResponse {
    trip: ValhallaTrip,
}

#[derive(Deserialize)]
struct ValhallaTrip {
    summary: ValhallaSummary,
    legs: Vec<ValhallaLeg>,
}

#[derive(Deserialize)]
struct ValhallaSummary {
    length: f64,
    time: f64,
}

#[derive(Deserialize)]
struct ValhallaLeg {
    shape: String,
}

pub(crate) async fn search_places(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<GeoSearchQuery>,
) -> Response {
    if let Err(error) = session_user(&headers, &state).await {
        return error;
    }
    let q = query.q.trim();
    if !(2..=120).contains(&q.chars().count()) {
        return json_error(StatusCode::BAD_REQUEST, "Search query must contain 2 to 120 characters");
    }
    let rows = sqlx::query_as::<_, GeoPlace>(
        r#"
        SELECT geoname_id,name,admin1_code,feature_code,population,latitude,longitude
        FROM geo_places
        WHERE search_name ILIKE '%' || $1 || '%'
        ORDER BY
          CASE
            WHEN lower(name)=lower($1) THEN 0
            WHEN lower(name) LIKE lower($1) || '%' THEN 1
            ELSE 2
          END,
          similarity(search_name,$1) DESC,
          population DESC,
          name ASC
        LIMIT 8
        "#,
    )
    .bind(q)
    .fetch_all(&state.db)
    .await;
    match rows {
        Ok(rows) => (StatusCode::OK, Json(json!({"data": rows}))).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Geocoding index unavailable"),
    }
}

pub(crate) async fn route_preview(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(request): Json<RoutePreviewRequest>,
) -> Response {
    if let Err(error) = session_user(&headers, &state).await {
        return error;
    }
    if request.from_id == request.to_id {
        return json_error(StatusCode::BAD_REQUEST, "Route endpoints must be different");
    }
    let (from, to) = match load_route_points(&state, request.from_id, request.to_id).await {
        Ok(points) => points,
        Err(response) => return response,
    };
    let truck = match load_truck_profile(&state, request.vehicle_id.as_deref()).await {
        Ok(profile) => profile,
        Err(response) => return response,
    };
    let payload = valhalla_payload(&from, &to, &truck);
    let response = match valhalla_client()
        .post(format!("{}/route", valhalla_base_url()))
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(timeout=error.is_timeout(), connect=error.is_connect(), "Valhalla route request failed");
            return json_error(StatusCode::BAD_GATEWAY, "Routing service unavailable");
        }
    };
    let status = response.status();
    if !status.is_success() {
        tracing::warn!(http_status=status.as_u16(), "Valhalla route request rejected");
        return json_error(StatusCode::BAD_GATEWAY, "Route could not be built");
    }
    let bytes = match response.bytes().await {
        Ok(bytes) if bytes.len() <= MAX_ROUTE_BODY_BYTES => bytes,
        Ok(_) => return json_error(StatusCode::BAD_GATEWAY, "Routing response too large"),
        Err(_) => return json_error(StatusCode::BAD_GATEWAY, "Routing response unavailable"),
    };
    let route: ValhallaResponse = match serde_json::from_slice(&bytes) {
        Ok(route) => route,
        Err(_) => return json_error(StatusCode::BAD_GATEWAY, "Invalid routing response"),
    };
    let geometry = match decode_legs(&route.trip.legs) {
        Ok(points) => points,
        Err(_) => return json_error(StatusCode::BAD_GATEWAY, "Invalid route geometry"),
    };
    if !route.trip.summary.length.is_finite()
        || route.trip.summary.length < 0.0
        || !route.trip.summary.time.is_finite()
        || route.trip.summary.time < 0.0
    {
        return json_error(StatusCode::BAD_GATEWAY, "Invalid route summary");
    }
    (StatusCode::OK, Json(json!({
        "data": {
            "from": route_point_json(&from),
            "to": route_point_json(&to),
            "distance_km": route.trip.summary.length,
            "duration_seconds": route.trip.summary.time.round() as i64,
            "geometry": geometry,
            "routing_profile": "truck",
            "truck_profile_applied": has_truck_constraints(&truck),
            "traffic": {"mode": "baseline", "live": false}
        }
    }))).into_response()
}

async fn load_route_points(
    state: &SharedState,
    from_id: i64,
    to_id: i64,
) -> Result<(RoutePoint, RoutePoint), Response> {
    let from = sqlx::query_as::<_, RoutePoint>(
        "SELECT geoname_id,name,latitude,longitude FROM geo_places WHERE geoname_id=$1",
    )
    .bind(from_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Geocoding index unavailable"))?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "Origin not found"))?;
    let to = sqlx::query_as::<_, RoutePoint>(
        "SELECT geoname_id,name,latitude,longitude FROM geo_places WHERE geoname_id=$1",
    )
    .bind(to_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Geocoding index unavailable"))?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "Destination not found"))?;
    Ok((from, to))
}

async fn load_truck_profile(
    state: &SharedState,
    vehicle_id: Option<&str>,
) -> Result<TruckProfile, Response> {
    let Some(vehicle_id) = vehicle_id.map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(TruckProfile::default());
    };
    if vehicle_id.len() > 128 {
        return Err(json_error(StatusCode::BAD_REQUEST, "Invalid vehicle id"));
    }
    sqlx::query_as::<_, TruckProfile>(
        r#"
        SELECT route_weight_kg,route_axle_load_kg,route_height_mm,route_width_mm,route_length_mm
        FROM fleet_vehicles
        WHERE id=$1 AND status<>'maintenance'
        "#,
    )
    .bind(vehicle_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Vehicle routing profile unavailable"))?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "Vehicle not found"))
}

fn valhalla_payload(from: &RoutePoint, to: &RoutePoint, truck: &TruckProfile) -> Value {
    let mut truck_options = Map::new();
    insert_metric_tons(&mut truck_options, "weight", truck.route_weight_kg);
    insert_metric_tons(&mut truck_options, "axle_load", truck.route_axle_load_kg);
    insert_meters(&mut truck_options, "height", truck.route_height_mm);
    insert_meters(&mut truck_options, "width", truck.route_width_mm);
    insert_meters(&mut truck_options, "length", truck.route_length_mm);
    json!({
        "locations": [
            {"lat": from.latitude, "lon": from.longitude, "type": "break"},
            {"lat": to.latitude, "lon": to.longitude, "type": "break"}
        ],
        "costing": "truck",
        "costing_options": {"truck": truck_options},
        "units": "kilometers",
        "directions_type": "none"
    })
}

fn insert_metric_tons(map: &mut Map<String, Value>, key: &str, kg: Option<i32>) {
    if let Some(kg) = kg.filter(|value| *value > 0) {
        map.insert(key.to_string(), json!(f64::from(kg) / 1000.0));
    }
}

fn insert_meters(map: &mut Map<String, Value>, key: &str, mm: Option<i32>) {
    if let Some(mm) = mm.filter(|value| *value > 0) {
        map.insert(key.to_string(), json!(f64::from(mm) / 1000.0));
    }
}

fn has_truck_constraints(profile: &TruckProfile) -> bool {
    profile.route_weight_kg.is_some()
        || profile.route_axle_load_kg.is_some()
        || profile.route_height_mm.is_some()
        || profile.route_width_mm.is_some()
        || profile.route_length_mm.is_some()
}

fn route_point_json(point: &RoutePoint) -> Value {
    json!({
        "id": point.geoname_id,
        "name": point.name,
        "lat": point.latitude,
        "lon": point.longitude
    })
}

fn valhalla_base_url() -> String {
    env::var("VALHALLA_URL")
        .ok()
        .map(|value| value.trim_end_matches('/').to_string())
        .filter(|value| value.starts_with("http://") || value.starts_with("https://"))
        .unwrap_or_else(|| "http://valhalla:8002".to_string())
}

fn valhalla_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Valhalla HTTP client")
    })
}

fn decode_legs(legs: &[ValhallaLeg]) -> Result<Vec<[f64; 2]>, ()> {
    let mut output = Vec::new();
    for leg in legs {
        let points = decode_polyline6(&leg.shape)?;
        for (index, point) in points.into_iter().enumerate() {
            if index == 0 && output.last() == Some(&point) {
                continue;
            }
            if output.len() >= MAX_ROUTE_POINTS {
                return Err(());
            }
            output.push(point);
        }
    }
    if output.len() < 2 {
        return Err(());
    }
    Ok(output)
}

fn decode_polyline6(encoded: &str) -> Result<Vec<[f64; 2]>, ()> {
    let bytes = encoded.as_bytes();
    let mut index = 0usize;
    let mut lat = 0i64;
    let mut lon = 0i64;
    let mut points = Vec::new();
    while index < bytes.len() {
        lat = lat.checked_add(decode_component(bytes, &mut index)?).ok_or(())?;
        lon = lon.checked_add(decode_component(bytes, &mut index)?).ok_or(())?;
        let latitude = lat as f64 / 1_000_000.0;
        let longitude = lon as f64 / 1_000_000.0;
        if !latitude.is_finite()
            || !longitude.is_finite()
            || latitude.abs() > 90.0
            || longitude.abs() > 180.0
        {
            return Err(());
        }
        points.push([longitude, latitude]);
        if points.len() > MAX_ROUTE_POINTS {
            return Err(());
        }
    }
    Ok(points)
}

fn decode_component(bytes: &[u8], index: &mut usize) -> Result<i64, ()> {
    let mut result = 0u64;
    let mut shift = 0u32;
    loop {
        let byte = *bytes.get(*index)?.checked_sub(63)?;
        *index += 1;
        if byte > 0x3f || shift > 60 {
            return Err(());
        }
        result |= u64::from(byte & 0x1f) << shift;
        if byte < 0x20 {
            break;
        }
        shift += 5;
    }
    let value = (result >> 1) as i64;
    Ok(if result & 1 == 1 { !value } else { value })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truck_payload_uses_only_explicit_road_profile() {
        let from = RoutePoint { geoname_id: 1, name: "A".into(), latitude: 55.75, longitude: 37.62 };
        let to = RoutePoint { geoname_id: 2, name: "B".into(), latitude: 55.79, longitude: 49.12 };
        let profile = TruckProfile {
            route_weight_kg: Some(18_500),
            route_axle_load_kg: Some(7_500),
            route_height_mm: Some(3_850),
            route_width_mm: Some(2_550),
            route_length_mm: Some(12_000),
        };
        let value = valhalla_payload(&from, &to, &profile);
        assert_eq!(value["costing"], "truck");
        assert_eq!(value["costing_options"]["truck"]["weight"], 18.5);
        assert_eq!(value["costing_options"]["truck"]["axle_load"], 7.5);
        assert_eq!(value["costing_options"]["truck"]["height"], 3.85);
        assert_eq!(value["costing_options"]["truck"]["width"], 2.55);
        assert_eq!(value["costing_options"]["truck"]["length"], 12.0);
    }

    #[test]
    fn truck_payload_omits_unknown_constraints() {
        let from = RoutePoint { geoname_id: 1, name: "A".into(), latitude: 55.75, longitude: 37.62 };
        let to = RoutePoint { geoname_id: 2, name: "B".into(), latitude: 59.93, longitude: 30.31 };
        let value = valhalla_payload(&from, &to, &TruckProfile::default());
        assert_eq!(value["costing_options"]["truck"], json!({}));
    }

    #[test]
    fn polyline6_decodes_and_rejects_malformed_data() {
        let encoded = encode_polyline6(&[[37.6173, 55.7558], [37.6208, 55.7522], [37.6300, 55.7600]]);
        let decoded = decode_polyline6(&encoded).unwrap();
        assert_eq!(decoded.len(), 3);
        for (actual, expected) in decoded.iter().zip([[37.6173, 55.7558], [37.6208, 55.7522], [37.6300, 55.7600]]) {
            assert!((actual[0] - expected[0]).abs() < 0.000001);
            assert!((actual[1] - expected[1]).abs() < 0.000001);
        }
        assert!(decode_polyline6("~").is_err());
    }

    fn encode_polyline6(points: &[[f64; 2]]) -> String {
        let mut output = String::new();
        let mut last_lat = 0i64;
        let mut last_lon = 0i64;
        for [lon, lat] in points {
            let lat = (lat * 1_000_000.0).round() as i64;
            let lon = (lon * 1_000_000.0).round() as i64;
            encode_component(lat - last_lat, &mut output);
            encode_component(lon - last_lon, &mut output);
            last_lat = lat;
            last_lon = lon;
        }
        output
    }

    fn encode_component(value: i64, output: &mut String) {
        let mut value = if value < 0 { (!(value << 1)) as u64 } else { (value << 1) as u64 };
        while value >= 0x20 {
            output.push(char::from_u32(((0x20 | (value & 0x1f)) + 63) as u32).unwrap());
            value >>= 5;
        }
        output.push(char::from_u32((value + 63) as u32).unwrap());
    }
}
