use argon2::{password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString}, Argon2};
use axum::{extract::{Path, Query, State, WebSocketUpgrade}, http::{header, HeaderMap, HeaderValue, StatusCode}, response::{sse::{Event, KeepAlive, Sse}, IntoResponse, Response}, routing::{get, post}, Json, Router};
use axum::extract::ws::{Message, WebSocket};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use hmac::{Hmac, Mac};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::{postgres::PgPoolOptions, FromRow, PgPool};
use std::{convert::Infallible, env, sync::Arc};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;
type SharedState = Arc<AppState>;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    redis: redis::Client,
    realtime: broadcast::Sender<RealtimeMessage>,
    telegram_token: Option<String>,
    session_cookie_secure: bool,
    frontend_origin: String,
    automation_secret: Option<String>,
}

#[derive(Clone, Serialize)]
struct RealtimeMessage {
    r#type: String,
    shipment: Option<Shipment>,
    event: Option<ShipmentEvent>,
    notification: Option<Value>,
}

#[derive(Clone, Serialize, Deserialize, FromRow)]
struct User {
    id: Uuid,
    name: String,
    role: String,
    phone: Option<String>,
    telegram_id: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize, FromRow)]
struct Shipment {
    id: String,
    from_city: String,
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
struct ShipmentEvent {
    id: Uuid,
    shipment_id: String,
    event: String,
    actor_id: Uuid,
    payload: Value,
    occurred_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
struct Offer {
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
struct FleetVehicle {
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
struct DriverAssignment {
    shipment_id: String,
    driver_id: Uuid,
    driver_name: String,
    phone: Option<String>,
    vehicle_id: Option<String>,
    vehicle_plate: Option<String>,
}

#[derive(Serialize, FromRow)]
struct NotificationItem {
    id: Uuid,
    title: String,
    text: String,
    r#type: String,
    read: bool,
    created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
struct Credentials { email: String, password: String }
#[derive(Deserialize)]
struct RegisterInput { name: String, email: String, password: String, role: String, phone: Option<String> }
#[derive(Deserialize)]
struct TelegramAuth { initData: String }
#[derive(Deserialize)]
struct StatusInput { status: String }
#[derive(Deserialize)]
struct DriverInput { driver_id: Uuid, driver_name: String, phone: Option<String>, vehicle_id: Option<String>, vehicle_plate: Option<String> }
#[derive(Deserialize)]
struct OfferInput { vehicle: String, price: String, eta: String }
#[derive(Deserialize)]
struct EventInput { id: Uuid, event: String, aggregate_id: String, payload: Value }
#[derive(Deserialize)]
struct RealtimeQuery { shipment_id: Option<String> }

fn envelope<T: Serialize>(data: T) -> Json<Value> {
    Json(json!({"data": data, "meta": {"requestId": Uuid::new_v4(), "cursor": null}}))
}

fn error_response(status: StatusCode, code: &str, message: &str) -> Response {
    (status, Json(json!({"error": {"code": code, "message": message}}))).into_response()
}

fn session_token(headers: &HeaderMap) -> Option<String> {
    headers.get(header::COOKIE)?.to_str().ok()?.split(';').find_map(|part| part.trim().strip_prefix("rohbar_session=").map(str::to_owned))
}

async fn current_user(state: &SharedState, headers: &HeaderMap) -> Option<User> {
    let token = session_token(headers)?;
    sqlx::query_as::<_, User>("SELECT u.id,u.name,u.role,u.phone,u.telegram_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>NOW()")
        .bind(token).fetch_optional(&state.db).await.ok().flatten()
}

fn session_cookie(token: &str, secure: bool) -> String {
    format!("rohbar_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800{}", if secure {"; Secure"} else {""})
}

async fn create_session(state: &SharedState, user_id: Uuid) -> Result<String, sqlx::Error> {
    let token = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')")
        .bind(&token).bind(user_id).execute(&state.db).await?;
    Ok(token)
}

async fn health(State(state): State<SharedState>) -> Response {
    let db = sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db).await.is_ok();
    let redis = redis::cmd("PING").query_async::<String>(&mut match state.redis.get_multiplexed_async_connection().await { Ok(c) => c, Err(_) => return envelope(json!({"status":"degraded","database":db,"redis":false})).into_response() }).await.is_ok();
    envelope(json!({"status":if db&&redis{"ok"}else{"degraded"},"database":db,"redis":redis})).into_response()
}

async fn about(State(state): State<SharedState>) -> Response {
    envelope(json!({"name":"RohBar","description":"Цифровая платформа межгородских грузоперевозок","version":env!("CARGO_PKG_VERSION"),"realtime":{"websocket":true,"sse":true},"automation":true,"telegramEnabled":state.telegram_token.is_some()})).into_response()
}

async fn me(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    match current_user(&state,&headers).await { Some(user) => envelope(user).into_response(), None => error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated") }
}

async fn login(State(state): State<SharedState>, Json(input): Json<Credentials>) -> Response {
    let row = sqlx::query_as::<_, (User,String)>("SELECT u,p.password_hash FROM users u WHERE u.email=$1").bind(&input.email).fetch_optional(&state.db).await;
    let Some((user,hash)) = row.ok().flatten() else { return error_response(StatusCode::UNAUTHORIZED,"INVALID_CREDENTIALS","Invalid credentials") };
    let parsed = match PasswordHash::new(&hash) { Ok(v) => v, Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR,"PASSWORD_HASH_ERROR","Invalid password hash") };
    if Argon2::default().verify_password(input.password.as_bytes(),&parsed).is_err() { return error_response(StatusCode::UNAUTHORIZED,"INVALID_CREDENTIALS","Invalid credentials") }
    let token = match create_session(&state,user.id).await { Ok(v)=>v, Err(_)=>return error_response(StatusCode::INTERNAL_SERVER_ERROR,"SESSION_ERROR","Could not create session") };
    let mut response=envelope(user).into_response();response.headers_mut().insert(header::SET_COOKIE,HeaderValue::from_str(&session_cookie(&token,state.session_cookie_secure)).unwrap());response
}

async fn register(State(state): State<SharedState>, Json(input): Json<RegisterInput>) -> Response {
    if !matches!(input.role.as_str(),"customer"|"carrier"|"driver") { return error_response(StatusCode::BAD_REQUEST,"VALIDATION_ERROR","Unsupported role") }
    if input.name.trim().len()<2 || input.password.len()<8 { return error_response(StatusCode::BAD_REQUEST,"VALIDATION_ERROR","Name and password do not meet requirements") }
    let salt=SaltString::generate(&mut rand::thread_rng());
    let hash=match Argon2::default().hash_password(input.password.as_bytes(),&salt){Ok(v)=>v.to_string(),Err(_)=>return error_response(StatusCode::INTERNAL_SERVER_ERROR,"PASSWORD_HASH_ERROR","Could not hash password")};
    let id=Uuid::new_v4();
    let user=sqlx::query_as::<_,User>("INSERT INTO users(id,email,name,password_hash,role,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,role,phone,telegram_id")
        .bind(id).bind(&input.email).bind(&input.name).bind(hash).bind(&input.role).bind(&input.phone).fetch_one(&state.db).await;
    let Ok(user)=user else { return error_response(StatusCode::CONFLICT,"EMAIL_EXISTS","Email already exists") };
    let token=match create_session(&state,user.id).await{Ok(v)=>v,Err(_)=>return error_response(StatusCode::INTERNAL_SERVER_ERROR,"SESSION_ERROR","Could not create session")};
    let mut response=envelope(user).into_response();response.headers_mut().insert(header::SET_COOKIE,HeaderValue::from_str(&session_cookie(&token,state.session_cookie_secure)).unwrap());response
}

async fn logout(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    if let Some(token)=session_token(&headers){let _=sqlx::query("DELETE FROM sessions WHERE token=$1").bind(token).execute(&state.db).await;}
    let mut response=envelope(json!({"ok":true})).into_response();response.headers_mut().insert(header::SET_COOKIE,HeaderValue::from_str("rohbar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0").unwrap());response
}

async fn list_shipments(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};
    let query=if user.role=="customer"{"SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE customer_id=$1 ORDER BY created_at DESC"}else{"SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments ORDER BY created_at DESC"};
    let rows=if user.role=="customer"{sqlx::query_as::<_,Shipment>(query).bind(user.id).fetch_all(&state.db).await}else{sqlx::query_as::<_,Shipment>(query).fetch_all(&state.db).await};
    match rows{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load shipments")}
}

async fn create_shipment(State(state): State<SharedState>, headers: HeaderMap, Json(input): Json<Value>) -> Response {
    let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};
    if user.role!="customer"&&user.role!="admin"{return error_response(StatusCode::FORBIDDEN,"FORBIDDEN","Only customers can create shipments")}
    let id=format!("RH-{}",Uuid::new_v4().simple());
    let get=|k:&str|input.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let shipment=sqlx::query_as::<_,Shipment>("INSERT INTO shipments(id,customer_id,from_city,to_city,date,cargo,weight,vehicle,price,status,company) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10) RETURNING id,from_city,to_city,date,cargo,weight,vehicle,price,status,company")
        .bind(&id).bind(user.id).bind(get("from")).bind(get("to")).bind(get("date")).bind(get("cargo")).bind(get("weight")).bind(get("vehicle")).bind(get("price")).bind(&user.name).fetch_one(&state.db).await;
    let Ok(shipment)=shipment else{return error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not create shipment")};
    let _=append_event(&state,&id,user.id,"shipment.created",json!({})).await;
    envelope(shipment).into_response()
}

async fn get_shipment(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>) -> Response {
    if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")}
    match sqlx::query_as::<_,Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE id=$1").bind(&id).fetch_optional(&state.db).await{Ok(Some(v))=>envelope(v).into_response(),Ok(None)=>error_response(StatusCode::NOT_FOUND,"NOT_FOUND","Shipment not found"),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load shipment")}
}

async fn shipment_events(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>) -> Response {
    if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")}
    match sqlx::query_as::<_,ShipmentEvent>("SELECT id,shipment_id,event,actor_id,payload,occurred_at FROM shipment_events WHERE shipment_id=$1 ORDER BY occurred_at ASC").bind(&id).fetch_all(&state.db).await{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load events")}
}

async fn append_event(state:&SharedState,shipment_id:&str,actor_id:Uuid,event_type:&str,payload:Value)->Result<ShipmentEvent,sqlx::Error>{
    let mut tx=state.db.begin().await?;
    let event_id=Uuid::new_v4();
    let event=sqlx::query_as::<_,ShipmentEvent>("INSERT INTO shipment_events(id,shipment_id,event,actor_id,payload) VALUES($1,$2,$3,$4,$5) RETURNING id,shipment_id,event,actor_id,payload,occurred_at").bind(event_id).bind(shipment_id).bind(event_type).bind(actor_id).bind(&payload).fetch_one(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox_events(id,event_type,aggregate_id,actor_id,payload) VALUES($1,$2,$3,$4,$5)").bind(event_id).bind(event_type).bind(shipment_id).bind(actor_id).bind(&payload).execute(&mut *tx).await?;
    tx.commit().await?;
    let shipment=sqlx::query_as::<_,Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE id=$1").bind(shipment_id).fetch_optional(&state.db).await.ok().flatten();
    let _=state.realtime.send(RealtimeMessage{r#type:"shipment.event".into(),shipment,event:Some(event.clone()),notification:None});
    Ok(event)
}

async fn change_status(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>, Json(input): Json<StatusInput>) -> Response {
    let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};
    let current=sqlx::query_scalar::<_,String>("SELECT status FROM shipments WHERE id=$1").bind(&id).fetch_optional(&state.db).await;
    let Some(current)=current.ok().flatten() else{return error_response(StatusCode::NOT_FOUND,"NOT_FOUND","Shipment not found")};
    let allowed=matches!((current.as_str(),input.status.as_str()),("published","offered")|("offered","accepted")|("accepted","in_transit")|("in_transit","delivered")|("delivered","completed"));
    if !allowed{return error_response(StatusCode::CONFLICT,"INVALID_TRANSITION","Invalid shipment status transition")}
    let updated=sqlx::query_as::<_,Shipment>("UPDATE shipments SET status=$1 WHERE id=$2 RETURNING id,from_city,to_city,date,cargo,weight,vehicle,price,status,company").bind(&input.status).bind(&id).fetch_one(&state.db).await;
    let Ok(shipment)=updated else{return error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not update shipment")};
    let event=if input.status=="completed"{"shipment.completed"}else{"shipment.status_changed"};let _=append_event(&state,&id,user.id,event,json!({"status":input.status})).await;
    envelope(shipment).into_response()
}

async fn offers(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>) -> Response {
    if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")}
    match sqlx::query_as::<_,Offer>("SELECT id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status FROM offers WHERE shipment_id=$1 ORDER BY created_at DESC").bind(&id).fetch_all(&state.db).await{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load offers")}
}

async fn create_offer(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>, Json(input): Json<OfferInput>) -> Response {
    let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};if user.role!="carrier"&&user.role!="admin"{return error_response(StatusCode::FORBIDDEN,"FORBIDDEN","Only carriers can create offers")}
    let oid=format!("OF-{}",Uuid::new_v4().simple());let offer=sqlx::query_as::<_,Offer>("INSERT INTO offers(id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status").bind(&oid).bind(&id).bind(user.id).bind(&user.name).bind(&input.vehicle).bind(&input.price).bind(&input.eta).fetch_one(&state.db).await;
    let Ok(offer)=offer else{return error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not create offer")};let _=sqlx::query("UPDATE shipments SET status='offered' WHERE id=$1 AND status='published'").bind(&id).execute(&state.db).await;let _=append_event(&state,&id,user.id,"offer.created",json!(offer)).await;envelope(offer).into_response()
}

async fn accept_offer(State(state): State<SharedState>, headers: HeaderMap, Path(oid): Path<String>) -> Response {
    let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};if user.role!="customer"&&user.role!="admin"{return error_response(StatusCode::FORBIDDEN,"FORBIDDEN","Only customers can accept offers")}
    let mut tx=match state.db.begin().await{Ok(v)=>v,Err(_)=>return error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not begin transaction")};
    let offer=sqlx::query_as::<_,Offer>("SELECT id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status FROM offers WHERE id=$1 FOR UPDATE").bind(&oid).fetch_optional(&mut *tx).await.ok().flatten();let Some(offer)=offer else{return error_response(StatusCode::NOT_FOUND,"NOT_FOUND","Offer not found")};
    sqlx::query("UPDATE offers SET status=CASE WHEN id=$1 THEN 'accepted' ELSE 'rejected' END WHERE shipment_id=$2").bind(&oid).bind(&offer.shipment_id).execute(&mut *tx).await.ok();sqlx::query("UPDATE shipments SET status='accepted' WHERE id=$1").bind(&offer.shipment_id).execute(&mut *tx).await.ok();tx.commit().await.ok();let _=append_event(&state,&offer.shipment_id,user.id,"offer.accepted",json!(offer)).await;envelope(offer).into_response()
}

async fn fleet(State(state): State<SharedState>, headers: HeaderMap) -> Response {let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};match sqlx::query_as::<_,FleetVehicle>("SELECT id,plate,model,body,capacity,volume,status,driver_name FROM fleet_vehicles WHERE owner_id=$1 ORDER BY id").bind(user.id).fetch_all(&state.db).await{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load fleet")}}

async fn create_fleet(State(state): State<SharedState>, headers: HeaderMap, Json(input): Json<Value>) -> Response {let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};let id=format!("VH-{}",Uuid::new_v4().simple());let get=|k:&str|input.get(k).and_then(Value::as_str).unwrap_or("");let v=sqlx::query_as::<_,FleetVehicle>("INSERT INTO fleet_vehicles(id,owner_id,plate,model,body,capacity,volume,status,driver_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,plate,model,body,capacity,volume,status,driver_name").bind(&id).bind(user.id).bind(get("plate")).bind(get("model")).bind(get("body")).bind(get("capacity")).bind(get("volume")).bind(get("status")).bind(input.get("driverName").and_then(Value::as_str)).fetch_one(&state.db).await;match v{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::BAD_REQUEST,"VALIDATION_ERROR","Could not create vehicle")}}

async fn driver_list(State(state): State<SharedState>, headers: HeaderMap) -> Response {if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};match sqlx::query_as::<_,DriverAssignment>("SELECT shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate FROM driver_assignments ORDER BY assigned_at DESC").fetch_all(&state.db).await{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load assignments")}}

async fn driver_assign(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>, Json(input): Json<DriverInput>) -> Response {let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};if user.role!="carrier"&&user.role!="admin"{return error_response(StatusCode::FORBIDDEN,"FORBIDDEN","Only carriers can assign drivers")};let v=sqlx::query_as::<_,DriverAssignment>("INSERT INTO driver_assignments(shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(shipment_id) DO UPDATE SET driver_id=EXCLUDED.driver_id,driver_name=EXCLUDED.driver_name,phone=EXCLUDED.phone,vehicle_id=EXCLUDED.vehicle_id,vehicle_plate=EXCLUDED.vehicle_plate RETURNING shipment_id,driver_id,driver_name,phone,vehicle_id,vehicle_plate").bind(&id).bind(input.driver_id).bind(&input.driver_name).bind(&input.phone).bind(&input.vehicle_id).bind(&input.vehicle_plate).fetch_one(&state.db).await;let Ok(v)=v else{return error_response(StatusCode::BAD_REQUEST,"VALIDATION_ERROR","Could not assign driver")};let _=append_event(&state,&id,user.id,"driver.assigned",json!(v)).await;envelope(v).into_response()}

async fn notifications(State(state): State<SharedState>, headers: HeaderMap) -> Response {let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};match sqlx::query_as::<_,NotificationItem>("SELECT id,title,text,type,read,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC").bind(user.id).fetch_all(&state.db).await{Ok(v)=>envelope(v).into_response(),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not load notifications")}}

async fn notification_read(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<Uuid>) -> Response {let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};match sqlx::query_as::<_,NotificationItem>("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2 RETURNING id,title,text,type,read,created_at").bind(id).bind(user.id).fetch_optional(&state.db).await{Ok(Some(v))=>envelope(v).into_response(),Ok(None)=>error_response(StatusCode::NOT_FOUND,"NOT_FOUND","Notification not found"),Err(_)=>error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not update notification")}}

async fn notifications_read_all(State(state): State<SharedState>, headers: HeaderMap) -> Response {let Some(user)=current_user(&state,&headers).await else{return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};let _=sqlx::query("UPDATE notifications SET read=true WHERE user_id=$1").bind(user.id).execute(&state.db).await;envelope(json!({"ok":true})).into_response()}

fn verify_telegram(init_data:&str,bot_token:&str)->Option<(i64,String)>{let mut pairs=init_data.split('&').filter_map(|p|p.split_once('='));let mut hash=None;let mut data=Vec::new();let mut user_id=None;let mut name=None;for (k,v) in pairs.by_ref(){let v=urlencoding::decode(v).ok()?.into_owned();if k=="hash"{hash=Some(v)}else{if k=="user"{let parsed:Value=serde_json::from_str(&v).ok()?;user_id=parsed.get("id").and_then(Value::as_i64);name=parsed.get("first_name").and_then(Value::as_str).map(str::to_owned)}data.push(format!("{k}={v}"));}}data.sort();let secret={let mut mac=HmacSha256::new_from_slice(b"WebAppData").ok()?;mac.update(bot_token.as_bytes());mac.finalize().into_bytes()};let mut mac=HmacSha256::new_from_slice(&secret).ok()?;mac.update(data.join("\n").as_bytes());let expected=hex::encode(mac.finalize().into_bytes());if hash.as_deref()!=Some(expected.as_str()){return None}Some((user_id?,name.unwrap_or_else(||"Telegram user".into())))}

async fn telegram_auth(State(state): State<SharedState>, Json(input): Json<TelegramAuth>) -> Response {let Some(token)=state.telegram_token.as_deref() else{return error_response(StatusCode::SERVICE_UNAVAILABLE,"TELEGRAM_DISABLED","Telegram authentication is not configured")};let Some((telegram_id,name))=verify_telegram(&input.initData,token)else{return error_response(StatusCode::UNAUTHORIZED,"INVALID_TELEGRAM_AUTH","Telegram initData verification failed")};let user=sqlx::query_as::<_,User>("SELECT id,name,role,phone,telegram_id FROM users WHERE telegram_id=$1").bind(telegram_id).fetch_optional(&state.db).await.ok().flatten();let user=match user{Some(v)=>v,None=>{let id=Uuid::new_v4();match sqlx::query_as::<_,User>("INSERT INTO users(id,email,name,password_hash,role,telegram_id) VALUES($1,$2,$3,'telegram','customer',$4) RETURNING id,name,role,phone,telegram_id").bind(id).bind(format!("telegram:{telegram_id}@rohbar.local")).bind(name).bind(telegram_id).fetch_one(&state.db).await{Ok(v)=>v,Err(_)=>return error_response(StatusCode::INTERNAL_SERVER_ERROR,"DB_ERROR","Could not create Telegram user")}}};let token=match create_session(&state,user.id).await{Ok(v)=>v,Err(_)=>return error_response(StatusCode::INTERNAL_SERVER_ERROR,"SESSION_ERROR","Could not create session")};let mut response=envelope(user).into_response();response.headers_mut().insert(header::SET_COOKIE,HeaderValue::from_str(&session_cookie(&token,state.session_cookie_secure)).unwrap());response}

async fn automation_event(State(state): State<SharedState>, headers: HeaderMap, Json(input): Json<EventInput>) -> Response {if let Some(secret)=&state.automation_secret{if headers.get("x-automation-secret").and_then(|v|v.to_str().ok())!=Some(secret.as_str()){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Invalid automation secret")}}else if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};let actor=current_user(&state,&headers).await.map(|u|u.id).unwrap_or_else(Uuid::nil);let exists=sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM shipment_events WHERE id=$1)").bind(input.id).fetch_one(&state.db).await.unwrap_or(false);if exists{return envelope(json!({"accepted":true,"duplicate":true})).into_response()}let _=sqlx::query("INSERT INTO shipment_events(id,shipment_id,event,actor_id,payload) VALUES($1,$2,$3,$4,$5)").bind(input.id).bind(&input.aggregate_id).bind(&input.event).bind(actor).bind(&input.payload).execute(&state.db).await;let _=sqlx::query("INSERT INTO outbox_events(id,event_type,aggregate_id,actor_id,payload) VALUES($1,$2,$3,$4,$5)").bind(input.id).bind(&input.event).bind(&input.aggregate_id).bind(actor).bind(&input.payload).execute(&state.db).await;envelope(json!({"accepted":true,"duplicate":false})).into_response()}

async fn sse(State(state): State<SharedState>, headers: HeaderMap, Path(id): Path<String>) -> Response {if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};let rx=state.realtime.subscribe();let stream=BroadcastStream::new(rx).filter_map(move |item|{match item{Ok(message) if message.shipment.as_ref().map(|s|s.id==id).unwrap_or(false)=>serde_json::to_string(&message).ok().map(|data|Ok::<Event,Infallible>(Event::default().data(data))),_=>None}});Sse::new(stream).keep_alive(KeepAlive::default()).into_response()}

async fn websocket(State(state): State<SharedState>, headers: HeaderMap, ws: WebSocketUpgrade, Query(query): Query<RealtimeQuery>) -> Response {if current_user(&state,&headers).await.is_none(){return error_response(StatusCode::UNAUTHORIZED,"UNAUTHORIZED","Session is not authenticated")};let rx=state.realtime.subscribe();ws.on_upgrade(move |socket| websocket_loop(socket,rx,query.shipment_id))}

async fn websocket_loop(mut socket: WebSocket, mut rx: broadcast::Receiver<RealtimeMessage>, shipment_id: Option<String>) {loop{tokio::select!{message=rx.recv()=>match message{Ok(value)=>{if shipment_id.as_ref().map(|id|value.shipment.as_ref().map(|s|&s.id==id).unwrap_or(false)).unwrap_or(true){if let Ok(text)=serde_json::to_string(&value){if socket.send(Message::Text(text.into())).await.is_err(){break}}}},Err(broadcast::error::RecvError::Lagged(_))=>continue,Err(_)=>break},incoming=socket.recv()=>match incoming{Some(Ok(Message::Ping(data)))=>{if socket.send(Message::Pong(data)).await.is_err(){break}},Some(Ok(Message::Close(_)))|None=>break,_=>{}}}}}

async fn automation_worker(state: SharedState){let mut timer=tokio::time::interval(std::time::Duration::from_secs(2));loop{timer.tick().await;let rows=sqlx::query_as::<_,(Uuid,String,String,Uuid,Value)>("SELECT id,event_type,aggregate_id,actor_id,payload FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 100").fetch_all(&state.db).await.unwrap_or_default();if rows.is_empty(){continue}let mut redis=match state.redis.get_multiplexed_async_connection().await{Ok(v)=>v,Err(e)=>{error!("redis: {e}");continue}};for (id,event_type,aggregate_id,actor_id,payload) in rows{let message=json!({"id":id,"type":event_type,"aggregateId":aggregate_id,"actorId":actor_id,"payload":payload});if let Ok(serialized)=serde_json::to_string(&message){if redis.publish::<_,_,i32>("rohbar:events",serialized).await.is_ok(){let _=sqlx::query("UPDATE outbox_events SET published_at=NOW() WHERE id=$1 AND published_at IS NULL").bind(id).execute(&state.db).await;}}}}}

#[tokio::main]
async fn main(){tracing_subscriber::fmt().with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_|"info".into())).init();dotenvy::dotenv().ok();let database_url=env::var("DATABASE_URL").expect("DATABASE_URL is required");let redis_url=env::var("REDIS_URL").expect("REDIS_URL is required");let db=PgPoolOptions::new().max_connections(env::var("DATABASE_MAX_CONNECTIONS").ok().and_then(|v|v.parse().ok()).unwrap_or(20)).connect(&database_url).await.expect("database connection failed");sqlx::migrate!("./migrations").run(&db).await.expect("database migration failed");let redis=redis::Client::open(redis_url).expect("redis configuration failed");let (realtime,_)=broadcast::channel(512);let state=Arc::new(AppState{db,redis,realtime,telegram_token:env::var("TELEGRAM_BOT_TOKEN").ok().filter(|v|!v.is_empty()),session_cookie_secure:env::var("SESSION_COOKIE_SECURE").map(|v|v!="false").unwrap_or(true),frontend_origin:env::var("FRONTEND_ORIGIN").unwrap_or_else(|_|"https://app.vosiev.com".into()),automation_secret:env::var("AUTOMATION_SECRET").ok().filter(|v|!v.is_empty())});let worker_state=state.clone();tokio::spawn(automation_worker(worker_state));let origin=state.frontend_origin.parse::<HeaderValue>().expect("invalid FRONTEND_ORIGIN");let app=Router::new().route("/api/v1/health",get(health)).route("/api/v1/about",get(about)).route("/api/v1/auth/me",get(me)).route("/api/v1/auth/login",post(login)).route("/api/v1/auth/register",post(register)).route("/api/v1/auth/logout",post(logout)).route("/api/v1/auth/telegram",post(telegram_auth)).route("/api/v1/shipments",get(list_shipments).post(create_shipment)).route("/api/v1/shipments/:id",get(get_shipment)).route("/api/v1/shipments/:id/events",get(shipment_events)).route("/api/v1/shipments/:id/status",post(change_status)).route("/api/v1/shipments/:id/offers",get(offers).post(create_offer)).route("/api/v1/offers/:id/accept",post(accept_offer)).route("/api/v1/fleet",get(fleet).post(create_fleet)).route("/api/v1/drivers/assignments",get(driver_list)).route("/api/v1/shipments/:id/driver",post(driver_assign)).route("/api/v1/notifications",get(notifications)).route("/api/v1/notifications/:id/read",post(notification_read)).route("/api/v1/notifications/read-all",post(notifications_read_all)).route("/api/v1/events",post(automation_event)).route("/api/v1/shipments/:id/stream",get(sse)).route("/api/v1/ws",get(websocket)).with_state(state).layer(CorsLayer::new().allow_origin(origin).allow_credentials(true).allow_methods(tower_http::cors::Any).allow_headers(tower_http::cors::Any)).layer(TraceLayer::new_for_http());let bind=env::var("BIND_ADDR").unwrap_or_else(|_|"0.0.0.0:8080".into());info!("RohBar API listening on {bind}");let listener=tokio::net::TcpListener::bind(&bind).await.expect("bind failed");axum::serve(listener,app).await.expect("server failed")}
