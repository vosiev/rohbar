mod telegram;

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use axum::{
    Json, Router,
    extract::ws::{Message, WebSocket},
    extract::{Path, Query, State, WebSocketUpgrade},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool, Row, postgres::PgPoolOptions};
use std::{env, sync::Arc};
use tokio::sync::broadcast;
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};
use uuid::Uuid;

pub type SharedState = Arc<AppState>;

pub struct AppState {
    pub db: PgPool,
    pub redis: redis::Client,
    pub realtime: broadcast::Sender<RealtimeMessage>,
    pub telegram_token: Option<String>,
    pub telegram_webhook_secret: Option<String>,
    pub session_cookie_secure: bool,
    pub frontend_origin: String,
    pub automation_secret: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct RealtimeMessage {
    r#type: String,
    shipment: Option<Shipment>,
    event: Option<ShipmentEvent>,
    notification: Option<Value>,
}

#[derive(Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    id: Uuid,
    email: String,
    name: String,
    role: String,
    phone: Option<String>,
    telegram_id: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize, FromRow)]
pub struct Shipment {
    id: String,
    #[serde(rename = "from")]
    from_city: String,
    #[serde(rename = "to")]
    to_city: String,
    date: String,
    cargo: String,
    weight: String,
    weight_kg: Option<i32>,
    volume_liters: Option<i32>,
    volume_estimated: bool,
    requested_body_code: Option<String>,
    vehicle: String,
    selected_vehicle_id: Option<String>,
    selected_carrier_id: Option<Uuid>,
    price: String,
    status: String,
    company: String,
}

#[derive(Clone, Serialize, Deserialize, FromRow)]
pub struct ShipmentEvent {
    id: Uuid,
    shipment_id: String,
    event: String,
    actor_id: Uuid,
    payload: Value,
    occurred_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
pub struct Offer {
    id: String,
    shipment_id: String,
    carrier_id: Uuid,
    carrier_name: String,
    vehicle: String,
    vehicle_id: Option<String>,
    price: String,
    eta: String,
    status: String,
}

#[derive(Serialize, FromRow)]
pub struct FleetVehicle {
    id: String,
    owner_id: Uuid,
    owner_name: String,
    plate: String,
    model: String,
    body: String,
    body_code: Option<String>,
    capacity: String,
    capacity_kg: Option<i32>,
    volume: String,
    volume_liters: Option<i32>,
    length_mm: Option<i32>,
    width_mm: Option<i32>,
    height_mm: Option<i32>,
    year: Option<i16>,
    photo_url: Option<String>,
    status: String,
    driver_name: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct DriverAssignment {
    shipment_id: String,
    driver_id: Uuid,
    driver_name: String,
    phone: Option<String>,
    vehicle_id: Option<String>,
    vehicle_plate: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    email: String,
    password: String,
}
#[derive(Deserialize)]
pub struct RegisterRequest {
    name: String,
    email: String,
    password: String,
    role: String,
    phone: Option<String>,
}
#[derive(Deserialize)]
pub struct TelegramAuth {
    init_data: String,
}
#[derive(Deserialize)]
pub struct StatusRequest {
    status: String,
}
#[derive(Deserialize)]
pub struct OfferRequest {
    price: String,
    eta: String,
    vehicle_id: String,
}
#[derive(Deserialize)]
pub struct DriverRequest {
    driver_id: Uuid,
    vehicle_id: Option<String>,
}
#[derive(Deserialize)]
pub struct EventRequest {
    event: String,
    aggregate_id: String,
    payload: Value,
}
#[derive(Deserialize)]
pub struct FleetRequest {
    owner_email: Option<String>,
    plate: String,
    model: String,
    body: String,
    body_code: String,
    capacity_kg: i32,
    volume_liters: i32,
    length_mm: Option<i32>,
    width_mm: Option<i32>,
    height_mm: Option<i32>,
    year: Option<i16>,
    photo_url: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateShipmentRequest {
    #[serde(rename = "from")]
    from_city: String,
    #[serde(rename = "to")]
    to_city: String,
    date: String,
    cargo: String,
    weight_kg: i32,
    volume_liters: Option<i32>,
    #[serde(default)]
    volume_estimated: bool,
    body_code: Option<String>,
    selected_vehicle_id: Option<String>,
    price: String,
}

#[derive(Deserialize)]
pub struct ProfileUpdateRequest {
    name: String,
    email: String,
    phone: Option<String>,
    current_password: Option<String>,
}

#[derive(Deserialize)]
pub struct PasswordUpdateRequest {
    current_password: String,
    new_password: String,
}

#[derive(Deserialize)]
pub struct DriverTeamRequest {
    email: String,
}

#[derive(Serialize, FromRow)]
pub struct TeamDriver {
    id: Uuid,
    name: String,
    email: String,
    phone: Option<String>,
    busy: bool,
    current_shipment_id: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct AvailableVehicleQuery {
    weight_kg: Option<i32>,
    volume_liters: Option<i32>,
    body_code: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct AvailableVehicle {
    id: String,
    carrier_id: Uuid,
    carrier_name: String,
    plate: String,
    model: String,
    body: String,
    body_code: Option<String>,
    capacity_kg: i32,
    volume_liters: Option<i32>,
    length_mm: Option<i32>,
    width_mm: Option<i32>,
    height_mm: Option<i32>,
    year: Option<i16>,
    photo_url: Option<String>,
    status: String,
    reserved_weight_kg: i64,
    reserved_volume_liters: i64,
    remaining_weight_kg: i64,
    remaining_volume_liters: Option<i64>,
    pending_reservations: i64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let redis_url = env::var("REDIS_URL").expect("REDIS_URL is required");
    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await
        .expect("database connection failed");
    sqlx::migrate!()
        .run(&db)
        .await
        .expect("database migration failed");
    ensure_bootstrap_admin(&db)
        .await
        .expect("admin bootstrap failed");
    let redis = redis::Client::open(redis_url).expect("redis configuration failed");
    let origin_text =
        env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "https://rohbar.vosiev.com".into());
    let origin = origin_text
        .parse::<HeaderValue>()
        .expect("invalid FRONTEND_ORIGIN");
    let (tx, _) = broadcast::channel(512);
    let state = Arc::new(AppState {
        db,
        redis,
        realtime: tx,
        telegram_token: env::var("TELEGRAM_BOT_TOKEN")
            .ok()
            .filter(|v| !v.is_empty()),
        telegram_webhook_secret: env::var("TELEGRAM_WEBHOOK_SECRET")
            .ok()
            .filter(|v| !v.is_empty()),
        session_cookie_secure: env::var("SESSION_COOKIE_SECURE")
            .map(|v| v != "false")
            .unwrap_or(true),
        frontend_origin: origin_text,
        automation_secret: env::var("AUTOMATION_SECRET").ok().filter(|v| !v.is_empty()),
    });
    let cors = CorsLayer::new()
        .allow_origin(origin)
        .allow_credentials(true)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::COOKIE,
            header::AUTHORIZATION,
            HeaderName::from_static("idempotency-key"),
        ]);
    let app = Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/about", get(about))
        .route("/api/v1/auth/me", get(auth_me))
        .route("/api/v1/auth/login", post(auth_login))
        .route("/api/v1/auth/register", post(auth_register))
        .route("/api/v1/auth/logout", post(auth_logout))
        .route("/api/v1/auth/telegram", post(auth_telegram))
        .route("/api/v1/profile", post(update_profile))
        .route("/api/v1/profile/password", post(update_password))
        .route(
            "/api/v1/shipments",
            get(list_shipments).post(create_shipment),
        )
        .route("/api/v1/shipments/{id}", get(get_shipment))
        .route("/api/v1/shipments/{id}/status", post(change_status))
        .route("/api/v1/shipments/{id}/cancel", post(cancel_shipment))
        .route("/api/v1/shipments/{id}/events", get(shipment_events))
        .route("/api/v1/shipments/{id}/stream", get(shipment_stream))
        .route("/api/v1/ws", get(websocket))
        .route(
            "/api/v1/shipments/{id}/offers",
            get(list_offers).post(create_offer),
        )
        .route("/api/v1/offers/{id}/accept", post(accept_offer))
        .route("/api/v1/fleet", get(list_fleet).post(create_fleet))
        .route("/api/v1/fleet/available", get(list_available_vehicles))
        .route("/api/v1/fleet/{id}/update", post(update_fleet_vehicle))
        .route(
            "/api/v1/drivers/team",
            get(list_team_drivers).post(add_team_driver),
        )
        .route("/api/v1/drivers/team/{id}/remove", post(remove_team_driver))
        .route("/api/v1/drivers/assignments", get(list_assignments))
        .route("/api/v1/shipments/{id}/driver", post(assign_driver))
        .route("/api/v1/notifications", get(notifications))
        .route("/api/v1/notifications/{id}/read", post(read_notification))
        .route(
            "/api/v1/notifications/read-all",
            post(read_all_notifications),
        )
        .route("/api/v1/events", post(dispatch_event))
        .route("/api/v1/telegram/webhook", post(telegram::webhook))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind failed");
    info!(%addr, "RohBar API started");
    axum::serve(listener, app).await.expect("server failed");
}

async fn ensure_bootstrap_admin(db: &PgPool) -> Result<(), String> {
    let email = match env::var("ADMIN_EMAIL") {
        Ok(value) if !value.trim().is_empty() => value.trim().to_ascii_lowercase(),
        _ => return Ok(()),
    };
    let password = match env::var("ADMIN_PASSWORD") {
        Ok(value) if !value.is_empty() => value,
        _ => return Err("ADMIN_PASSWORD is required when ADMIN_EMAIL is configured".into()),
    };
    let password_length = password.chars().count();
    if !(15..=128).contains(&password_length) {
        return Err("ADMIN_PASSWORD must contain 15 to 128 characters".into());
    }
    if let Some((_, role)) =
        sqlx::query_as::<_, (Uuid, String)>("SELECT id,role FROM users WHERE email=$1")
            .bind(&email)
            .fetch_optional(db)
            .await
            .map_err(|_| "unable to check bootstrap admin".to_string())?
    {
        if role != "admin" {
            return Err("ADMIN_EMAIL belongs to a non-admin user".into());
        }
        return Ok(());
    }
    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| "unable to hash admin password".to_string())?
        .to_string();
    let result = sqlx::query("INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,'admin') ON CONFLICT(email) DO NOTHING").bind(Uuid::new_v4()).bind(&email).bind("RohBar Administrator").bind(hash).execute(db).await.map_err(|_| "unable to create bootstrap admin".to_string())?;
    if result.rows_affected() == 1 {
        info!(%email, "bootstrap admin created");
    }
    Ok(())
}

async fn health(State(state): State<SharedState>) -> Json<Value> {
    let database = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();
    let redis = match state.redis.get_multiplexed_async_connection().await {
        Ok(mut connection) => connection.ping::<String>().await.is_ok(),
        Err(_) => false,
    };
    Json(
        json!({ "data": { "status": if database && redis { "ok" } else { "degraded" }, "database": database, "redis": redis } }),
    )
}

async fn about(State(state): State<SharedState>) -> Json<Value> {
    Json(
        json!({ "data": { "name": "RohBar", "version": env!("CARGO_PKG_VERSION"), "frontend_origin": state.frontend_origin, "realtime": ["websocket", "sse"], "telegram": state.telegram_token.is_some() } }),
    )
}
fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(json!({ "error": { "code": status.as_u16().to_string(), "message": message } })),
    )
        .into_response()
}
fn normalized_email(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}
fn valid_registration_role(role: &str) -> bool {
    matches!(role, "customer" | "carrier" | "driver")
}
fn valid_body_code(value: &str) -> bool {
    matches!(
        value,
        "curtain" | "box" | "reefer" | "isotherm" | "flatbed" | "lowbed" | "container" | "van"
    )
}
fn body_label(value: &str) -> &'static str {
    match value {
        "curtain" => "Тент / штора",
        "box" => "Фургон",
        "reefer" => "Рефрижератор",
        "isotherm" => "Изотерм",
        "flatbed" => "Бортовой",
        "lowbed" => "Трал",
        "container" => "Контейнеровоз",
        "van" => "Малотоннажный фургон",
        _ => "Любой подходящий автомобиль",
    }
}
fn valid_vehicle_status(value: &str) -> bool {
    matches!(value, "available" | "assigned" | "maintenance")
}
fn format_weight(weight_kg: i32) -> String {
    if weight_kg % 1000 == 0 {
        format!("{} т", weight_kg / 1000)
    } else {
        format!("{weight_kg} кг")
    }
}
fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
fn valid_photo_url(value: Option<&str>) -> bool {
    value.is_none_or(|url| url.len() <= 2048 && url.starts_with("https://"))
}
async fn verify_user_password(db: &PgPool, user_id: Uuid, password: &str) -> bool {
    let hash = match sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id=$1")
        .bind(user_id)
        .fetch_optional(db)
        .await
    {
        Ok(Some(hash)) => hash,
        _ => return false,
    };
    let password_hash = match PasswordHash::new(&hash) {
        Ok(hash) => hash,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &password_hash)
        .is_ok()
}
fn has_role(user: &User, roles: &[&str]) -> bool {
    roles.iter().any(|role| *role == user.role)
}
// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.
#[allow(clippy::result_large_err)]
async fn require_role(
    headers: &HeaderMap,
    state: &SharedState,
    roles: &[&str],
) -> Result<User, Response> {
    let user = session_user(headers, state).await?;
    if has_role(&user, roles) {
        Ok(user)
    } else {
        Err(json_error(
            StatusCode::FORBIDDEN,
            "Insufficient permissions",
        ))
    }
}

async fn can_access_shipment(
    state: &SharedState,
    user: &User,
    shipment_id: &str,
    allow_carrier_marketplace: bool,
) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM shipments s WHERE s.id=$1 AND (s.customer_id=$2 OR $3='admin' OR ($3='driver' AND EXISTS(SELECT 1 FROM driver_assignments da WHERE da.shipment_id=s.id AND da.driver_id=$2)) OR ($3='carrier' AND (($4 AND s.status IN ('published','offered') AND (s.selected_carrier_id IS NULL OR s.selected_carrier_id=$2)) OR s.selected_carrier_id=$2 OR EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=s.id AND o.carrier_id=$2 AND o.status='accepted')))))",
    )
    .bind(shipment_id)
    .bind(user.id)
    .bind(&user.role)
    .bind(allow_carrier_marketplace)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false)
}

// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.
#[allow(clippy::result_large_err)]
async fn session_user(headers: &HeaderMap, state: &SharedState) -> Result<User, Response> {
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let sid = cookie
        .split(';')
        .find_map(|p| p.trim().strip_prefix("rohbar_session="))
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "Authentication required"))?;
    let mut conn = state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Redis unavailable"))?;
    let uid: String = conn
        .get(format!("rohbar:session:{sid}"))
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "Invalid session"))?;
    let user_id = Uuid::parse_str(&uid)
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "Invalid session"))?;
    sqlx::query_as::<_, User>("SELECT id,email,name,role,phone,telegram_id FROM users WHERE id=$1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "Invalid session"))
}

async fn auth_me(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    match session_user(&headers, &state).await {
        Ok(user) => (StatusCode::OK, Json(json!({ "data": user }))).into_response(),
        Err(error) => error,
    }
}
fn session_cookie(sid: &str, secure: bool) -> HeaderValue {
    let value = format!(
        "rohbar_session={sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800{}",
        if secure { "; Secure" } else { "" }
    );
    HeaderValue::from_str(&value).expect("cookie")
}
fn expired_session_cookie(secure: bool) -> HeaderValue {
    let value = format!(
        "rohbar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{}",
        if secure { "; Secure" } else { "" }
    );
    HeaderValue::from_str(&value).expect("cookie")
}
// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.
#[allow(clippy::result_large_err)]
pub(crate) async fn create_session(
    state: &SharedState,
    user_id: Uuid,
) -> Result<HeaderValue, Response> {
    let sid = Uuid::new_v4().to_string();
    let mut conn = state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Redis unavailable"))?;
    let _: () = conn
        .set_ex(
            format!("rohbar:session:{sid}"),
            user_id.to_string(),
            604_800,
        )
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Session storage failed"))?;
    Ok(session_cookie(&sid, state.session_cookie_secure))
}

async fn auth_login(State(state): State<SharedState>, Json(req): Json<LoginRequest>) -> Response {
    let email = normalized_email(&req.email);
    if email.is_empty() || req.password.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "Email and password are required");
    }
    let row = sqlx::query_as::<_, (Uuid, String, String, String, String, Option<String>)>(
        "SELECT id,email,name,role,password_hash,phone FROM users WHERE email=$1",
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await;
    if let Ok(Some((id, email, name, role, hash, phone))) = row {
        let password_hash = match PasswordHash::new(&hash) {
            Ok(hash) => hash,
            Err(_) => return json_error(StatusCode::UNAUTHORIZED, "Invalid credentials"),
        };
        if Argon2::default()
            .verify_password(req.password.as_bytes(), &password_hash)
            .is_ok()
        {
            return match create_session(&state, id).await {
                Ok(cookie) => {
                    let mut response = (StatusCode::OK, Json(json!({ "data": { "id": id, "email": email, "name": name, "role": role, "phone": phone } }))).into_response();
                    response.headers_mut().insert(header::SET_COOKIE, cookie);
                    response
                }
                Err(error) => error,
            };
        }
    }
    json_error(StatusCode::UNAUTHORIZED, "Invalid credentials")
}

async fn auth_register(
    State(state): State<SharedState>,
    Json(req): Json<RegisterRequest>,
) -> Response {
    let name = req.name.trim();
    let email = normalized_email(&req.email);
    let role = req.role.trim();
    let phone = req
        .phone
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if name.chars().count() < 2 || name.chars().count() > 120 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Name must contain 2 to 120 characters",
        );
    }
    if !email.contains('@') || email.len() > 254 {
        return json_error(StatusCode::BAD_REQUEST, "Valid email is required");
    }
    let password_length = req.password.chars().count();
    if !(15..=128).contains(&password_length) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Password must contain 15 to 128 characters",
        );
    }
    if !valid_registration_role(role) {
        return json_error(StatusCode::BAD_REQUEST, "Invalid registration role");
    }
    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = match Argon2::default().hash_password(req.password.as_bytes(), &salt) {
        Ok(hash) => hash.to_string(),
        Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"),
    };
    let id = Uuid::new_v4();
    let row = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>)>("INSERT INTO users(id,name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,name,role,phone").bind(id).bind(name).bind(&email).bind(hash).bind(role).bind(phone).fetch_one(&state.db).await;
    match row {
        Ok((id, email, name, role, phone)) => match create_session(&state, id).await {
            Ok(cookie) => {
                let mut response = (StatusCode::CREATED, Json(json!({ "data": { "id": id, "email": email, "name": name, "role": role, "phone": phone } }))).into_response();
                response.headers_mut().insert(header::SET_COOKIE, cookie);
                response
            }
            Err(error) => error,
        },
        Err(error) => {
            if error
                .as_database_error()
                .is_some_and(|db_error| db_error.is_unique_violation())
            {
                json_error(StatusCode::CONFLICT, "Unable to create account")
            } else {
                error!(%error, "registration database error");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to create account",
                )
            }
        }
    }
}

async fn auth_logout(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    if let Some(cookie) = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.split(';')
                .find_map(|p| p.trim().strip_prefix("rohbar_session="))
        })
        && let Ok(mut connection) = state.redis.get_multiplexed_async_connection().await
    {
        let _: Result<(), _> = connection.del(format!("rohbar:session:{cookie}")).await;
    }
    let mut response = (StatusCode::OK, Json(json!({ "data": { "ok": true } }))).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        expired_session_cookie(state.session_cookie_secure),
    );
    response
}
async fn auth_telegram(
    State(state): State<SharedState>,
    Json(req): Json<TelegramAuth>,
) -> Response {
    match telegram::authenticate(&state, req.init_data).await {
        Ok((user, cookie)) => {
            let mut response = (StatusCode::OK, Json(json!({ "data": user }))).into_response();
            response.headers_mut().insert(header::SET_COOKIE, cookie);
            response
        }
        Err(error) => error,
    }
}

async fn update_profile(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<ProfileUpdateRequest>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let name = req.name.trim();
    let email = normalized_email(&req.email);
    let phone = clean_optional(req.phone.as_deref());

    if !(2..=120).contains(&name.chars().count()) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Name must contain 2 to 120 characters",
        );
    }
    if !email.contains('@') || email.len() > 254 {
        return json_error(StatusCode::BAD_REQUEST, "Valid email is required");
    }
    if phone
        .as_deref()
        .is_some_and(|value| value.chars().count() > 32)
    {
        return json_error(StatusCode::BAD_REQUEST, "Phone number is too long");
    }
    if email != user.email {
        let Some(current_password) = req.current_password.as_deref() else {
            return json_error(
                StatusCode::BAD_REQUEST,
                "Current password is required to change email",
            );
        };
        if !verify_user_password(&state.db, user.id, current_password).await {
            return json_error(StatusCode::UNAUTHORIZED, "Current password is incorrect");
        }
    }

    let result = sqlx::query_as::<_, User>(
        "UPDATE users SET name=$1,email=$2,phone=$3,updated_at=NOW() WHERE id=$4 RETURNING id,email,name,role,phone,telegram_id",
    )
    .bind(name)
    .bind(email)
    .bind(phone)
    .bind(user.id)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(user) => (StatusCode::OK, Json(json!({ "data": user }))).into_response(),
        Err(error)
            if error
                .as_database_error()
                .is_some_and(|db| db.is_unique_violation()) =>
        {
            json_error(StatusCode::CONFLICT, "Email is already in use")
        }
        Err(error) => {
            error!(%error, "profile update failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to update profile",
            )
        }
    }
}

async fn update_password(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<PasswordUpdateRequest>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let new_length = req.new_password.chars().count();
    if !(15..=128).contains(&new_length) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "New password must contain 15 to 128 characters",
        );
    }
    if req.current_password == req.new_password {
        return json_error(StatusCode::BAD_REQUEST, "New password must be different");
    }
    if !verify_user_password(&state.db, user.id, &req.current_password).await {
        return json_error(StatusCode::UNAUTHORIZED, "Current password is incorrect");
    }

    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = match Argon2::default().hash_password(req.new_password.as_bytes(), &salt) {
        Ok(hash) => hash.to_string(),
        Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"),
    };
    match sqlx::query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2")
        .bind(hash)
        .bind(user.id)
        .execute(&state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "data": { "ok": true } }))).into_response(),
        Err(error) => {
            error!(%error, "password update failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to update password",
            )
        }
    }
}

async fn list_shipments(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let result = match user.role.as_str() {
        "customer" => sqlx::query_as::<_, Shipment>(
            "SELECT id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company FROM shipments WHERE customer_id=$1 ORDER BY created_at DESC",
        )
        .bind(user.id)
        .fetch_all(&state.db)
        .await,
        "driver" => sqlx::query_as::<_, Shipment>(
            "SELECT s.id,s.from_city,s.to_city,s.date,s.cargo,s.weight,s.weight_kg,s.volume_liters,s.volume_estimated,s.requested_body_code,s.vehicle,s.selected_vehicle_id,s.selected_carrier_id,s.price,s.status,s.company FROM shipments s INNER JOIN driver_assignments da ON da.shipment_id=s.id WHERE da.driver_id=$1 ORDER BY s.created_at DESC",
        )
        .bind(user.id)
        .fetch_all(&state.db)
        .await,
        "carrier" => sqlx::query_as::<_, Shipment>(
            "SELECT s.id,s.from_city,s.to_city,s.date,s.cargo,s.weight,s.weight_kg,s.volume_liters,s.volume_estimated,s.requested_body_code,s.vehicle,s.selected_vehicle_id,s.selected_carrier_id,s.price,s.status,s.company FROM shipments s WHERE (s.status IN ('published','offered') AND (s.selected_carrier_id IS NULL OR s.selected_carrier_id=$1)) OR s.selected_carrier_id=$1 OR EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=s.id AND o.carrier_id=$1 AND o.status='accepted') ORDER BY s.created_at DESC",
        )
        .bind(user.id)
        .fetch_all(&state.db)
        .await,
        "admin" => sqlx::query_as::<_, Shipment>(
            "SELECT id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company FROM shipments ORDER BY created_at DESC",
        )
        .fetch_all(&state.db)
        .await,
        _ => return json_error(StatusCode::FORBIDDEN, "Invalid user role"),
    };
    match result {
        Ok(shipments) => (StatusCode::OK, Json(json!({ "data": shipments }))).into_response(),
        Err(error) => {
            error!(%error, "shipment list failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        }
    }
}

async fn get_shipment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    if !can_access_shipment(&state, &user, &id, true).await {
        return json_error(StatusCode::NOT_FOUND, "Shipment not found");
    }
    let result = sqlx::query_as::<_, Shipment>(
        "SELECT id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company FROM shipments WHERE id=$1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;
    match result {
        Ok(Some(shipment)) => (StatusCode::OK, Json(json!({ "data": shipment }))).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "Shipment not found"),
        Err(error) => {
            error!(%error, "shipment load failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        }
    }
}

async fn create_shipment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<CreateShipmentRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["customer", "admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };

    let from_city = req.from_city.trim();
    let to_city = req.to_city.trim();
    let cargo = req.cargo.trim();
    let date = req.date.trim();
    let price = req.price.trim();
    if from_city.is_empty()
        || to_city.is_empty()
        || cargo.is_empty()
        || date.is_empty()
        || price.is_empty()
    {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Route, cargo, date and price are required",
        );
    }
    if from_city.eq_ignore_ascii_case(to_city) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Origin and destination must be different",
        );
    }
    if !(1..=500_000).contains(&req.weight_kg) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Cargo weight must be between 1 and 500000 kg",
        );
    }
    if req
        .volume_liters
        .is_some_and(|value| !(1..=2_000_000).contains(&value))
    {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Cargo volume is outside the supported range",
        );
    }

    let body_code = clean_optional(req.body_code.as_deref());
    if body_code
        .as_deref()
        .is_some_and(|value| !valid_body_code(value))
    {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Invalid requested vehicle body type",
        );
    }
    let selected_vehicle_id = clean_optional(req.selected_vehicle_id.as_deref());
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(error) => {
            error!(%error, "shipment transaction start failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to create shipment",
            );
        }
    };

    let mut selected_carrier_id = None;
    let mut vehicle_label = body_code
        .as_deref()
        .map(body_label)
        .unwrap_or("Любой подходящий автомобиль")
        .to_string();

    if let Some(vehicle_id) = selected_vehicle_id.as_deref() {
        let vehicle = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>, Option<i32>, Option<i32>, String)>(
            "SELECT v.owner_id,v.plate,v.model,v.body,v.body_code,v.capacity_kg,v.volume_liters,v.status FROM fleet_vehicles v JOIN users u ON u.id=v.owner_id AND u.role='carrier' WHERE v.id=$1 FOR UPDATE OF v",
        )
        .bind(vehicle_id)
        .fetch_optional(&mut *tx)
        .await;

        let (owner_id, plate, model, body, vehicle_body_code, capacity_kg, vehicle_volume, status) =
            match vehicle {
                Ok(Some(vehicle)) => vehicle,
                Ok(None) => {
                    return json_error(StatusCode::NOT_FOUND, "Selected vehicle is not available");
                }
                Err(error) => {
                    error!(%error, "selected vehicle lookup failed");
                    return json_error(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Unable to reserve selected vehicle",
                    );
                }
            };
        if status == "maintenance" {
            return json_error(
                StatusCode::CONFLICT,
                "Selected vehicle is under maintenance",
            );
        }
        if body_code
            .as_deref()
            .is_some_and(|required| vehicle_body_code.as_deref() != Some(required))
        {
            return json_error(
                StatusCode::CONFLICT,
                "Selected vehicle body type does not match the shipment requirement",
            );
        }
        if body_code
            .as_deref()
            .is_some_and(|required| vehicle_body_code.as_deref() != Some(required))
        {
            return json_error(
                StatusCode::CONFLICT,
                "Selected vehicle body type does not match the shipment requirement",
            );
        }
        let Some(capacity_kg) = capacity_kg else {
            return json_error(
                StatusCode::CONFLICT,
                "Selected vehicle capacity is not configured",
            );
        };
        let (reserved_weight, reserved_volume) = match sqlx::query_as::<_, (i64, i64)>(
            "SELECT COALESCE(SUM(requested_weight_kg),0)::BIGINT,COALESCE(SUM(requested_volume_liters),0)::BIGINT FROM vehicle_reservations WHERE vehicle_id=$1 AND state IN ('pending','confirmed')",
        )
        .bind(vehicle_id)
        .fetch_one(&mut *tx)
        .await
        {
            Ok(values) => values,
            Err(error) => {
                error!(%error, "vehicle reservation usage query failed");
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Unable to reserve selected vehicle");
            }
        };
        if reserved_weight + i64::from(req.weight_kg) > i64::from(capacity_kg) {
            return json_error(
                StatusCode::CONFLICT,
                "Selected vehicle does not have enough free weight capacity",
            );
        }
        if let Some(cargo_volume) = req.volume_liters {
            let Some(vehicle_volume) = vehicle_volume else {
                return json_error(
                    StatusCode::CONFLICT,
                    "Selected vehicle volume is not configured",
                );
            };
            if reserved_volume + i64::from(cargo_volume) > i64::from(vehicle_volume) {
                return json_error(
                    StatusCode::CONFLICT,
                    "Selected vehicle does not have enough free volume",
                );
            }
        }
        selected_carrier_id = Some(owner_id);
        vehicle_label = format!("{plate} · {model} · {body}");
    }

    let id = format!(
        "RH-{}",
        Uuid::new_v4().simple().to_string()[..7].to_uppercase()
    );
    let weight = format_weight(req.weight_kg);
    let result = sqlx::query_as::<_, Shipment>(
        "INSERT INTO shipments(id,customer_id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'published',$16) RETURNING id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company",
    )
    .bind(&id)
    .bind(user.id)
    .bind(from_city)
    .bind(to_city)
    .bind(date)
    .bind(cargo)
    .bind(weight)
    .bind(req.weight_kg)
    .bind(req.volume_liters)
    .bind(req.volume_estimated)
    .bind(body_code.as_deref())
    .bind(&vehicle_label)
    .bind(selected_vehicle_id.as_deref())
    .bind(selected_carrier_id)
    .bind(price)
    .bind(&user.name)
    .fetch_one(&mut *tx)
    .await;

    let shipment = match result {
        Ok(shipment) => shipment,
        Err(error) => {
            error!(%error, "shipment insert failed");
            return json_error(StatusCode::BAD_REQUEST, "Invalid shipment");
        }
    };

    if let Some(vehicle_id) = selected_vehicle_id.as_deref() {
        if let Err(error) = sqlx::query(
            "INSERT INTO vehicle_reservations(shipment_id,vehicle_id,requested_weight_kg,requested_volume_liters,state) VALUES($1,$2,$3,$4,'pending')",
        )
        .bind(&id)
        .bind(vehicle_id)
        .bind(req.weight_kg)
        .bind(req.volume_liters)
        .execute(&mut *tx)
        .await
        {
            error!(%error, "vehicle reservation insert failed");
            return json_error(StatusCode::CONFLICT, "Unable to reserve selected vehicle");
        }
        if let Some(carrier_id) = selected_carrier_id {
            let _ = sqlx::query(
                "INSERT INTO notifications(id,user_id,title,text,type) VALUES($1,$2,'Новая заявка на ваш автомобиль',$3,'shipment')",
            )
            .bind(Uuid::new_v4())
            .bind(carrier_id)
            .bind(format!("Заказчик выбрал ваш автомобиль для заявки {id}."))
            .execute(&mut *tx)
            .await;
        }
    }

    if let Err(error) = tx.commit().await {
        error!(%error, "shipment transaction commit failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to create shipment",
        );
    }

    publish(
        &state,
        "shipment.created",
        &id,
        user.id,
        json!({ "vehicleId": selected_vehicle_id }),
    )
    .await;
    (StatusCode::CREATED, Json(json!({ "data": shipment }))).into_response()
}

async fn change_status(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<StatusRequest>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let valid_status = matches!(
        req.status.as_str(),
        "published"
            | "offered"
            | "accepted"
            | "in_transit"
            | "delivered"
            | "completed"
            | "cancelled"
    );
    if !valid_status {
        return json_error(StatusCode::BAD_REQUEST, "Invalid status");
    }
    let allowed = match user.role.as_str() {
        "admin" => true,
        "driver" => matches!(req.status.as_str(), "in_transit" | "delivered" | "completed")
            && sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM driver_assignments da WHERE da.shipment_id=$1 AND da.driver_id=$2)")
                .bind(&id)
                .bind(user.id)
                .fetch_one(&state.db)
                .await
                .unwrap_or(false),
        _ => false,
    };
    if !allowed {
        return json_error(StatusCode::FORBIDDEN, "Status change is not permitted");
    }
    let result = sqlx::query_as::<_, Shipment>("UPDATE shipments SET status=$1 WHERE id=$2 RETURNING id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company").bind(&req.status).bind(&id).fetch_optional(&state.db).await;
    match result {
        Ok(Some(shipment)) => {
            publish(
                &state,
                "shipment.status_changed",
                &id,
                user.id,
                json!({ "status": req.status }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "data": shipment }))).into_response()
        }
        Ok(None) => json_error(StatusCode::NOT_FOUND, "Shipment not found"),
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Invalid status change"),
    }
}

async fn cancel_shipment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to cancel shipment",
            );
        }
    };
    let row = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT customer_id,status FROM shipments WHERE id=$1 FOR UPDATE",
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await;
    let (customer_id, status) = match row {
        Ok(Some(row)) => row,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "Shipment not found"),
        Err(error) => {
            error!(%error, "shipment cancellation lookup failed");
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to cancel shipment",
            );
        }
    };
    if user.role != "admin" && customer_id != user.id {
        return json_error(
            StatusCode::FORBIDDEN,
            "Only the shipment owner can cancel it",
        );
    }
    if !matches!(status.as_str(), "published" | "offered") {
        return json_error(StatusCode::CONFLICT, "Shipment can no longer be cancelled");
    }
    if let Err(error) =
        sqlx::query("UPDATE offers SET status='rejected' WHERE shipment_id=$1 AND status='pending'")
            .bind(&id)
            .execute(&mut *tx)
            .await
    {
        error!(%error, "offer cancellation failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to cancel shipment",
        );
    }
    let shipment = match sqlx::query_as::<_, Shipment>(
        "UPDATE shipments SET status='cancelled' WHERE id=$1 RETURNING id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,volume_estimated,requested_body_code,vehicle,selected_vehicle_id,selected_carrier_id,price,status,company",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(shipment) => shipment,
        Err(error) => {
            error!(%error, "shipment cancellation update failed");
            return json_error(StatusCode::BAD_REQUEST, "Unable to cancel shipment");
        }
    };
    if let Err(error) = tx.commit().await {
        error!(%error, "shipment cancellation commit failed");
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to cancel shipment",
        );
    }
    publish(&state, "shipment.cancelled", &id, user.id, json!({})).await;
    (StatusCode::OK, Json(json!({ "data": shipment }))).into_response()
}

async fn shipment_events(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    if !can_access_shipment(&state, &user, &id, false).await {
        return json_error(StatusCode::NOT_FOUND, "Shipment not found");
    }
    match sqlx::query_as::<_, ShipmentEvent>("SELECT id,shipment_id,event,actor_id,payload,occurred_at FROM shipment_events WHERE shipment_id=$1 ORDER BY occurred_at ASC").bind(id).fetch_all(&state.db).await { Ok(events) => (StatusCode::OK, Json(json!({ "data": events }))).into_response(), Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error") }
}

async fn list_offers(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let allowed = match user.role.as_str() {
        "admin" => true,
        "customer" => sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM shipments WHERE id=$1 AND customer_id=$2)",
        )
        .bind(&id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false),
        "carrier" => true,
        "driver" => false,
        _ => false,
    };
    if !allowed {
        return json_error(StatusCode::FORBIDDEN, "Insufficient permissions");
    }
    match sqlx::query_as::<_, Offer>("SELECT id,shipment_id,carrier_id,carrier_name,vehicle,vehicle_id,price,eta,status FROM offers WHERE shipment_id=$1 AND ($2='admin' OR $2='customer' OR carrier_id=$3) ORDER BY created_at DESC").bind(id).bind(&user.role).bind(user.id).fetch_all(&state.db).await { Ok(offers) => (StatusCode::OK, Json(json!({ "data": offers }))).into_response(), Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error") }
}

async fn create_offer(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(shipment_id): Path<String>,
    Json(req): Json<OfferRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["carrier"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let price = req.price.trim();
    let eta = req.eta.trim();
    let vehicle_id = req.vehicle_id.trim();
    if price.is_empty() || eta.is_empty() || vehicle_id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Offer price, ETA and vehicle are required",
        );
    }

    let shipment = sqlx::query_as::<_, (String, Option<Uuid>, Option<String>, Option<i32>, Option<i32>, Option<String>)>(
        "SELECT status,selected_carrier_id,selected_vehicle_id,weight_kg,volume_liters,requested_body_code FROM shipments WHERE id=$1 AND customer_id<>$2",
    )
    .bind(&shipment_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await;
    let (
        status,
        selected_carrier_id,
        selected_vehicle_id,
        weight_kg,
        volume_liters,
        requested_body_code,
    ) = match shipment {
        Ok(Some(row)) => row,
        Ok(None) => {
            return json_error(
                StatusCode::NOT_FOUND,
                "Shipment is not available for offers",
            );
        }
        Err(error) => {
            error!(%error, "offer shipment lookup failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Unable to create offer");
        }
    };
    if !matches!(status.as_str(), "published" | "offered") {
        return json_error(StatusCode::CONFLICT, "Shipment is not accepting offers");
    }
    if selected_carrier_id.is_some_and(|carrier_id| carrier_id != user.id) {
        return json_error(
            StatusCode::NOT_FOUND,
            "Shipment is reserved for another carrier",
        );
    }
    if selected_vehicle_id
        .as_deref()
        .is_some_and(|selected| selected != vehicle_id)
    {
        return json_error(
            StatusCode::CONFLICT,
            "Customer selected a different vehicle",
        );
    }

    let vehicle = sqlx::query_as::<_, (String, String, String, Option<String>, Option<i32>, Option<i32>, String)>(
        "SELECT plate,model,body,body_code,capacity_kg,volume_liters,status FROM fleet_vehicles WHERE id=$1 AND owner_id=$2",
    )
    .bind(vehicle_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await;
    let (plate, model, body, vehicle_body_code, capacity_kg, vehicle_volume, vehicle_status) =
        match vehicle {
            Ok(Some(row)) => row,
            Ok(None) => {
                return json_error(StatusCode::NOT_FOUND, "Vehicle not found in your fleet");
            }
            Err(error) => {
                error!(%error, "offer vehicle lookup failed");
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Unable to create offer");
            }
        };
    if vehicle_status == "maintenance" {
        return json_error(StatusCode::CONFLICT, "Vehicle is under maintenance");
    }
    if requested_body_code
        .as_deref()
        .is_some_and(|required| vehicle_body_code.as_deref() != Some(required))
    {
        return json_error(
            StatusCode::CONFLICT,
            "Vehicle body type does not match the shipment requirement",
        );
    }
    if let (Some(weight_kg), Some(capacity_kg)) = (weight_kg, capacity_kg) {
        let (used_weight, used_volume) = sqlx::query_as::<_, (i64, i64)>(
            "SELECT COALESCE(SUM(requested_weight_kg),0)::BIGINT,COALESCE(SUM(requested_volume_liters),0)::BIGINT FROM vehicle_reservations WHERE vehicle_id=$1 AND shipment_id<>$2 AND state IN ('pending','confirmed')",
        )
        .bind(vehicle_id)
        .bind(&shipment_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or((0, 0));
        if used_weight + i64::from(weight_kg) > i64::from(capacity_kg) {
            return json_error(
                StatusCode::CONFLICT,
                "Vehicle does not have enough free weight capacity",
            );
        }
        if let Some(cargo_volume) = volume_liters {
            let Some(vehicle_volume) = vehicle_volume else {
                return json_error(StatusCode::CONFLICT, "Vehicle volume is not configured");
            };
            if used_volume + i64::from(cargo_volume) > i64::from(vehicle_volume) {
                return json_error(
                    StatusCode::CONFLICT,
                    "Vehicle does not have enough free volume",
                );
            }
        }
    }

    let id = format!(
        "OF-{}",
        Uuid::new_v4().simple().to_string()[..7].to_uppercase()
    );
    let vehicle_label = format!("{plate} · {model} · {body}");
    let result = sqlx::query_as::<_, Offer>(
        "INSERT INTO offers(id,shipment_id,carrier_id,carrier_name,vehicle,vehicle_id,price,eta,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING id,shipment_id,carrier_id,carrier_name,vehicle,vehicle_id,price,eta,status",
    )
    .bind(&id)
    .bind(&shipment_id)
    .bind(user.id)
    .bind(&user.name)
    .bind(vehicle_label)
    .bind(vehicle_id)
    .bind(price)
    .bind(eta)
    .fetch_one(&state.db)
    .await;
    match result {
        Ok(offer) => {
            let _ = sqlx::query(
                "UPDATE shipments SET status='offered' WHERE id=$1 AND status='published'",
            )
            .bind(&shipment_id)
            .execute(&state.db)
            .await;
            publish(
                &state,
                "offer.created",
                &shipment_id,
                user.id,
                json!({ "offerId": id, "vehicleId": vehicle_id }),
            )
            .await;
            (StatusCode::CREATED, Json(json!({ "data": offer }))).into_response()
        }
        Err(error)
            if error
                .as_database_error()
                .is_some_and(|db| db.is_unique_violation()) =>
        {
            json_error(
                StatusCode::CONFLICT,
                "You already submitted an offer for this shipment",
            )
        }
        Err(error) => {
            error!(%error, "offer insert failed");
            json_error(StatusCode::BAD_REQUEST, "Invalid offer")
        }
    }
}

async fn accept_offer(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let allowed = match user.role.as_str() {
        "admin" => true,
        "customer" => sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM offers o INNER JOIN shipments s ON s.id=o.shipment_id WHERE o.id=$1 AND s.customer_id=$2)",
        )
        .bind(&id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false),
        _ => false,
    };
    if !allowed {
        return json_error(
            StatusCode::FORBIDDEN,
            "Only the shipment owner or admin can accept offers",
        );
    }
    let result = sqlx::query_as::<_, Offer>(
        "UPDATE offers SET status='accepted' WHERE id=$1 AND status='pending' RETURNING id,shipment_id,carrier_id,carrier_name,vehicle,vehicle_id,price,eta,status",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await;
    match result {
        Ok(Some(offer)) => {
            publish(
                &state,
                "offer.accepted",
                &offer.shipment_id,
                user.id,
                json!({ "offerId": offer.id, "vehicleId": offer.vehicle_id }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "data": offer }))).into_response()
        }
        Ok(None) => json_error(
            StatusCode::NOT_FOUND,
            "Offer not found or already processed",
        ),
        Err(error) => {
            error!(%error, "offer acceptance failed");
            json_error(
                StatusCode::CONFLICT,
                "Vehicle capacity changed or offer cannot be accepted",
            )
        }
    }
}

async fn list_fleet(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match require_role(&headers, &state, &["carrier", "admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let query = "SELECT v.id,v.owner_id,u.name AS owner_name,v.plate,v.model,v.body,v.body_code,v.capacity,v.capacity_kg,v.volume,v.volume_liters,v.length_mm,v.width_mm,v.height_mm,v.year,v.photo_url,v.status,v.driver_name FROM fleet_vehicles v JOIN users u ON u.id=v.owner_id";
    let result = if user.role == "admin" {
        sqlx::query_as::<_, FleetVehicle>(&format!("{query} ORDER BY v.created_at DESC"))
            .fetch_all(&state.db)
            .await
    } else {
        sqlx::query_as::<_, FleetVehicle>(&format!(
            "{query} WHERE v.owner_id=$1 ORDER BY v.created_at DESC"
        ))
        .bind(user.id)
        .fetch_all(&state.db)
        .await
    };
    match result {
        Ok(vehicles) => (StatusCode::OK, Json(json!({ "data": vehicles }))).into_response(),
        Err(error) => {
            error!(%error, "fleet list failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "Unable to load fleet")
        }
    }
}

async fn list_available_vehicles(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<AvailableVehicleQuery>,
) -> Response {
    if let Err(error) = session_user(&headers, &state).await {
        return error;
    }
    let body_code = query
        .body_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let required_weight = query.weight_kg.unwrap_or_default().max(0) as i64;
    let required_volume = query.volume_liters.unwrap_or_default().max(0) as i64;
    let result = sqlx::query_as::<_, AvailableVehicle>(
        r#"SELECT
            v.id,
            v.owner_id AS carrier_id,
            u.name AS carrier_name,
            v.plate,
            v.model,
            v.body,
            v.body_code,
            v.capacity_kg,
            v.volume_liters,
            v.length_mm,
            v.width_mm,
            v.height_mm,
            v.year,
            v.photo_url,
            v.status,
            COALESCE(r.reserved_weight_kg,0)::BIGINT AS reserved_weight_kg,
            COALESCE(r.reserved_volume_liters,0)::BIGINT AS reserved_volume_liters,
            GREATEST(v.capacity_kg::BIGINT-COALESCE(r.reserved_weight_kg,0),0)::BIGINT AS remaining_weight_kg,
            CASE WHEN v.volume_liters IS NULL THEN NULL ELSE GREATEST(v.volume_liters::BIGINT-COALESCE(r.reserved_volume_liters,0),0)::BIGINT END AS remaining_volume_liters,
            COALESCE(r.pending_reservations,0)::BIGINT AS pending_reservations
        FROM fleet_vehicles v
        INNER JOIN users u ON u.id=v.owner_id AND u.role='carrier'
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(SUM(requested_weight_kg),0)::BIGINT AS reserved_weight_kg,
                COALESCE(SUM(requested_volume_liters),0)::BIGINT AS reserved_volume_liters,
                COUNT(*) FILTER (WHERE state='pending')::BIGINT AS pending_reservations
            FROM vehicle_reservations
            WHERE vehicle_id=v.id AND state IN ('pending','confirmed')
        ) r ON TRUE
        WHERE v.status <> 'maintenance'
          AND v.capacity_kg IS NOT NULL
          AND ($1::TEXT IS NULL OR v.body_code=$1)
          AND GREATEST(v.capacity_kg::BIGINT-COALESCE(r.reserved_weight_kg,0),0) >= $2
          AND ($3=0 OR (v.volume_liters IS NOT NULL AND GREATEST(v.volume_liters::BIGINT-COALESCE(r.reserved_volume_liters,0),0) >= $3))
        ORDER BY pending_reservations ASC, remaining_weight_kg DESC, v.created_at DESC"#,
    )
    .bind(body_code)
    .bind(required_weight)
    .bind(required_volume)
    .fetch_all(&state.db)
    .await;
    match result {
        Ok(vehicles) => (StatusCode::OK, Json(json!({ "data": vehicles }))).into_response(),
        Err(error) => {
            error!(%error, "available fleet list failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to load available vehicles",
            )
        }
    }
}

fn fleet_strings(capacity_kg: i32, volume_liters: i32) -> (String, String) {
    let tonnes = capacity_kg as f64 / 1000.0;
    let cubic_metres = volume_liters as f64 / 1000.0;
    (format!("{tonnes:.1} т"), format!("{cubic_metres:.1} м³"))
}

fn validate_fleet_request(req: &FleetRequest) -> Result<(), &'static str> {
    if req.plate.trim().len() < 4 || req.model.trim().len() < 2 || req.body.trim().len() < 2 {
        return Err("Vehicle plate, model and body are required");
    }
    if !valid_body_code(req.body_code.trim()) {
        return Err("Invalid vehicle body type");
    }
    if !(100..=200_000).contains(&req.capacity_kg) {
        return Err("Vehicle capacity must be between 100 and 200000 kg");
    }
    if !(100..=500_000).contains(&req.volume_liters) {
        return Err("Vehicle volume must be between 100 and 500000 liters");
    }
    if [req.length_mm, req.width_mm, req.height_mm]
        .into_iter()
        .flatten()
        .any(|value| !(100..=50_000).contains(&value))
    {
        return Err("Vehicle dimensions are outside the supported range");
    }
    if req.year.is_some_and(|year| !(1950..=2100).contains(&year)) {
        return Err("Vehicle year is outside the supported range");
    }
    if !valid_photo_url(
        req.photo_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
    ) {
        return Err("Vehicle photo URL must use HTTPS");
    }
    if req
        .status
        .as_deref()
        .is_some_and(|status| !valid_vehicle_status(status))
    {
        return Err("Invalid vehicle status");
    }
    Ok(())
}

async fn create_fleet(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<FleetRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["carrier", "admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    if let Err(message) = validate_fleet_request(&req) {
        return json_error(StatusCode::BAD_REQUEST, message);
    }
    let owner_id = if user.role == "carrier" {
        user.id
    } else {
        let owner_email = clean_optional(req.owner_email.as_deref());
        let Some(owner_email) = owner_email else {
            return json_error(
                StatusCode::BAD_REQUEST,
                "Carrier email is required for admin-created vehicles",
            );
        };
        match sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM users WHERE email=$1 AND role='carrier'",
        )
        .bind(normalized_email(&owner_email))
        .fetch_optional(&state.db)
        .await
        {
            Ok(Some(owner_id)) => owner_id,
            Ok(None) => return json_error(StatusCode::NOT_FOUND, "Carrier account not found"),
            Err(error) => {
                error!(%error, "vehicle owner lookup failed");
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Unable to resolve carrier",
                );
            }
        }
    };
    let id = format!(
        "VH-{}",
        Uuid::new_v4().simple().to_string()[..8].to_uppercase()
    );
    let (capacity, volume) = fleet_strings(req.capacity_kg, req.volume_liters);
    let photo_url = clean_optional(req.photo_url.as_deref());
    let status = req.status.as_deref().unwrap_or("available");
    let result = sqlx::query_as::<_, FleetVehicle>(
        r#"WITH inserted AS (
            INSERT INTO fleet_vehicles(
                id,owner_id,plate,model,body,body_code,capacity,capacity_kg,volume,volume_liters,
                length_mm,width_mm,height_mm,year,photo_url,status
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *
        )
        SELECT i.id,i.owner_id,u.name AS owner_name,i.plate,i.model,i.body,i.body_code,
               i.capacity,i.capacity_kg,i.volume,i.volume_liters,i.length_mm,i.width_mm,i.height_mm,
               i.year,i.photo_url,i.status,i.driver_name
        FROM inserted i JOIN users u ON u.id=i.owner_id"#,
    )
    .bind(&id)
    .bind(owner_id)
    .bind(req.plate.trim().to_uppercase())
    .bind(req.model.trim())
    .bind(req.body.trim())
    .bind(req.body_code.trim())
    .bind(capacity)
    .bind(req.capacity_kg)
    .bind(volume)
    .bind(req.volume_liters)
    .bind(req.length_mm)
    .bind(req.width_mm)
    .bind(req.height_mm)
    .bind(req.year)
    .bind(photo_url)
    .bind(status)
    .fetch_one(&state.db)
    .await;
    match result {
        Ok(vehicle) => (StatusCode::CREATED, Json(json!({ "data": vehicle }))).into_response(),
        Err(error)
            if error
                .as_database_error()
                .is_some_and(|db| db.is_unique_violation()) =>
        {
            json_error(
                StatusCode::CONFLICT,
                "A vehicle with this plate already exists in this fleet",
            )
        }
        Err(error) => {
            error!(%error, "fleet vehicle create failed");
            json_error(StatusCode::BAD_REQUEST, "Unable to create vehicle")
        }
    }
}

async fn update_fleet_vehicle(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<FleetRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["carrier", "admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    if let Err(message) = validate_fleet_request(&req) {
        return json_error(StatusCode::BAD_REQUEST, message);
    }
    let (capacity, volume) = fleet_strings(req.capacity_kg, req.volume_liters);
    let photo_url = clean_optional(req.photo_url.as_deref());
    let status = req.status.as_deref().unwrap_or("available");
    let result = sqlx::query_as::<_, FleetVehicle>(
        r#"WITH updated AS (
            UPDATE fleet_vehicles
            SET plate=$1,model=$2,body=$3,body_code=$4,capacity=$5,capacity_kg=$6,
                volume=$7,volume_liters=$8,length_mm=$9,width_mm=$10,height_mm=$11,
                year=$12,photo_url=$13,status=$14
            WHERE id=$15 AND ($16='admin' OR owner_id=$17)
            RETURNING *
        )
        SELECT v.id,v.owner_id,u.name AS owner_name,v.plate,v.model,v.body,v.body_code,
               v.capacity,v.capacity_kg,v.volume,v.volume_liters,v.length_mm,v.width_mm,v.height_mm,
               v.year,v.photo_url,v.status,v.driver_name
        FROM updated v JOIN users u ON u.id=v.owner_id"#,
    )
    .bind(req.plate.trim().to_uppercase())
    .bind(req.model.trim())
    .bind(req.body.trim())
    .bind(req.body_code.trim())
    .bind(capacity)
    .bind(req.capacity_kg)
    .bind(volume)
    .bind(req.volume_liters)
    .bind(req.length_mm)
    .bind(req.width_mm)
    .bind(req.height_mm)
    .bind(req.year)
    .bind(photo_url)
    .bind(status)
    .bind(&id)
    .bind(&user.role)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await;
    match result {
        Ok(Some(vehicle)) => (StatusCode::OK, Json(json!({ "data": vehicle }))).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "Vehicle not found"),
        Err(error)
            if error
                .as_database_error()
                .is_some_and(|db| db.is_unique_violation()) =>
        {
            json_error(
                StatusCode::CONFLICT,
                "A vehicle with this plate already exists in this fleet",
            )
        }
        Err(error) => {
            error!(%error, "fleet vehicle update failed");
            json_error(StatusCode::BAD_REQUEST, "Unable to update vehicle")
        }
    }
}

async fn list_team_drivers(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match require_role(&headers, &state, &["carrier", "admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let rows = if user.role == "carrier" {
        sqlx::query_as::<_, TeamDriver>(
            r#"SELECT u.id,u.name,u.email,u.phone,
                EXISTS(
                    SELECT 1 FROM driver_assignments da
                    JOIN shipments s ON s.id=da.shipment_id
                    WHERE da.driver_id=u.id AND s.status IN ('accepted','in_transit','delivered')
                ) AS busy,
                (
                    SELECT da.shipment_id FROM driver_assignments da
                    JOIN shipments s ON s.id=da.shipment_id
                    WHERE da.driver_id=u.id AND s.status IN ('accepted','in_transit','delivered')
                    ORDER BY da.assigned_at DESC LIMIT 1
                ) AS current_shipment_id
            FROM carrier_driver_memberships m
            JOIN users u ON u.id=m.driver_id
            WHERE m.carrier_id=$1 AND m.status='active'
            ORDER BY u.name"#,
        )
        .bind(user.id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, TeamDriver>(
            r#"SELECT DISTINCT ON (u.id) u.id,u.name,u.email,u.phone,
                EXISTS(
                    SELECT 1 FROM driver_assignments da
                    JOIN shipments s ON s.id=da.shipment_id
                    WHERE da.driver_id=u.id AND s.status IN ('accepted','in_transit','delivered')
                ) AS busy,
                (
                    SELECT da.shipment_id FROM driver_assignments da
                    JOIN shipments s ON s.id=da.shipment_id
                    WHERE da.driver_id=u.id AND s.status IN ('accepted','in_transit','delivered')
                    ORDER BY da.assigned_at DESC LIMIT 1
                ) AS current_shipment_id
            FROM carrier_driver_memberships m
            JOIN users u ON u.id=m.driver_id
            WHERE m.status='active'
            ORDER BY u.id,u.name"#,
        )
        .fetch_all(&state.db)
        .await
    };
    match rows {
        Ok(drivers) => (StatusCode::OK, Json(json!({ "data": drivers }))).into_response(),
        Err(error) => {
            error!(%error, "driver team list failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unable to load driver team",
            )
        }
    }
}

async fn add_team_driver(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<DriverTeamRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["carrier"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let email = normalized_email(&req.email);
    if !email.contains('@') || email.len() > 254 {
        return json_error(StatusCode::BAD_REQUEST, "Valid driver email is required");
    }
    let driver = sqlx::query_as::<_, (Uuid, String, String, Option<String>)>(
        "SELECT id,name,email,phone FROM users WHERE email=$1 AND role='driver'",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await;
    let (driver_id, name, email, phone) = match driver {
        Ok(Some(driver)) => driver,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "Registered driver not found"),
        Err(error) => {
            error!(%error, "driver lookup failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Unable to add driver");
        }
    };
    if let Err(error) = sqlx::query(
        "INSERT INTO carrier_driver_memberships(carrier_id,driver_id,status) VALUES($1,$2,'active') ON CONFLICT(carrier_id,driver_id) DO UPDATE SET status='active'",
    )
    .bind(user.id)
    .bind(driver_id)
    .execute(&state.db)
    .await
    {
        error!(%error, "driver membership insert failed");
        return json_error(StatusCode::BAD_REQUEST, "Unable to add driver");
    }
    let busy = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM driver_assignments da JOIN shipments s ON s.id=da.shipment_id WHERE da.driver_id=$1 AND s.status IN ('accepted','in_transit','delivered'))",
    )
    .bind(driver_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    let current_shipment_id = sqlx::query_scalar::<_, String>(
        "SELECT da.shipment_id FROM driver_assignments da JOIN shipments s ON s.id=da.shipment_id WHERE da.driver_id=$1 AND s.status IN ('accepted','in_transit','delivered') ORDER BY da.assigned_at DESC LIMIT 1",
    )
    .bind(driver_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();
    let data = TeamDriver {
        id: driver_id,
        name,
        email,
        phone,
        busy,
        current_shipment_id,
    };
    (StatusCode::CREATED, Json(json!({ "data": data }))).into_response()
}

async fn remove_team_driver(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(driver_id): Path<Uuid>,
) -> Response {
    let user = match require_role(&headers, &state, &["carrier"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let busy = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM driver_assignments da JOIN shipments s ON s.id=da.shipment_id WHERE da.driver_id=$1 AND s.status IN ('accepted','in_transit','delivered'))",
    )
    .bind(driver_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if busy {
        return json_error(StatusCode::CONFLICT, "Driver has an active shipment");
    }
    let result = sqlx::query(
        "UPDATE carrier_driver_memberships SET status='inactive' WHERE carrier_id=$1 AND driver_id=$2 AND status='active'",
    )
    .bind(user.id)
    .bind(driver_id)
    .execute(&state.db)
    .await;
    match result {
        Ok(done) if done.rows_affected() == 1 => {
            (StatusCode::OK, Json(json!({ "data": { "ok": true } }))).into_response()
        }
        Ok(_) => json_error(StatusCode::NOT_FOUND, "Driver is not in your team"),
        Err(error) => {
            error!(%error, "driver membership remove failed");
            json_error(StatusCode::BAD_REQUEST, "Unable to remove driver")
        }
    }
}

async fn list_assignments(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let result = match user.role.as_str() { "admin" => sqlx::query_as::<_, DriverAssignment>("SELECT shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate FROM driver_assignments ORDER BY assigned_at DESC").fetch_all(&state.db).await, "carrier" => sqlx::query_as::<_, DriverAssignment>("SELECT da.shipment_id,da.driver_id,da.driver_name,da.phone,da.vehicle_id,da.vehicle_plate FROM driver_assignments da WHERE EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=da.shipment_id AND o.carrier_id=$1 AND o.status='accepted') ORDER BY da.assigned_at DESC").bind(user.id).fetch_all(&state.db).await, "driver" => sqlx::query_as::<_, DriverAssignment>("SELECT shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate FROM driver_assignments WHERE driver_id=$1 ORDER BY assigned_at DESC").bind(user.id).fetch_all(&state.db).await, _ => return json_error(StatusCode::FORBIDDEN, "Insufficient permissions") };
    match result {
        Ok(assignments) => (StatusCode::OK, Json(json!({ "data": assignments }))).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn assign_driver(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<DriverRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["carrier", "admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    if user.role == "carrier" {
        let owns = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM offers WHERE shipment_id=$1 AND carrier_id=$2 AND status='accepted')").bind(&id).bind(user.id).fetch_one(&state.db).await.unwrap_or(false);
        if !owns {
            return json_error(
                StatusCode::FORBIDDEN,
                "Shipment is not managed by this carrier",
            );
        }
    }
    let result = sqlx::query_as::<_, DriverAssignment>("INSERT INTO driver_assignments(shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate) SELECT $1,u.id,u.name,u.phone,$3,v.plate FROM users u LEFT JOIN fleet_vehicles v ON v.id=$3 WHERE u.id=$2 AND u.role='driver' RETURNING shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate").bind(&id).bind(req.driver_id).bind(&req.vehicle_id).fetch_one(&state.db).await;
    match result {
        Ok(assignment) => {
            publish(
                &state,
                "driver.assigned",
                &id,
                user.id,
                json!({ "driverId": assignment.driver_id, "vehicleId": assignment.vehicle_id }),
            )
            .await;
            (StatusCode::CREATED, Json(json!({ "data": assignment }))).into_response()
        }
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Unable to assign driver"),
    }
}

async fn notifications(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    match sqlx::query("SELECT id,title,text,read,created_at,type FROM notifications WHERE user_id=$1 ORDER BY created_at DESC").bind(user.id).fetch_all(&state.db).await { Ok(rows) => { let data: Vec<Value> = rows.into_iter().map(|row| json!({ "id": row.try_get::<Uuid, _>("id").unwrap_or_default(), "title": row.try_get::<String, _>("title").unwrap_or_default(), "text": row.try_get::<String, _>("text").unwrap_or_default(), "read": row.try_get::<bool, _>("read").unwrap_or(false), "createdAt": row.try_get::<DateTime<Utc>, _>("created_at").unwrap_or_else(|_| Utc::now()), "type": row.try_get::<String, _>("type").unwrap_or_default() })).collect(); (StatusCode::OK, Json(json!({ "data": data }))).into_response() }, Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error") }
}

async fn read_notification(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    match sqlx::query("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "data": { "ok": true } }))).into_response(),
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Unable to update notification"),
    }
}
async fn read_all_notifications(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    match sqlx::query("UPDATE notifications SET read=true WHERE user_id=$1")
        .bind(user.id)
        .execute(&state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "data": { "ok": true } }))).into_response(),
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Unable to update notifications"),
    }
}
async fn dispatch_event(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<EventRequest>,
) -> Response {
    let user = match require_role(&headers, &state, &["admin"]).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let key = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if key.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "Idempotency-Key is required");
    }
    publish(&state, &req.event, &req.aggregate_id, user.id, req.payload).await;
    (
        StatusCode::ACCEPTED,
        Json(json!({ "data": { "accepted": true } })),
    )
        .into_response()
}

async fn publish(
    state: &SharedState,
    event: &str,
    aggregate_id: &str,
    actor_id: Uuid,
    payload: Value,
) {
    let id = Uuid::new_v4();
    if let Err(error) = sqlx::query(
        "INSERT INTO shipment_events(id,shipment_id,event,actor_id,payload) VALUES($1,$2,$3,$4,$5)",
    )
    .bind(id)
    .bind(aggregate_id)
    .bind(event)
    .bind(actor_id)
    .bind(&payload)
    .execute(&state.db)
    .await
    {
        error!(%error, "event persistence failed");
        return;
    }
    let message = RealtimeMessage {
        r#type: event.into(),
        shipment: None,
        event: Some(ShipmentEvent {
            id,
            shipment_id: aggregate_id.into(),
            event: event.into(),
            actor_id,
            payload,
            occurred_at: Utc::now(),
        }),
        notification: None,
    };
    let _ = state.realtime.send(message);
}

async fn websocket(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<std::collections::HashMap<String, String>>,
    upgrade: WebSocketUpgrade,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let shipment_id = match query.get("shipment_id").map(String::as_str).map(str::trim) {
        Some(value) if !value.is_empty() => value.to_owned(),
        _ => return json_error(StatusCode::BAD_REQUEST, "shipment_id is required"),
    };
    if !can_access_shipment(&state, &user, &shipment_id, false).await {
        return json_error(StatusCode::NOT_FOUND, "Shipment not found");
    }
    upgrade.on_upgrade(move |socket| ws_loop(socket, state, Some(shipment_id)))
}
async fn ws_loop(mut socket: WebSocket, state: SharedState, shipment: Option<String>) {
    let mut receiver = state.realtime.subscribe();
    loop {
        tokio::select! { result = receiver.recv() => { match result { Ok(message) => { let matches_shipment = shipment.as_ref().is_none_or(|id| message.event.as_ref().map(|event| &event.shipment_id) == Some(id)); if matches_shipment { let payload = match serde_json::to_string(&message) { Ok(payload) => payload, Err(_) => continue }; if socket.send(Message::Text(payload.into())).await.is_err() { break; } } }, Err(broadcast::error::RecvError::Lagged(_)) => continue, Err(broadcast::error::RecvError::Closed) => break } }, incoming = socket.recv() => { match incoming { Some(Ok(Message::Ping(value))) => { if socket.send(Message::Pong(value)).await.is_err() { break; } }, Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break, Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) | Some(Ok(Message::Pong(_))) => {} } } }
    }
}
async fn shipment_stream(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    if !can_access_shipment(&state, &user, &id, false).await {
        return json_error(StatusCode::NOT_FOUND, "Shipment not found");
    }
    let receiver = state.realtime.subscribe();
    let stream = BroadcastStream::new(receiver).filter_map(move |item| {
        let shipment_id = id.clone();
        match item {
            Ok(message)
                if message
                    .event
                    .as_ref()
                    .map(|event| event.shipment_id.as_str())
                    == Some(shipment_id.as_str()) =>
            {
                match Event::default().json_data(message) {
                    Ok(event) => Some(Ok::<Event, std::convert::Infallible>(event)),
                    Err(_) => None,
                }
            }
            _ => None,
        }
    });
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
