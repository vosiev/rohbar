from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


main_path = Path("apps/api/src/main.rs")
main = main_path.read_text()

main = replace_once(
    main,
    "async fn require_role(\n",
    "// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.\n#[allow(clippy::result_large_err)]\nasync fn require_role(\n",
    "require_role lint rationale",
)
main = replace_once(
    main,
    "async fn session_user(headers: &HeaderMap, state: &SharedState) -> Result<User, Response> {",
    "// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.\n#[allow(clippy::result_large_err)]\nasync fn session_user(headers: &HeaderMap, state: &SharedState) -> Result<User, Response> {",
    "session_user lint rationale",
)
main = replace_once(
    main,
    "pub(crate) async fn create_session(\n",
    "// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.\n#[allow(clippy::result_large_err)]\npub(crate) async fn create_session(\n",
    "create_session lint rationale",
)

old_logout = '''    if let Some(cookie) = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.split(';')
                .find_map(|p| p.trim().strip_prefix("rohbar_session="))
        })
    {
        if let Ok(mut connection) = state.redis.get_multiplexed_async_connection().await {
            let _: Result<(), _> = connection.del(format!("rohbar:session:{cookie}")).await;
        }
    }'''
new_logout = '''    if let Some(cookie) = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.split(';')
                .find_map(|p| p.trim().strip_prefix("rohbar_session="))
        })
        && let Ok(mut connection) = state.redis.get_multiplexed_async_connection().await
    {
        let _: Result<(), _> = connection.del(format!("rohbar:session:{cookie}")).await;
    }'''
main = replace_once(main, old_logout, new_logout, "logout collapsible if")
main_path.write_text(main)

telegram_path = Path("apps/api/src/telegram.rs")
telegram = telegram_path.read_text()
telegram = replace_once(
    telegram,
    "pub async fn authenticate(\n",
    "// Axum Response is intentionally propagated unchanged to preserve the exact HTTP error.\n#[allow(clippy::result_large_err)]\npub async fn authenticate(\n",
    "telegram authenticate lint rationale",
)
telegram_path.write_text(telegram)
