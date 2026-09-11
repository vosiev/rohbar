from pathlib import Path

path = Path("apps/api/src/main.rs")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    '        "rohbar_session={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800{}",',
    '        "rohbar_session={sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800{}",',
    "strict session cookie",
)

replace_once(
    '    HeaderValue::from_str(&value).expect("cookie")\n}\npub(crate) async fn create_session(',
    '    HeaderValue::from_str(&value).expect("cookie")\n}\nfn expired_session_cookie(secure: bool) -> HeaderValue {\n    let value = format!(\n        "rohbar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{}",\n        if secure { "; Secure" } else { "" }\n    );\n    HeaderValue::from_str(&value).expect("cookie")\n}\npub(crate) async fn create_session(',
    "expired cookie helper",
)

replace_once(
    '        Err(error) => {\n            let message = if error\n                .as_database_error()\n                .is_some_and(|db_error| db_error.is_unique_violation())\n            {\n                "User already exists"\n            } else {\n                "Unable to create account"\n            };\n            json_error(StatusCode::CONFLICT, message)\n        }',
    '        Err(error) => {\n            if error\n                .as_database_error()\n                .is_some_and(|db_error| db_error.is_unique_violation())\n            {\n                json_error(StatusCode::CONFLICT, "Unable to create account")\n            } else {\n                error!(%error, "registration database error");\n                json_error(StatusCode::INTERNAL_SERVER_ERROR, "Unable to create account")\n            }\n        }',
    "generic registration failure",
)

replace_once(
    '    response.headers_mut().insert(\n        header::SET_COOKIE,\n        HeaderValue::from_static("rohbar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"),\n    );',
    '    response.headers_mut().insert(\n        header::SET_COOKIE,\n        expired_session_cookie(state.session_cookie_secure),\n    );',
    "logout cookie policy",
)

replace_once(
    'async fn session_user(headers: &HeaderMap, state: &SharedState) -> Result<User, Response> {',
    'async fn can_access_shipment(\n    state: &SharedState,\n    user: &User,\n    shipment_id: &str,\n    allow_carrier_marketplace: bool,\n) -> bool {\n    sqlx::query_scalar::<_, bool>(\n        "SELECT EXISTS(SELECT 1 FROM shipments s WHERE s.id=$1 AND (s.customer_id=$2 OR $3=\'admin\' OR ($3=\'driver\' AND EXISTS(SELECT 1 FROM driver_assignments da WHERE da.shipment_id=s.id AND da.driver_id=$2)) OR ($3=\'carrier\' AND (($4 AND s.status IN (\'published\',\'offered\')) OR EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=s.id AND o.carrier_id=$2 AND o.status=\'accepted\')))))",\n    )\n    .bind(shipment_id)\n    .bind(user.id)\n    .bind(&user.role)\n    .bind(allow_carrier_marketplace)\n    .fetch_one(&state.db)\n    .await\n    .unwrap_or(false)\n}\n\nasync fn session_user(headers: &HeaderMap, state: &SharedState) -> Result<User, Response> {',
    "shipment access helper",
)

old_list = '    let result = match user.role.as_str() { "customer" => sqlx::query_as::<_, Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE customer_id=$1 ORDER BY created_at DESC").bind(user.id).fetch_all(&state.db).await, "driver" => sqlx::query_as::<_, Shipment>("SELECT s.id,s.from_city,s.to_city,s.date,s.cargo,s.weight,s.vehicle,s.price,s.status,s.company FROM shipments s INNER JOIN driver_assignments da ON da.shipment_id=s.id WHERE da.driver_id=$1 ORDER BY s.created_at DESC").bind(user.id).fetch_all(&state.db).await, "carrier" | "admin" => sqlx::query_as::<_, Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE status IN (\'published\',\'offered\',\'accepted\',\'in_transit\',\'delivered\',\'completed\') ORDER BY created_at DESC").fetch_all(&state.db).await, _ => return json_error(StatusCode::FORBIDDEN, "Invalid user role") };'
new_list = '''    let result = match user.role.as_str() {
        "customer" => sqlx::query_as::<_, Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE customer_id=$1 ORDER BY created_at DESC").bind(user.id).fetch_all(&state.db).await,
        "driver" => sqlx::query_as::<_, Shipment>("SELECT s.id,s.from_city,s.to_city,s.date,s.cargo,s.weight,s.vehicle,s.price,s.status,s.company FROM shipments s INNER JOIN driver_assignments da ON da.shipment_id=s.id WHERE da.driver_id=$1 ORDER BY s.created_at DESC").bind(user.id).fetch_all(&state.db).await,
        "carrier" => sqlx::query_as::<_, Shipment>("SELECT s.id,s.from_city,s.to_city,s.date,s.cargo,s.weight,s.vehicle,s.price,s.status,s.company FROM shipments s WHERE s.status IN ('published','offered') OR EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=s.id AND o.carrier_id=$1 AND o.status='accepted') ORDER BY s.created_at DESC").bind(user.id).fetch_all(&state.db).await,
        "admin" => sqlx::query_as::<_, Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments ORDER BY created_at DESC").fetch_all(&state.db).await,
        _ => return json_error(StatusCode::FORBIDDEN, "Invalid user role"),
    };'''
replace_once(old_list, new_list, "carrier shipment listing")

replace_once(
    '    let result = sqlx::query_as::<_, Shipment>("SELECT s.id,s.from_city,s.to_city,s.date,s.cargo,s.weight,s.vehicle,s.price,s.status,s.company FROM shipments s WHERE s.id=$1 AND (s.customer_id=$2 OR $3=\'admin\' OR ($3=\'driver\' AND EXISTS (SELECT 1 FROM driver_assignments da WHERE da.shipment_id=s.id AND da.driver_id=$2)) OR ($3=\'carrier\' AND s.status IN (\'published\',\'offered\',\'accepted\',\'in_transit\',\'delivered\',\'completed\')))\").bind(id).bind(user.id).bind(&user.role).fetch_optional(&state.db).await;',
    '    if !can_access_shipment(&state, &user, &id, true).await {\n        return json_error(StatusCode::NOT_FOUND, "Shipment not found");\n    }\n    let result = sqlx::query_as::<_, Shipment>("SELECT id,from_city,to_city,date,cargo,weight,vehicle,price,status,company FROM shipments WHERE id=$1").bind(id).fetch_optional(&state.db).await;',
    "shipment detail authorization",
)

replace_once(
    '    let allowed = match user.role.as_str() { "admin" => true, "customer" => false, "carrier" => matches!(req.status.as_str(), "offered" | "accepted") && sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=$1 AND o.carrier_id=$2)").bind(&id).bind(user.id).fetch_one(&state.db).await.unwrap_or(false), "driver" => matches!(req.status.as_str(), "in_transit" | "delivered" | "completed") && sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM driver_assignments da WHERE da.shipment_id=$1 AND da.driver_id=$2)").bind(&id).bind(user.id).fetch_one(&state.db).await.unwrap_or(false), _ => false };',
    '''    let allowed = match user.role.as_str() {
        "admin" => true,
        "driver" => matches!(req.status.as_str(), "in_transit" | "delivered" | "completed")
            && sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM driver_assignments da WHERE da.shipment_id=$1 AND da.driver_id=$2)")
                .bind(&id)
                .bind(user.id)
                .fetch_one(&state.db)
                .await
                .unwrap_or(false),
        _ => false,
    };''',
    "status role authorization",
)

event_access = '    let allowed = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM shipments s WHERE s.id=$1 AND (s.customer_id=$2 OR $3=\'admin\' OR ($3=\'driver\' AND EXISTS(SELECT 1 FROM driver_assignments da WHERE da.shipment_id=s.id AND da.driver_id=$2)) OR ($3=\'carrier\' AND s.status IN (\'published\',\'offered\',\'accepted\',\'in_transit\',\'delivered\',\'completed\'))))").bind(&id).bind(user.id).bind(&user.role).fetch_one(&state.db).await.unwrap_or(false);\n    if !allowed {\n        return json_error(StatusCode::NOT_FOUND, "Shipment not found");\n    }'
private_access = '    if !can_access_shipment(&state, &user, &id, false).await {\n        return json_error(StatusCode::NOT_FOUND, "Shipment not found");\n    }'
count = text.count(event_access)
if count != 2:
    raise SystemExit(f"private event/stream access: expected 2 matches, found {count}")
text = text.replace(event_access, private_access)

replace_once(
    '    if session_user(&headers, &state).await.is_err() {\n        return json_error(StatusCode::UNAUTHORIZED, "Authentication required");\n    }\n    let shipment = query.get("shipment_id").cloned();\n    upgrade.on_upgrade(move |socket| ws_loop(socket, state, shipment))',
    '''    let user = match session_user(&headers, &state).await {
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
    upgrade.on_upgrade(move |socket| ws_loop(socket, state, Some(shipment_id)))''',
    "websocket authorization",
)

path.write_text(text)

migration = Path("apps/api/migrations/0002_operational_integrity.sql")
sql = migration.read_text()
marker = "CREATE EXTENSION IF NOT EXISTS pgcrypto;\n\n"
if sql.count(marker) != 1:
    raise SystemExit("pgcrypto marker not found exactly once")
migration.write_text(sql.replace(marker, "", 1))
