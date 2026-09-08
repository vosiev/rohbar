use axum::{extract::State, http::{HeaderMap, StatusCode}, response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use crate::SharedState;

#[derive(Deserialize)]
struct Update { message: Option<Message> }
#[derive(Deserialize)]
struct Message { chat: Chat, text: Option<String> }
#[derive(Deserialize)]
struct Chat { id: i64 }

pub async fn webhook(State(state): State<SharedState>, headers: HeaderMap, Json(update): Json<Update>) -> impl IntoResponse {
    let Some(expected)=state.telegram_webhook_secret.as_deref() else { return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"error":"Telegram webhook is not configured"}))); };
    if headers.get("x-telegram-bot-api-secret-token").and_then(|v|v.to_str().ok())!=Some(expected){ return (StatusCode::UNAUTHORIZED, Json(json!({"error":"invalid webhook secret"}))); }
    let Some(token)=state.telegram_token.as_deref() else { return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"error":"Telegram bot is not configured"}))); };
    let Some(message)=update.message else { return (StatusCode::OK, Json(json!({"ok":true}))); };
    let text=message.text.unwrap_or_default();
    let response=match text.split_whitespace().next().unwrap_or("") {
        "/start"=>"RohBar подключён. Откройте Mini App для управления перевозками.",
        "/help"=>"RohBar: заявки, предложения, рейсы и уведомления доступны в Mini App.",
        _=>"Используйте /start или откройте RohBar Mini App.",
    };
    let url=format!("https://api.telegram.org/bot{token}/sendMessage");
    let client=reqwest::Client::new();
    let _=client.post(url).json(&json!({"chat_id":message.chat.id,"text":response})).send().await;
    (StatusCode::OK, Json(json!({"ok":true})))
}

pub async fn set_webhook(state:&SharedState, webhook_url:&str)->Result<Value,reqwest::Error>{
    let token=state.telegram_token.as_deref().unwrap_or("");let secret=state.telegram_webhook_secret.as_deref().unwrap_or("");let url=format!("https://api.telegram.org/bot{token}/setWebhook");reqwest::Client::new().post(url).json(&json!({"url":webhook_url,"secret_token":secret,"allowed_updates":["message"]})).send().await?.json().await
}
