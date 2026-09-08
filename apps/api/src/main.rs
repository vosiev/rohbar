mod telegram;

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{sse::{Event, KeepAlive, Sse}, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, FromRow, PgPool, Row};
use std::{env, sync::Arc};
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
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
    vehicle: String,
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
    price: String,
    eta: String,
    status: String,
}

#[derive(Serialize, FromRow)]
pub struct FleetVehicle {
    id: String,
    plate: String,
    model: String,
    body: String,
    capacity: String,
    volume: String,
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
    vehicle: String,
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
    let redis = redis::Client::open(redis_url).expect("redis configuration failed");
    let origin_text = env::var("FRONTEND_ORIGIN")
        .unwrap_or_else(|_| "https://rohbar.vosiev.com".into());
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
        automation_secret: env::var("AUTOMATION_SECRET")
            .ok()
            .filter(|v| !v.is_empty()),
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
        .route(
            "/api/v1/shipments",
            get(list_shipments).post(create_shipment),
        )
        .route("/api/v1/shipments/{id}", get(get_shipment))
        .route("/api/v1/shipments/{id}/status", post(change_status))
        .route("/api/v1/shipments/{id}/events", get(shipment_events))
        .route("/api/v1/shipments/{id}/stream", get(shipment_stream))
        .route("/api/v1/ws", get(websocket))
        .route(
            "/api/v1/shipments/{id}/offers",
            get(list_offers).post(create_offer),
        )
        .route("/api/v1/offers/{id}/accept", post(accept_offer))
        .route("/api/v1/fleet", get(list_fleet).post(create_fleet))
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

async fn health() -> Json<Value> {
    Json(json!({ "data": { "status": "ok" } }))
}

async fn about(State(state): State<SharedState>) -> Json<Value> {
    Json(json!({
        "data": {
            "name": "RohBar",
            "version": env!("CARGO_PKG_VERSION"),
            "frontend_origin": state.frontend_origin,
            "realtime": ["websocket", "sse"],
            "telegram": state.telegram_token.is_some()
        }
    }))
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(json!({
            "error": {
                "code": status.as_u16().to_string(),
                "message": message
            }
        })),
    )
        .into_response()
}

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

    sqlx::query_as::<_, User>(
        "SELECT id,name,role,phone,telegram_id FROM users WHERE id=$1",
    )
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
        "rohbar_session={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000{}",
        if secure { "; Secure" } else { "" }
    );
    HeaderValue::from_str(&value).expect("cookie")
}

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
            2_592_000,
        )
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Session storage failed"))?;
    Ok(session_cookie(&sid, state.session_cookie_secure))
}

async fn auth_login(State(state): State<SharedState>, Json(req): Json<LoginRequest>) -> Response {
    let row = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>)>(
        "SELECT id,name,role,password_hash,phone FROM users WHERE email=$1",
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some((id, name, role, hash, phone))) = row {
        let password_hash = match PasswordHash::new(&hash) {
            Ok(hash) => hash,
            Err(_) => return json_error(StatusCode::UNAUTHORIZED, "Invalid credentials"),
        };
        if Argon2::default()
            .verify_password(req.password.as_bytes(), &password_hash)
            .is_ok()
        {
            match create_session(&state, id).await {
                Ok(cookie) => {
                    let mut response = (
                        StatusCode::OK,
                        Json(json!({
                            "data": { "id": id, "name": name, "role": role, "phone": phone }
                        })),
                    )
                        .into_response();
                    response.headers_mut().insert(header::SET_COOKIE, cookie);
                    return response;
                }
                Err(error) => return error,
            }
        }
    }

    json_error(StatusCode::UNAUTHORIZED, "Invalid credentials")
}

async fn auth_register(
    State(state): State<SharedState>,
    Json(req): Json<RegisterRequest>,
) -> Response {
    let salt = SaltString::generate(&mut rand::thread_rng());
    let hash = match Argon2::default().hash_password(req.password.as_bytes(), &salt) {
        Ok(hash) => hash.to_string(),
        Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"),
    };
    let id = Uuid::new_v4();
    let row = sqlx::query_as::<_, (Uuid, String, String, Option<String>)>(
        "INSERT INTO users(id,name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,role,phone",
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.email)
    .bind(hash)
    .bind(&req.role)
    .bind(&req.phone)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok((id, name, role, phone)) => match create_session(&state, id).await {
            Ok(cookie) => {
                let mut response = (
                    StatusCode::CREATED,
                    Json(json!({
                        "data": { "id": id, "name": name, "role": role, "phone": phone }
                    })),
                )
                    .into_response();
                response.headers_mut().insert(header::SET_COOKIE, cookie);
                response
            }
            Err(error) => error,
        },
        Err(_) => json_error(StatusCode::CONFLICT, "User already exists"),
    }
}

async fn auth_logout(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    if let Some(cookie) = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').find_map(|p| p.trim().strip_prefix("rohbar_session=")))
    {
        if let Ok(mut connection) = state.redis.get_multiplexed_async_connection().await {
            let _: Result<(), _> = connection.del(format!("rohbar:session:{cookie}")).await;
        }
    }

    let mut response = (
        StatusCode::OK,
        Json(json!({ "data": { "ok": true } })),
    )
        .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "rohbar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        ),
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

async fn list_shipments(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match sqlx::query_as::<_, Shipment>(
        "SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(shipments) => (StatusCode::OK, Json(json!({ "data": shipments }))).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn get_shipment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match sqlx::query_as::<_, Shipment>(
        "SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE id=$1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(shipment)) => (StatusCode::OK, Json(json!({ "data": shipment }))).into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "Shipment not found"),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn create_shipment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let id = format!(
        "RH-{}",
        Uuid::new_v4().simple().to_string()[..5].to_uppercase()
    );
    let result = sqlx::query_as::<_, Shipment>(
        "INSERT INTO shipments(id,customer_id,from_city,to_city,date,cargo,weight,vehicle,price,status,company) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10) RETURNING id,from_city,to_city,date,cargo,weight,vehicle,price,status,company",
    )
    .bind(&id)
    .bind(user.id)
    .bind(payload["from"].as_str().unwrap_or(""))
    .bind(payload["to"].as_str().unwrap_or(""))
    .bind(payload["date"].as_str().unwrap_or(""))
    .bind(payload["cargo"].as_str().unwrap_or(""))
    .bind(payload["weight"].as_str().unwrap_or(""))
    .bind(payload["vehicle"].as_str().unwrap_or(""))
    .bind(payload["price"].as_str().unwrap_or(""))
    .bind(&user.name)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(shipment) => {
            publish(&state, "shipment.created", &id, user.id, json!({})).await;
            (
                StatusCode::CREATED,
                Json(json!({ "data": shipment })),
            )
                .into_response()
        }
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Invalid shipment"),
    }
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
    let result = sqlx::query_as::<_, Shipment>(
        "UPDATE shipments SET status=$1 WHERE id=$2 RETURNING id,from_city,to_city,date,cargo,weight,vehicle,price,status,company",
    )
    .bind(&req.status)
    .bind(&id)
    .fetch_optional(&state.db)
    .await;

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
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Invalid status"),
    }
}

async fn shipment_events(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match sqlx::query_as::<_, ShipmentEvent>(
        "SELECT id,shipment_id,event,actor_id,payload,occurred_at FROM shipment_events WHERE shipment_id=$1 ORDER BY occurred_at ASC",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    {
        Ok(events) => (StatusCode::OK, Json(json!({ "data": events }))).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn list_offers(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match sqlx::query_as::<_, Offer>(
        "SELECT id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status FROM offers WHERE shipment_id=$1 ORDER BY created_at DESC",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    {
        Ok(offers) => (StatusCode::OK, Json(json!({ "data": offers }))).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn create_offer(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(shipment_id): Path<String>,
    Json(req): Json<OfferRequest>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let id = format!(
        "OF-{}",
        Uuid::new_v4().simple().to_string()[..6].to_uppercase()
    );
    let result = sqlx::query_as::<_, Offer>(
        "INSERT INTO offers(id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status",
    )
    .bind(&id)
    .bind(&shipment_id)
    .bind(user.id)
    .bind(&user.name)
    .bind(&req.vehicle)
    .bind(&req.price)
    .bind(&req.eta)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(offer) => {
            publish(
                &state,
                "offer.created",
                &shipment_id,
                user.id,
                json!({ "offerId": id }),
            )
            .await;
            (StatusCode::CREATED, Json(json!({ "data": offer }))).into_response()
        }
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Invalid offer"),
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
    let result = sqlx::query_as::<_, Offer>(
        "UPDATE offers SET status='accepted' WHERE id=$1 RETURNING id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status",
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
                json!({ "offerId": offer.id }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "data": offer }))).into_response()
        }
        Ok(None) => json_error(StatusCode::NOT_FOUND, "Offer not found"),
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Unable to accept offer"),
    }
}

async fn list_fleet(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match sqlx::query_as::<_, FleetVehicle>(
        "SELECT id,plate,model,body,capacity,volume,status,driver_name FROM fleet_vehicles ORDER BY id",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(vehicles) => (StatusCode::OK, Json(json!({ "data": vehicles }))).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn create_fleet(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let result = sqlx::query_as::<_, FleetVehicle>(
        "INSERT INTO fleet_vehicles(id,owner_id,plate,model,body,capacity,volume,status) VALUES($1,$2,$3,$4,$5,$6,$7,'available') RETURNING id,plate,model,body,capacity,volume,status,driver_name",
    )
    .bind(format!(
        "VH-{}",
        Uuid::new_v4().simple().to_string()[..6].to_uppercase()
    ))
    .bind(user.id)
    .bind(payload["plate"].as_str().unwrap_or(""))
    .bind(payload["model"].as_str().unwrap_or(""))
    .bind(payload["body"].as_str().unwrap_or(""))
    .bind(payload["capacity"].as_str().unwrap_or(""))
    .bind(payload["volume"].as_str().unwrap_or(""))
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(vehicle) => (
            StatusCode::CREATED,
            Json(json!({ "data": vehicle })),
        )
            .into_response(),
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Invalid vehicle"),
    }
}

async fn list_assignments(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    match sqlx::query_as::<_, DriverAssignment>(
        "SELECT shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate FROM driver_assignments ORDER BY assigned_at DESC",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(assignments) => (
            StatusCode::OK,
            Json(json!({ "data": assignments })),
        )
            .into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
}

async fn assign_driver(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<DriverRequest>,
) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    let result = sqlx::query_as::<_, DriverAssignment>(
        "INSERT INTO driver_assignments(shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate) SELECT $1,u.id,u.name,u.phone,$3,v.plate FROM users u LEFT JOIN fleet_vehicles v ON v.id=$3 WHERE u.id=$2 RETURNING shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate",
    )
    .bind(&id)
    .bind(req.driver_id)
    .bind(&req.vehicle_id)
    .fetch_one(&state.db)
    .await;

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
            (
                StatusCode::CREATED,
                Json(json!({ "data": assignment })),
            )
                .into_response()
        }
        Err(_) => json_error(StatusCode::BAD_REQUEST, "Unable to assign driver"),
    }
}

async fn notifications(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(user) => user,
        Err(error) => return error,
    };
    match sqlx::query(
        "SELECT id,title,text,read,created_at,type FROM notifications WHERE user_id=$1 ORDER BY created_at DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => {
            let data: Vec<Value> = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.try_get::<Uuid, _>("id").unwrap_or_default(),
                        "title": row.try_get::<String, _>("title").unwrap_or_default(),
                        "text": row.try_get::<String, _>("text").unwrap_or_default(),
                        "read": row.try_get::<bool, _>("read").unwrap_or(false),
                        "createdAt": row.try_get::<DateTime<Utc>, _>("created_at").unwrap_or_else(|_| Utc::now()),
                        "type": row.try_get::<String, _>("type").unwrap_or_default(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "data": data }))).into_response()
        }
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    }
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
    let user = match session_user(&headers, &state).await {
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

    publish(
        &state,
        &req.event,
        &req.aggregate_id,
        user.id,
        req.payload,
    )
    .await;
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
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
    }
    let shipment = query.get("shipment_id").cloned();
    upgrade.on_upgrade(move |socket| ws_loop(socket, state, shipment))
}

async fn ws_loop(mut socket: WebSocket, state: SharedState, shipment: Option<String>) {
    let mut receiver = state.realtime.subscribe();

    loop {
        tokio::select! {
            result = receiver.recv() => {
                match result {
                    Ok(message) => {
                        let matches_shipment = shipment.as_ref().is_none_or(|id| {
                            message.event.as_ref().map(|event| &event.shipment_id) == Some(id)
                        });
                        if matches_shipment {
                            let payload = match serde_json::to_string(&message) {
                                Ok(payload) => payload,
                                Err(_) => continue,
                            };
                            if socket.send(Message::Text(payload.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Ping(value))) => {
                        if socket.send(Message::Pong(value)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) | Some(Ok(Message::Pong(_))) => {}
                }
            }
        }
    }
}

async fn shipment_stream(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if session_user(&headers, &state).await.is_err() {
        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");
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
                    == Some(shipment_id.as_str()) => match Event::default().json_data(message) {
                Ok(event) => Some(Ok::<Event, std::convert::Infallible>(event)),
                Err(_) => None,
            },
            _ => None,
        }
    });

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
