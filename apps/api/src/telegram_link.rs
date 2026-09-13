use crate::{SharedState, json_error, session_user};
use argon2::password_hash::PasswordHash;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use rand::{RngCore, rngs::OsRng};
use serde_json::json;
use sha2::Sha256;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

// Shared with Telegram login: serialize identity lookup/create, link and unlink.
// This lock is held only for short database transactions, never network calls.
pub(crate) async fn lock(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock(724186032)")
        .execute(&mut **tx)
        .await?;
    Ok(())
}

fn digest(secret: &str, code: &str) -> Vec<u8> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(b"rohbar:telegram-account-link:v1\0");
    mac.update(code.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn generate_code() -> Result<String, rand::Error> {
    // Rejection sampling avoids modulo bias and permits leading zeroes.
    loop {
        let mut bytes = [0u8; 4];
        OsRng.try_fill_bytes(&mut bytes)?;
        let value = u32::from_be_bytes(bytes);
        if value < u32::MAX - u32::MAX % 1_000_000 {
            return Ok(format!("{:06}", value % 1_000_000));
        }
    }
}

pub(crate) fn link_command(text: &str) -> Option<Option<&str>> {
    let mut words = text.split_whitespace();
    let command = words.next()?.split('@').next()?;
    if command != "/link" {
        return None;
    }
    let code = words
        .next()
        .filter(|v| v.len() == 6 && v.bytes().all(|c| c.is_ascii_digit()));
    Some(if words.next().is_none() { code } else { None })
}

#[derive(Debug, PartialEq)]
pub(crate) enum Outcome {
    Success,
    Invalid,
    Expired,
    Conflict,
    Limited,
    Unavailable,
}
impl Outcome {
    pub(crate) fn text(&self, tg: bool) -> &'static str {
        match (self, tg) {
            (Self::Success, false) => {
                "Telegram привязан. Войдите в RohBar заново через Telegram: откроется ваш существующий аккаунт. Роль и данные сохранены."
            }
            (Self::Success, true) => {
                "Telegram пайваст шуд. Тавассути Telegram аз нав ба RohBar ворид шавед: ҳисоби мавҷудаи шумо кушода мешавад. Нақш ва маълумот ҳифз шудаанд."
            }
            (Self::Invalid, false) => {
                "Код неверен или уже использован. Получите новый код в настройках нужного аккаунта RohBar и отправьте /link и 6 цифр. Не передавайте код другим людям."
            }
            (Self::Invalid, true) => {
                "Рамз нодуруст ё аллакай истифода шудааст. Дар танзимоти ҳисоби лозимии RohBar рамзи нав гиред ва /link бо 6 рақам фиристед. Рамзро ба дигарон надиҳед."
            }
            (Self::Expired, false) => {
                "Срок кода истёк (10 минут). Получите новый код в настройках RohBar."
            }
            (Self::Expired, true) => {
                "Муҳлати рамз гузашт (10 дақиқа). Дар танзимоти RohBar рамзи нав гиред."
            }
            (Self::Conflict, false) => {
                "Привязка невозможна: один из аккаунтов уже связан или содержит профиль/данные, которые нельзя безопасно удалить. Ничего не изменено. Отвяжите Telegram в исходном аккаунте, если доступен вход по почте и паролю; иначе обратитесь в поддержку."
            }
            (Self::Conflict, true) => {
                "Пайвасткунӣ имкон надорад: яке аз ҳисобҳо аллакай пайваст аст ё профил/маълумоте дорад, ки бехатар нест кардан мумкин нест. Ҳеҷ чиз тағйир наёфт. Агар воридшавӣ бо почта ва рамз дастрас бошад, Telegram-ро аз ҳисоби аввал ҷудо кунед; вагарна ба дастгирӣ муроҷиат кунед."
            }
            (Self::Limited, false) => {
                "Слишком много попыток. Подождите 10 минут и получите новый код в настройках RohBar."
            }
            (Self::Limited, true) => {
                "Кӯшишҳо аз ҳад зиёданд. 10 дақиқа интизор шавед ва дар танзимоти RohBar рамзи нав гиред."
            }
            (Self::Unavailable, false) => "Привязка временно недоступна. Попробуйте позже.",
            (Self::Unavailable, true) => {
                "Пайвасткунӣ муваққатан дастнорас аст. Баъдтар кӯшиш кунед."
            }
        }
    }
}

// Both counters updated atomically; failures/timeouts never permit an attempt.
async fn rate_limit(
    state: &SharedState,
    scope: &str,
    identity: &str,
    limit: i64,
) -> Result<bool, ()> {
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        let mut conn = state.redis.get_multiplexed_async_connection().await?;
        redis::Script::new(
            r#"
            for i=1,2 do
                local n=redis.call('INCR',KEYS[i])
                if n==1 then redis.call('EXPIRE',KEYS[i],600) end
                if n>tonumber(ARGV[i]) then return 0 end
            end
            return 1
        "#,
        )
        .key(format!("rohbar:telegram-link:{scope}:{identity}"))
        .key(format!("rohbar:telegram-link:{scope}:global"))
        .arg(limit)
        .arg(100)
        .invoke_async::<i64>(&mut conn)
        .await
    })
    .await
    .map_err(|_| ())?
    .map(|v| v == 1)
    .map_err(|_| ())
}

fn failure() -> Response {
    json_error(
        StatusCode::SERVICE_UNAVAILABLE,
        "Telegram linking unavailable",
    )
}
fn no_store(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}

fn alternative_login(enabled: bool, hash: &str) -> bool {
    enabled
        && PasswordHash::new(hash).is_ok_and(|hash| {
            matches!(hash.algorithm.as_str(), "argon2id" | "argon2i" | "argon2d")
                && hash.salt.is_some()
                && hash.hash.is_some()
        })
}

pub async fn status(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(u) => u,
        Err(e) => return e,
    };
    match sqlx::query_as::<_, (Option<i64>, bool, String)>("SELECT telegram_id, password_login_enabled AND email NOT LIKE 'telegram-%@rohbar.local', password_hash FROM users WHERE id=$1")
        .bind(user.id).fetch_one(&state.db).await {
        Ok((id, enabled, hash))=> no_store(Json(json!({"data":{"telegram_id":id,"can_unlink":id.is_some() && alternative_login(enabled, &hash)}})).into_response()),
        Err(_)=>failure(),
    }
}

pub async fn issue(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(u) => u,
        Err(e) => return e,
    };
    let Some(secret) = state
        .telegram_token
        .as_deref()
        .filter(|_| state.telegram_webhook_secret.is_some())
    else {
        return failure();
    };
    match rate_limit(&state, "issue", &user.id.to_string(), 3).await {
        Ok(true) => {}
        Ok(false) => {
            return json_error(
                StatusCode::TOO_MANY_REQUESTS,
                "Telegram link rate limit exceeded",
            );
        }
        Err(()) => return failure(),
    }
    match issue_code(
        &state.db,
        user.id,
        secret,
        Some(user.telegram_session_version),
    )
    .await
    {
        Ok(Some((code, expires_at))) => {
            no_store(Json(json!({"data":{"code":code,"expires_at":expires_at}})).into_response())
        }
        Ok(None) => json_error(StatusCode::CONFLICT, "Telegram account already linked"),
        Err(_) => failure(),
    }
}

async fn issue_code(
    db: &PgPool,
    user_id: Uuid,
    secret: &str,
    expected_version: Option<i64>,
) -> Result<Option<(String, DateTime<Utc>)>, sqlx::Error> {
    let mut tx = db.begin().await?;
    lock(&mut tx).await?;
    let linked = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT telegram_id FROM users WHERE id=$1 AND ($2::bigint IS NULL OR telegram_session_version=$2) FOR UPDATE",
    )
    .bind(user_id).bind(expected_version)
    .fetch_one(&mut *tx)
    .await?;
    if linked.is_some() {
        return Ok(None);
    }
    // Retain used/expired digests for a day to prevent immediate cross-account reuse.
    sqlx::query("DELETE FROM telegram_link_codes WHERE expires_at < NOW()-INTERVAL '1 day'")
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE telegram_link_codes SET retired_at=NOW() WHERE user_id=$1 AND retired_at IS NULL",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    for _ in 0..32 {
        let code = generate_code()
            .map_err(|_| sqlx::Error::Protocol("Random generation failed".into()))?;
        let expiry=sqlx::query_scalar::<_,DateTime<Utc>>("INSERT INTO telegram_link_codes(digest,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes') ON CONFLICT(digest) DO NOTHING RETURNING expires_at")
            .bind(digest(secret,&code)).bind(user_id).fetch_optional(&mut *tx).await?;
        if let Some(expiry) = expiry {
            tx.commit().await?;
            return Ok(Some((code, expiry)));
        }
    }
    Err(sqlx::Error::Protocol("Code allocation failed".into()))
}

pub(crate) async fn redeem(state: &SharedState, sender: i64, code: Option<&str>) -> Outcome {
    if sender <= 0 {
        return Outcome::Invalid;
    }
    match rate_limit(state, "redeem", &sender.to_string(), 5).await {
        Ok(true) => {}
        Ok(false) => return Outcome::Limited,
        Err(()) => return Outcome::Unavailable,
    }
    let Some(code) = code else {
        return Outcome::Invalid;
    };
    let Some(secret) = state.telegram_token.as_deref() else {
        return Outcome::Unavailable;
    };
    consume(&state.db, sender, &digest(secret, code))
        .await
        .unwrap_or(Outcome::Unavailable)
}

async fn consume(db: &PgPool, sender: i64, digest: &[u8]) -> Result<Outcome, sqlx::Error> {
    let mut tx = db.begin().await?;
    lock(&mut tx).await?;
    let row=sqlx::query_as::<_,(Uuid,bool,bool,Option<i64>)>("SELECT user_id, expires_at<=clock_timestamp(), retired_at IS NOT NULL, redeemed_by FROM telegram_link_codes WHERE digest=$1 FOR UPDATE")
        .bind(digest).fetch_optional(&mut *tx).await?;
    let Some((target, expired, retired, redeemed_by)) = row else {
        return Ok(Outcome::Invalid);
    };
    if retired {
        // Duplicate webhook delivery repeats only the reply, never the mutation.
        let still_linked = redeemed_by == Some(sender)
            && sqlx::query_scalar::<_, bool>(
                "SELECT COALESCE(telegram_id=$2,FALSE) FROM users WHERE id=$1",
            )
            .bind(target)
            .bind(sender)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(false);
        return Ok(if still_linked {
            Outcome::Success
        } else {
            Outcome::Invalid
        });
    }
    if expired {
        return Ok(Outcome::Expired);
    }
    let target_identity = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT telegram_id FROM users WHERE id=$1 FOR UPDATE",
    )
    .bind(target)
    .fetch_one(&mut *tx)
    .await?;
    if target_identity.is_some_and(|id| id != sender) {
        return Ok(Outcome::Conflict);
    }
    let owner=sqlx::query_as::<_,(Uuid,bool)>("SELECT id, telegram_placeholder AND NOT password_login_enabled AND role='customer' AND phone IS NULL AND email='telegram-'||($1::bigint)::text||'@rohbar.local' FROM users WHERE telegram_id=$1 FOR UPDATE")
        .bind(sender).fetch_optional(&mut *tx).await?;
    if let Some((owner, disposable)) = owner
        && owner != target
    {
        if !disposable
            || sqlx::query_scalar::<_, bool>("SELECT telegram_placeholder_has_references($1)")
                .bind(owner)
                .fetch_one(&mut *tx)
                .await?
        {
            return Ok(Outcome::Conflict);
        }
        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(owner)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE users SET telegram_id=$1,telegram_placeholder=FALSE WHERE id=$2")
        .bind(sender)
        .bind(target)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE telegram_link_codes SET retired_at=NOW(),redeemed_by=$2 WHERE user_id=$1 AND retired_at IS NULL",
    )
    .bind(target).bind(sender)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Outcome::Success)
}

pub async fn unlink(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    let user = match session_user(&headers, &state).await {
        Ok(u) => u,
        Err(e) => return e,
    };
    match unlink_account(&state.db, user.id, Some(user.telegram_session_version)).await {
        Ok(true) => {
            let cookie = match crate::create_session(&state, user.id).await {
                Ok(cookie) => cookie,
                Err(e) => return e,
            };
            let mut response = no_store(
                Json(json!({"data":{"telegram_id":null,"can_unlink":false}})).into_response(),
            );
            response.headers_mut().insert(header::SET_COOKIE, cookie);
            response
        }
        Ok(false) => json_error(StatusCode::CONFLICT, "Alternative login required"),
        Err(_) => failure(),
    }
}

async fn unlink_account(
    db: &PgPool,
    id: Uuid,
    expected_version: Option<i64>,
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    lock(&mut tx).await?;
    let (linked,enabled,hash)=sqlx::query_as::<_,(Option<i64>,bool,String)>("SELECT telegram_id,password_login_enabled AND email NOT LIKE 'telegram-%@rohbar.local',password_hash FROM users WHERE id=$1 AND ($2::bigint IS NULL OR telegram_session_version=$2) FOR UPDATE").bind(id).bind(expected_version).fetch_one(&mut *tx).await?;
    if linked.is_some() && !alternative_login(enabled, &hash) {
        return Ok(false);
    }
    sqlx::query("UPDATE users SET telegram_id=NULL,telegram_placeholder=FALSE,telegram_session_version=telegram_session_version+1 WHERE id=$1").bind(id).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE telegram_link_codes SET retired_at=NOW() WHERE user_id=$1 AND retired_at IS NULL",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_codes_and_commands() {
        for text in ["/link 000001", "/link@rohbar_bot 000001"] {
            assert_eq!(link_command(text), Some(Some("000001")));
        }
        for text in [
            "/link",
            "/link 12345",
            "/link 1234567",
            "/link １２３４５６",
            "/link 123456 extra",
            "/link -12345",
        ] {
            assert_eq!(link_command(text), Some(None));
        }
        assert_eq!(link_command("/help"), None);
        for _ in 0..100 {
            let code = generate_code().unwrap();
            assert_eq!(
                link_command(&format!("/link {code}")),
                Some(Some(code.as_str()))
            );
        }
        assert_eq!(digest("test-key", "123456").len(), 32);
        assert_ne!(digest("test-key", "123456"), digest("other-key", "123456"));
        assert_ne!(digest("test-key", "123456"), digest("test-key", "123457"));
        for outcome in [
            Outcome::Success,
            Outcome::Invalid,
            Outcome::Expired,
            Outcome::Conflict,
            Outcome::Limited,
            Outcome::Unavailable,
        ] {
            assert_ne!(outcome.text(false), outcome.text(true));
        }
    }

    fn test_password_hash() -> &'static str {
        use argon2::password_hash::{PasswordHasher, SaltString};
        static HASH: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
            argon2::Argon2::default()
                .hash_password(
                    b"test-only-password",
                    &SaltString::encode_b64(b"test-only-salt16").unwrap(),
                )
                .unwrap()
                .to_string()
        });
        &HASH
    }

    async fn account(db: &PgPool, telegram: Option<i64>, placeholder: bool) -> Uuid {
        let id = Uuid::new_v4();
        let email = if let Some(tg) = telegram {
            format!("telegram-{tg}@rohbar.local")
        } else {
            format!("{id}@example.test")
        };
        sqlx::query("INSERT INTO users(id,email,name,password_hash,role,telegram_id,telegram_placeholder,password_login_enabled) VALUES($1,$2,'Original profile',$6,'customer',$3,$4,$5)")
            .bind(id).bind(email).bind(telegram).bind(placeholder).bind(telegram.is_none()).bind(test_password_hash()).execute(db).await.unwrap();
        id
    }
    async fn code(db: &PgPool, id: Uuid) -> String {
        issue_code(db, id, "test-key", None)
            .await
            .unwrap()
            .unwrap()
            .0
    }
    async fn use_code(db: &PgPool, sender: i64, code: &str) -> Outcome {
        consume(db, sender, &digest("test-key", code))
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn database_linking_invariants() {
        let Ok(url) =
            std::env::var("ROHBAR_TEST_DATABASE_URL").or_else(|_| std::env::var("DATABASE_URL"))
        else {
            eprintln!(
                "SKIP database_linking_invariants: set ROHBAR_TEST_DATABASE_URL to an isolated test database"
            );
            return;
        };
        let admin = PgPool::connect(&url).await.unwrap();
        let schema = format!("telegram_test_{}", Uuid::new_v4().simple());
        sqlx::query(&format!("CREATE SCHEMA {schema}"))
            .execute(&admin)
            .await
            .unwrap();
        let search_path = format!("SET search_path TO {schema}");
        let db = sqlx::postgres::PgPoolOptions::new()
            .max_connections(6)
            .after_connect(move |conn, _| {
                let sql = search_path.clone();
                Box::pin(async move {
                    sqlx::query(&sql).execute(conn).await?;
                    Ok(())
                })
            })
            .connect(&url)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        let target = account(&db, None, false).await;
        sqlx::query("UPDATE users SET role='carrier',phone='+992123456789' WHERE id=$1")
            .bind(target)
            .execute(&db)
            .await
            .unwrap();
        let first = code(&db, target).await;
        let second = code(&db, target).await;
        assert_ne!(first, second);
        assert_eq!(use_code(&db, 41, &first).await, Outcome::Invalid);
        let ttl:bool=sqlx::query_scalar("SELECT expires_at BETWEEN NOW()+INTERVAL '9 minutes' AND NOW()+INTERVAL '10 minutes' FROM telegram_link_codes WHERE digest=$1").bind(digest("test-key",&second)).fetch_one(&db).await.unwrap();
        assert!(ttl);
        // Different identities compete for a single code: exactly one binds.
        let (a, b) = tokio::join!(use_code(&db, 41, &second), use_code(&db, 42, &second));
        assert!(matches!(
            (&a, &b),
            (Outcome::Success, Outcome::Invalid) | (Outcome::Invalid, Outcome::Success)
        ));
        let sender = if a == Outcome::Success { 41 } else { 42 };
        assert_eq!(use_code(&db, sender, &second).await, Outcome::Success);
        let preserved: (String, String, Option<String>) =
            sqlx::query_as("SELECT name,role,phone FROM users WHERE id=$1")
                .bind(target)
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(
            preserved,
            (
                "Original profile".into(),
                "carrier".into(),
                Some("+992123456789".into())
            )
        );
        assert!(
            issue_code(&db, target, "test-key", None)
                .await
                .unwrap()
                .is_none()
        );
        assert!(unlink_account(&db, target, None).await.unwrap());
        assert_eq!(use_code(&db, sender, &second).await, Outcome::Invalid);
        let version: i64 =
            sqlx::query_scalar("SELECT telegram_session_version FROM users WHERE id=$1")
                .bind(target)
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(version, 1);
        assert!(issue_code(&db, target, "test-key", Some(0)).await.is_err());
        assert!(unlink_account(&db, target, Some(0)).await.is_err());
        assert!(!alternative_login(true, "$argon2id$invalid"));
        assert!(!alternative_login(false, test_password_hash()));
        let expired = code(&db, target).await;
        sqlx::query(
            "UPDATE telegram_link_codes SET expires_at=NOW()-INTERVAL '1 second' WHERE digest=$1",
        )
        .bind(digest("test-key", &expired))
        .execute(&db)
        .await
        .unwrap();
        assert_eq!(use_code(&db, 43, &expired).await, Outcome::Expired);
        let cancelled = code(&db, target).await;
        assert!(unlink_account(&db, target, None).await.unwrap());
        assert_eq!(use_code(&db, 43, &cancelled).await, Outcome::Invalid);
        // Only a proven pristine placeholder may be deleted.
        let placeholder = account(&db, Some(50), true).await;
        assert!(!unlink_account(&db, placeholder, None).await.unwrap());
        let fresh = code(&db, target).await;
        assert_eq!(use_code(&db, 50, &fresh).await, Outcome::Success);
        assert!(
            !sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)")
                .bind(placeholder)
                .fetch_one(&db)
                .await
                .unwrap()
        );
        assert!(unlink_account(&db, target, None).await.unwrap());
        for (identity, edited, referenced, proven) in [
            (51, false, false, false),
            (52, true, false, true),
            (53, false, true, true),
        ] {
            let other = account(&db, Some(identity), proven).await;
            if edited {
                sqlx::query("UPDATE users SET name='Edited profile' WHERE id=$1")
                    .bind(other)
                    .execute(&db)
                    .await
                    .unwrap();
            }
            if referenced {
                sqlx::query("INSERT INTO notifications(id,user_id,title,text,type) VALUES($1,$2,'Owned','Data','info')").bind(Uuid::new_v4()).bind(other).execute(&db).await.unwrap();
            }
            let fresh = code(&db, target).await;
            assert_eq!(use_code(&db, identity, &fresh).await, Outcome::Conflict);
            assert!(
                sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND telegram_id=$2)"
                )
                .bind(other)
                .bind(identity)
                .fetch_one(&db)
                .await
                .unwrap()
            );
        }
        // Future FK references with cascading deletion also block disposal.
        sqlx::query(
            "CREATE TABLE future_owned_data(user_id UUID REFERENCES users(id) ON DELETE CASCADE)",
        )
        .execute(&db)
        .await
        .unwrap();
        let future = account(&db, Some(54), true).await;
        sqlx::query("INSERT INTO future_owned_data VALUES($1)")
            .bind(future)
            .execute(&db)
            .await
            .unwrap();
        let fresh = code(&db, target).await;
        assert_eq!(use_code(&db, 54, &fresh).await, Outcome::Conflict);
        // Changing the target identity after issuing a code cannot overwrite it.
        sqlx::query("UPDATE users SET telegram_id=99 WHERE id=$1")
            .bind(target)
            .execute(&db)
            .await
            .unwrap();
        assert_eq!(use_code(&db, 55, &fresh).await, Outcome::Conflict);
        // Same identity with a still-active code consumes safely.
        assert_eq!(use_code(&db, 99, &fresh).await, Outcome::Success);
        if let Ok(redis_url) =
            std::env::var("ROHBAR_TEST_REDIS_URL").or_else(|_| std::env::var("REDIS_URL"))
        {
            let (realtime, _) = tokio::sync::broadcast::channel(1);
            let state = std::sync::Arc::new(crate::AppState {
                db: db.clone(),
                redis: redis::Client::open(redis_url).unwrap(),
                realtime,
                telegram_token: Some("test-key".into()),
                telegram_webhook_secret: Some("test-webhook".into()),
                session_cookie_secure: false,
                frontend_origin: "https://example.test".into(),
                automation_secret: None,
            });
            assert_eq!(
                issue(State(state.clone()), HeaderMap::new()).await.status(),
                StatusCode::UNAUTHORIZED
            );
            assert_eq!(
                unlink(State(state.clone()), HeaderMap::new())
                    .await
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            let (resolved, telegram_cookie) =
                crate::telegram::authenticate(&state, signed_init_data(99))
                    .await
                    .unwrap();
            assert_eq!(resolved.id, target);
            assert_eq!(resolved.role, "carrier");
            assert!(crate::verify_user_password(&db, target, "test-only-password").await);
            let normal_cookie = crate::create_session(&state, target).await.unwrap();
            let mut headers = HeaderMap::new();
            headers.insert(header::COOKIE, telegram_cookie.clone());
            assert_eq!(session_user(&headers, &state).await.unwrap().id, target);
            // Include a session from before the migration (bare UUID).
            let mut conn = state
                .redis
                .get_multiplexed_async_connection()
                .await
                .unwrap();
            let legacy_sid = Uuid::new_v4().to_string();
            let _: () = redis::cmd("SET")
                .arg(format!("rohbar:session:{legacy_sid}"))
                .arg(target.to_string())
                .arg("EX")
                .arg(60)
                .query_async(&mut conn)
                .await
                .unwrap();
            let response = unlink(State(state.clone()), headers.clone()).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            assert!(session_user(&headers, &state).await.is_err());
            headers.insert(header::COOKIE, normal_cookie);
            assert!(session_user(&headers, &state).await.is_err());
            headers.insert(header::COOKIE, crate::session_cookie(&legacy_sid, false));
            assert!(session_user(&headers, &state).await.is_err());
            headers.insert(
                header::COOKIE,
                response.headers()[header::SET_COOKIE].clone(),
            );
            assert_eq!(session_user(&headers, &state).await.unwrap().id, target);
            let issued = issue(State(state.clone()), headers.clone()).await;
            assert_eq!(issued.status(), StatusCode::OK);
            assert_eq!(issued.headers()[header::CACHE_CONTROL], "no-store");
            let body = axum::body::to_bytes(issued.into_body(), 4096)
                .await
                .unwrap();
            let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
            let link_code = body["data"]["code"].as_str().unwrap();
            // Concurrent login/creation and linking share the identity lock.
            let (login, linked) = tokio::join!(
                crate::telegram::authenticate(&state, signed_init_data(100)),
                use_code(&db, 100, link_code)
            );
            login.unwrap();
            assert_eq!(linked, Outcome::Success);
            let (resolved, _) = crate::telegram::authenticate(&state, signed_init_data(100))
                .await
                .unwrap();
            assert_eq!(resolved.id, target);
            let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE telegram_id=100 OR email='telegram-100@rohbar.local'").fetch_one(&db).await.unwrap();
            assert_eq!(count, 1);
        }
        db.close().await;
        sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
            .execute(&admin)
            .await
            .unwrap();
        admin.close().await;
    }

    fn signed_init_data(id: i64) -> String {
        let now = Utc::now().timestamp();
        let user = format!(r#"{{"id":{id},"first_name":"Telegram"}}"#);
        let mut secret = Hmac::<Sha256>::new_from_slice(b"WebAppData").unwrap();
        secret.update(b"test-key");
        let mut mac = Hmac::<Sha256>::new_from_slice(&secret.finalize().into_bytes()).unwrap();
        mac.update(format!("auth_date={now}\nuser={user}").as_bytes());
        format!(
            "auth_date={now}&user={user}&hash={}",
            hex::encode(mac.finalize().into_bytes())
        )
    }

    #[tokio::test]
    async fn redis_limits_are_atomic_and_fail_closed() {
        let db = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@127.0.0.1:1/unused")
            .unwrap();
        let (realtime, _) = tokio::sync::broadcast::channel(1);
        let state = crate::AppState {
            db,
            redis: redis::Client::open("redis://127.0.0.1:1/").unwrap(),
            realtime,
            telegram_token: Some("test-key".into()),
            telegram_webhook_secret: Some("test-webhook".into()),
            session_cookie_secure: false,
            frontend_origin: "https://example.test".into(),
            automation_secret: None,
        };
        let mut state = std::sync::Arc::new(state);
        assert_eq!(
            redeem(&state, 42, Some("123456")).await,
            Outcome::Unavailable
        );
        let Ok(url) =
            std::env::var("ROHBAR_TEST_REDIS_URL").or_else(|_| std::env::var("REDIS_URL"))
        else {
            return;
        };
        std::sync::Arc::get_mut(&mut state).unwrap().redis = redis::Client::open(url).unwrap();
        let scope = format!("test-{}", Uuid::new_v4());
        let (a, b, c, d) = tokio::join!(
            rate_limit(&state, &scope, "one", 3),
            rate_limit(&state, &scope, "one", 3),
            rate_limit(&state, &scope, "one", 3),
            rate_limit(&state, &scope, "one", 3)
        );
        assert_eq!(
            [a, b, c, d].into_iter().filter(|r| *r == Ok(true)).count(),
            3
        );
        assert_eq!(rate_limit(&state, &scope, "two", 3).await, Ok(true));
        let mut conn = state
            .redis
            .get_multiplexed_async_connection()
            .await
            .unwrap();
        let ttl: i64 = redis::cmd("TTL")
            .arg(format!("rohbar:telegram-link:{scope}:one"))
            .query_async(&mut conn)
            .await
            .unwrap();
        assert!((1..=600).contains(&ttl));
        let _: () = redis::cmd("SET")
            .arg(format!("rohbar:telegram-link:{scope}:global"))
            .arg(100)
            .arg("EX")
            .arg(600)
            .query_async(&mut conn)
            .await
            .unwrap();
        assert_eq!(rate_limit(&state, &scope, "three", 3).await, Ok(false));
    }
}
