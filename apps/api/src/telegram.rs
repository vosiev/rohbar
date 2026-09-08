use crate::{SharedState, User, create_session};
use argon2::{Argon2, password_hash::{PasswordHasher, SaltString}};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct Update {
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    chat: Chat,
    text: Option<String>,
}

#[derive(Deserialize)]
struct Chat {
    id: i64,
}

#[derive(Deserialize)]
struct TelegramUser {
    id: i64,
    first_name: String,
    last_name: Option<String>,
}

type HmacSha256 = Hmac<Sha256>;

pub async fn webhook(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(update): Json<Update>,
) -> impl IntoResponse {
    let Some(expected) = state.telegram_webhook_secret.as_deref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":"Telegram webhook is not configured"})),
        );
    };
    if headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|v| v.to_str().ok())
        != Some(expected)
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error":"invalid webhook secret"})),
        );
    }
    let Some(token) = state.telegram_token.as_deref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":"Telegram bot is not configured"})),
        );
    };
    let Some(message) = update.message else {
        return (StatusCode::OK, Json(json!({"ok":true})));
    };
    let text = message.text.unwrap_or_default();
    let response = match text.split_whitespace().next().unwrap_or("") {
        "/start" => "RohBar подключён. Откройте Mini App для управления перевозками.",
        "/help" => "RohBar: заявки, предложения, рейсы и уведомления доступны в Mini App.",
        _ => "Используйте /start или откройте RohBar Mini App.",
    };
    let url = format!("https://api.telegram.org/bot{token}/sendMessage");
    let client = reqwest::Client::new();
    let _ = client
        .post(url)
        .json(&json!({"chat_id":message.chat.id,"text":response}))
        .send()
        .await;
    (StatusCode::OK, Json(json!({"ok":true})))
}

pub async fn authenticate(
    state: &SharedState,
    init_data: String,
) -> Result<(User, HeaderValue), Response> {
    let token = state.telegram_token.as_deref().ok_or_else(|| {
        crate::json_error(StatusCode::SERVICE_UNAVAILABLE, "Telegram bot is not configured")
    })?;

    let url = reqwest::Url::parse(&format!("https://rohbar.local/?{init_data}")).map_err(|_| {
        crate::json_error(StatusCode::BAD_REQUEST, "Invalid Telegram init data")
    })?;
    let mut pairs = Vec::new();
    let mut received_hash = None;
    let mut user_json = None;
    let mut auth_date = None;

    for (key, value) in url.query_pairs() {
        if key == "hash" {
            received_hash = Some(value.into_owned());
            continue;
        }
        if key == "user" {
            user_json = Some(value.to_string());
        }
        if key == "auth_date" {
            auth_date = value.parse::<i64>().ok();
        }
        pairs.push((key.into_owned(), value.into_owned()));
    }

    let received_hash = received_hash.ok_or_else(|| {
        crate::json_error(StatusCode::UNAUTHORIZED, "Telegram signature is missing")
    })?;
    pairs.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    let data_check_string = pairs
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("\n");

    let mut secret_mac = HmacSha256::new_from_slice(b"WebAppData")
        .expect("HMAC accepts keys of arbitrary length");
    secret_mac.update(token.as_bytes());
    let secret_key = secret_mac.finalize().into_bytes();

    let mut check_mac = HmacSha256::new_from_slice(&secret_key)
        .expect("HMAC accepts keys of arbitrary length");
    check_mac.update(data_check_string.as_bytes());
    let calculated_hash = hex::encode(check_mac.finalize().into_bytes());

    if !constant_time_equal(calculated_hash.as_bytes(), received_hash.as_bytes()) {
        return Err(crate::json_error(
            StatusCode::UNAUTHORIZED,
            "Invalid Telegram signature",
        ));
    }

    let auth_date = auth_date.ok_or_else(|| {
        crate::json_error(StatusCode::UNAUTHORIZED, "Telegram auth date is missing")
    })?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, "System clock error"))?
        .as_secs() as i64;
    if auth_date > now + 60 || now.saturating_sub(auth_date) > 86_400 {
        return Err(crate::json_error(
            StatusCode::UNAUTHORIZED,
            "Telegram init data has expired",
        ));
    }

    let user_json = user_json.ok_or_else(|| {
        crate::json_error(StatusCode::UNAUTHORIZED, "Telegram user is missing")
    })?;
    let telegram_user: TelegramUser = serde_json::from_str(&user_json).map_err(|_| {
        crate::json_error(StatusCode::UNAUTHORIZED, "Invalid Telegram user data")
    })?;

    let name = match telegram_user.last_name.as_deref() {
        Some(last_name) if !last_name.is_empty() => {
            format!("{} {last_name}", telegram_user.first_name)
        }
        _ => telegram_user.first_name.clone(),
    };
    let email = format!("telegram-{}@rohbar.local", telegram_user.id);
    let password = UuidLikePassword::new(telegram_user.id);
    let salt = SaltString::generate(&mut rand::thread_rng());
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"))?
        .to_string();

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users(id,email,name,password_hash,role,telegram_id) VALUES($1,$2,$3,$4,'customer',$5) ON CONFLICT (telegram_id) DO UPDATE SET name=EXCLUDED.name RETURNING id,name,role,phone,telegram_id",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(email)
    .bind(name)
    .bind(password_hash)
    .bind(telegram_user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Telegram user storage failed"))?;

    let cookie = create_session(state, user.id).await?;
    Ok((user, cookie))
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        difference |= a ^ b;
    }
    difference == 0
}

struct UuidLikePassword([u8; 16]);

impl UuidLikePassword {
    fn new(id: i64) -> Self {
        let mut value = [0u8; 16];
        value[..8].copy_from_slice(&id.to_be_bytes());
        value[8..].copy_from_slice(&(!id).to_be_bytes());
        Self(value)
    }

    fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

pub async fn set_webhook(state: &SharedState, webhook_url: &str) -> Result<Value, reqwest::Error> {
    let token = state.telegram_token.as_deref().unwrap_or("");
    let secret = state.telegram_webhook_secret.as_deref().unwrap_or("");
    let url = format!("https://api.telegram.org/bot{token}/setWebhook");
    reqwest::Client::new()
        .post(url)
        .json(&json!({"url":webhook_url,"secret_token":secret,"allowed_updates":["message"]}))
        .send()
        .await?
        .json()
        .await
}
