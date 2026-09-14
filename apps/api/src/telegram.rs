use crate::{SharedState, User, telegram_link};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use rand::{RngCore, rngs::OsRng};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::json;
use sha2::Sha256;
use std::{
    collections::HashSet,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Deserialize)]
pub(crate) struct Update {
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    chat: Chat,
    text: Option<String>,
    from: Option<Sender>,
}

#[derive(Deserialize)]
struct Sender {
    #[serde(default)]
    id: i64,
    #[serde(default)]
    is_bot: bool,
    language_code: Option<String>,
}

#[derive(Deserialize)]
struct Chat {
    id: i64,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Debug, Deserialize)]
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
    if !headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|value| constant_time_equal(value.as_bytes(), expected.as_bytes()))
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
    // Web App inline buttons are supported only in private chats.
    if message.chat.kind != "private" {
        return (StatusCode::OK, Json(json!({"ok":true})));
    }
    let mut payload = bot_reply(&message, &state.frontend_origin);
    if let Some(code) = telegram_link::link_command(message.text.as_deref().unwrap_or_default()) {
        let outcome = if let Some(sender) = &message.from
            && !sender.is_bot
            && sender.id == message.chat.id
            && sender.id > 0
        {
            telegram_link::redeem(&state, sender.id, code).await
        } else {
            telegram_link::Outcome::Invalid
        };
        let tg = message
            .from
            .as_ref()
            .and_then(|s| s.language_code.as_deref())
            == Some("tg");
        payload["text"] = json!(outcome.text(tg));
    }
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            tracing::error!("Telegram sendMessage client initialization failed");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error":"Telegram send failed"})),
            );
        }
    };
    let result = client
        .post(format!("https://api.telegram.org/bot{token}/sendMessage"))
        .json(&payload)
        .send()
        .await;
    let delivered = match result {
        Ok(response) => {
            let status = response.status();
            let body = response.json::<BotResponse>().await;
            let ok = status.is_success() && body.as_ref().is_ok_and(|body| body.ok);
            if !ok {
                tracing::warn!(
                    http_status = status.as_u16(),
                    error_code = body.ok().and_then(|body| body.error_code),
                    "Telegram sendMessage rejected"
                );
            }
            ok
        }
        Err(error) => {
            // reqwest errors can contain the URL, including the bot token.
            tracing::warn!(
                timeout = error.is_timeout(),
                connect = error.is_connect(),
                "Telegram sendMessage transport failed"
            );
            false
        }
    };
    if !delivered {
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error":"Telegram send failed"})),
        );
    }
    (StatusCode::OK, Json(json!({"ok":true})))
}

// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.
#[allow(clippy::result_large_err)]
pub async fn authenticate(
    state: &SharedState,
    init_data: String,
) -> Result<(User, HeaderValue), Response> {
    let token = state.telegram_token.as_deref().ok_or_else(|| {
        crate::json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Telegram bot is not configured",
        )
    })?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, "System clock error"))?
        .as_secs() as i64;
    let telegram_user = validate_init_data(&init_data, token, now)
        .map_err(|message| crate::json_error(StatusCode::UNAUTHORIZED, message))?;

    let name = match telegram_user.last_name.as_deref() {
        Some(last_name) if !last_name.is_empty() => {
            format!("{} {last_name}", telegram_user.first_name)
        }
        _ => telegram_user.first_name.clone(),
    };
    let email = format!("telegram-{}@rohbar.local", telegram_user.id);
    let stored_hash = sqlx::query_scalar::<_, String>(
        "SELECT password_hash FROM users WHERE telegram_id=$1 AND NOT password_login_enabled",
    )
    .bind(telegram_user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| {
        crate::json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Telegram user storage failed",
        )
    })?;
    let (password_hash, legacy_hash) = tokio::task::spawn_blocking(move || {
        let legacy_hash = stored_hash.filter(|hash| is_legacy_password(hash, telegram_user.id));
        random_password_hash().map(|hash| (hash, legacy_hash))
    })
    .await
    .map_err(|_| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"))?
    .map_err(|message| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, message))?;

    let mut tx = state.db.begin().await.map_err(|_| {
        crate::json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Telegram user storage failed",
        )
    })?;
    telegram_link::lock(&mut tx).await.map_err(|_| {
        crate::json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Telegram user storage failed",
        )
    })?;
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users(id,email,name,password_hash,role,telegram_id,telegram_placeholder,password_login_enabled) VALUES($1,$2,$3,$4,'customer',$5,TRUE,FALSE) ON CONFLICT (telegram_id) DO UPDATE SET password_hash=CASE WHEN users.password_hash=$6 THEN EXCLUDED.password_hash ELSE users.password_hash END RETURNING id,email,name,role,phone,telegram_id",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(email)
    .bind(name)
    .bind(password_hash)
    .bind(telegram_user.id)
    .bind(legacy_hash)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| crate::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Telegram user storage failed"))?;

    let version =
        sqlx::query_scalar::<_, i64>("SELECT telegram_session_version FROM users WHERE id=$1")
            .bind(user.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| {
                crate::json_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Telegram user storage failed",
                )
            })?;
    tx.commit().await.map_err(|_| {
        crate::json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Telegram user storage failed",
        )
    })?;
    let sid = uuid::Uuid::new_v4().to_string();
    let mut conn = state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|_| crate::json_error(StatusCode::SERVICE_UNAVAILABLE, "Redis unavailable"))?;
    let _: () = conn
        .set_ex(
            format!("rohbar:session:{sid}"),
            format!("{}:{version}", user.id),
            604_800,
        )
        .await
        .map_err(|_| {
            crate::json_error(StatusCode::SERVICE_UNAVAILABLE, "Session storage failed")
        })?;
    let cookie = crate::session_cookie(&sid, state.session_cookie_secure);
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

// Only used to recognize and retire credentials created by the old implementation.
fn is_legacy_password(hash: &str, id: i64) -> bool {
    let mut password = [0u8; 16];
    password[..8].copy_from_slice(&id.to_be_bytes());
    password[8..].copy_from_slice(&(!id).to_be_bytes());
    PasswordHash::new(hash)
        .is_ok_and(|hash| Argon2::default().verify_password(&password, &hash).is_ok())
}

fn random_password_hash() -> Result<String, &'static str> {
    let mut password = [0u8; 32];
    OsRng
        .try_fill_bytes(&mut password)
        .map_err(|_| "Password generation failed")?;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(&password, &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| "Password hashing failed")
}

fn validate_init_data(
    init_data: &str,
    token: &str,
    now: i64,
) -> Result<TelegramUser, &'static str> {
    if init_data.is_empty() || init_data.len() > 16_384 || init_data.contains(['\r', '\n', '#']) {
        return Err("Invalid Telegram init data");
    }
    let url = reqwest::Url::parse(&format!("https://rohbar.local/?{init_data}"))
        .map_err(|_| "Invalid Telegram init data")?;
    let mut pairs = Vec::new();
    let mut received_hash = None;
    let mut user_json = None;
    let mut auth_date = None;

    let mut keys = HashSet::new();
    for (key, value) in url.query_pairs() {
        if !keys.insert(key.to_string()) {
            return Err("Duplicate Telegram init data field");
        }
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

    let received_hash = received_hash.ok_or("Telegram signature is missing")?;
    pairs.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    let data_check_string = pairs
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("\n");

    let mut secret_mac =
        HmacSha256::new_from_slice(b"WebAppData").expect("HMAC accepts keys of arbitrary length");
    secret_mac.update(token.as_bytes());
    let secret_key = secret_mac.finalize().into_bytes();

    let mut check_mac =
        HmacSha256::new_from_slice(&secret_key).expect("HMAC accepts keys of arbitrary length");
    check_mac.update(data_check_string.as_bytes());
    let calculated_hash = hex::encode(check_mac.finalize().into_bytes());

    if !constant_time_equal(calculated_hash.as_bytes(), received_hash.as_bytes()) {
        return Err("Invalid Telegram signature");
    }

    let auth_date = auth_date.ok_or("Telegram auth date is missing")?;
    if auth_date > now.saturating_add(60) || now.saturating_sub(auth_date) > 86_400 {
        return Err("Telegram init data has expired");
    }

    let user_json = user_json.ok_or("Telegram user is missing")?;
    let telegram_user: TelegramUser =
        serde_json::from_str(&user_json).map_err(|_| "Invalid Telegram user data")?;

    if telegram_user.id <= 0 {
        return Err("Invalid Telegram user data");
    }
    Ok(telegram_user)
}

#[derive(Deserialize)]
struct BotResponse {
    ok: bool,
    error_code: Option<i64>,
}

fn bot_reply(message: &Message, frontend_origin: &str) -> serde_json::Value {
    let tg = message
        .from
        .as_ref()
        .and_then(|sender| sender.language_code.as_deref())
        == Some("tg");
    let command = message
        .text
        .as_deref()
        .unwrap_or_default()
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .split('@')
        .next()
        .unwrap_or_default();
    let text = match (command, tg) {
        ("/start", false) => {
            "Добро пожаловать в RohBar. Откройте приложение для управления перевозками."
        }
        ("/start", true) => "Хуш омадед ба RohBar. Барои идоракунии боркашонӣ барномаро кушоед.",
        ("/help", false) => {
            "Заявки, предложения, рейсы и уведомления доступны в RohBar. Для привязки существующего аккаунта получите код в настройках и отправьте /link и 6 цифр."
        }
        ("/help", true) => {
            "Дархостҳо, пешниҳодҳо, сафарҳо ва огоҳиномаҳо дар RohBar дастрасанд. Барои пайваст кардани ҳисоби мавҷуда дар танзимот рамз гиред ва /link бо 6 рақам фиристед."
        }
        (_, false) => "Используйте /start или откройте приложение RohBar.",
        (_, true) => "Фармони /start-ро истифода баред ё барномаи RohBar-ро кушоед.",
    };
    json!({"chat_id": message.chat.id, "text": text, "reply_markup": {
        "inline_keyboard": [[{"text": if tg { "Кушодани RohBar" } else { "Открыть RohBar" },
            "web_app": {"url": frontend_origin}}]]
    }})
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fixed HMAC vector generated independently with Python's standard library.
    const VALID: &str = "auth_date=1800000000&query_id=test+%2B+%26+value&signature=signed-field&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22%D0%90%D0%BB%D0%B8+%2B+%26%22%2C%22last_name%22%3A%22%D0%A0%D0%B0%D2%B3%D0%BC%D0%BE%D0%BD%22%7D&hash=06ea48fa3d43b1808c6278a806f1755a32269038ff130c13ab5657ee5ae46ff4";
    const NOW: i64 = 1_800_000_000;

    #[test]
    fn validates_raw_encoded_data_and_all_signed_fields() {
        let user = validate_init_data(VALID, "test-token", NOW).unwrap();
        assert_eq!(user.id, 42);
        assert_eq!(user.first_name, "Али + &");
        assert_eq!(user.last_name.as_deref(), Some("Раҳмон"));
        assert!(validate_init_data(VALID, "wrong-token", NOW).is_err());
        assert!(
            validate_init_data(&VALID.replace("signed-field", "changed"), "test-token", NOW)
                .is_err()
        );
        assert!(
            validate_init_data(
                &VALID.replace("1800000000", "1800000001"),
                "test-token",
                NOW
            )
            .is_err()
        );
    }

    #[test]
    fn enforces_age_and_future_clock_tolerance() {
        assert!(validate_init_data(VALID, "test-token", NOW + 86_400).is_ok());
        assert!(validate_init_data(VALID, "test-token", NOW + 86_401).is_err());
        assert!(validate_init_data(VALID, "test-token", NOW - 60).is_ok());
        assert!(validate_init_data(VALID, "test-token", NOW - 61).is_err());
    }

    #[test]
    fn rejects_missing_malformed_and_ambiguous_input() {
        for input in ["", "user=%7B%7D", "hash=invalid", "#fragment", "hash=a\n"] {
            assert!(validate_init_data(input, "test-token", NOW).is_err());
        }
        for extra in [
            "&user=%7B%7D",
            "&hash=another",
            "&auth_date=1800000000",
            "#ignored",
            "&%75ser=other",
        ] {
            assert!(validate_init_data(&format!("{VALID}{extra}"), "test-token", NOW).is_err());
        }
        assert!(validate_init_data(&"x".repeat(16_385), "test-token", NOW).is_err());
    }

    #[test]
    fn retires_legacy_credentials_without_matching_custom_passwords() {
        let id = 42i64;
        let mut legacy = [0u8; 16];
        legacy[..8].copy_from_slice(&id.to_be_bytes());
        legacy[8..].copy_from_slice(&(!id).to_be_bytes());
        let salt = SaltString::encode_b64(b"test-salt-16byte").unwrap();
        let hash = Argon2::default()
            .hash_password(&legacy, &salt)
            .unwrap()
            .to_string();
        assert!(is_legacy_password(&hash, id));
        assert!(!is_legacy_password(&hash, id + 1));
        let custom = Argon2::default()
            .hash_password(b"user-selected-password", &salt)
            .unwrap()
            .to_string();
        assert!(!is_legacy_password(&custom, id));
        let random = random_password_hash().unwrap();
        assert!(!is_legacy_password(&random, id));
        assert_ne!(random, random_password_hash().unwrap());
    }

    #[test]
    fn webhook_secret_comparison_rejects_changes() {
        assert!(constant_time_equal(b"secret", b"secret"));
        assert!(!constant_time_equal(b"secret", b"secreu"));
        assert!(!constant_time_equal(b"secret", b"secret-extra"));
    }

    #[test]
    fn bot_commands_launch_configured_web_app_in_both_languages() {
        for command in ["/start payload", "/help", "/start@rohbar_bot"] {
            for language in ["ru", "tg"] {
                let message: Message = serde_json::from_value(json!({
                    "chat": {"id": 42, "type": "private"}, "text": command,
                    "from": {"language_code": language}
                }))
                .unwrap();
                let reply = bot_reply(&message, "https://rohbar.vosiev.com");
                let button = &reply["reply_markup"]["inline_keyboard"][0][0];
                assert_eq!(button["web_app"]["url"], "https://rohbar.vosiev.com");
                assert_eq!(
                    button["text"],
                    if language == "tg" {
                        "Кушодани RohBar"
                    } else {
                        "Открыть RohBar"
                    }
                );
                assert_eq!(reply["chat_id"], 42);
            }
        }
    }
}
