from pathlib import Path

MAIN = Path("apps/api/src/main.rs")
source = MAIN.read_text(encoding="utf-8")

replacements = [
    (
        "mod telegram;\n",
        "mod authz;\nmod telegram;\n",
    ),
    (
        "use axum::{\n    Json, Router,\n",
        "use axum::{\n    Json, Router,\n    middleware,\n",
    ),
    (
        "        .route(\"/api/v1/telegram/webhook\", post(telegram::webhook))\n        .layer(cors)\n",
        "        .route(\"/api/v1/telegram/webhook\", post(telegram::webhook))\n        .route_layer(middleware::from_fn_with_state(state.clone(), authz::authorize_request))\n        .layer(cors)\n",
    ),
    (
        "        \"rohbar_session={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000{}\",\n        if secure { \"; Secure\" } else { \"\" }\n",
        "        \"rohbar_session={sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800{}\",\n        if secure { \"; Secure\" } else { \"\" }\n",
    ),
    (
        "    .bind(&req.email)\n        .fetch_optional(&state.db)",
        "    .bind(req.email.trim().to_lowercase())\n        .fetch_optional(&state.db)",
    ),
    (
        "async fn auth_register(\n    State(state): State<SharedState>,\n    Json(req): Json<RegisterRequest>,\n) -> Response {\n    let salt = SaltString::generate(&mut rand::thread_rng());\n    let hash = match Argon2::default().hash_password(req.password.as_bytes(), &salt) {\n        Ok(hash) => hash.to_string(),\n        Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, \"Password hashing failed\"),\n    };\n    let id = Uuid::new_v4();\n    let row = sqlx::query_as::<_, (Uuid, String, String, Option<String>)>(\n        \"INSERT INTO users(id,name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,role,phone\",\n    )\n    .bind(id)\n    .bind(&req.name)\n    .bind(&req.email)\n    .bind(hash)\n    .bind(&req.role)\n    .bind(&req.phone)\n    .fetch_one(&state.db)\n    .await;\n\n    match row {\n        Ok((id, name, role, phone)) => match create_session(&state, id).await {\n            Ok(cookie) => {\n                let mut response = (\n                    StatusCode::CREATED,\n                    Json(json!({\n                        \"data\": { \"id\": id, \"name\": name, \"role\": role, \"phone\": phone }\n                    })),\n                )\n                    .into_response();\n                response.headers_mut().insert(header::SET_COOKIE, cookie);\n                response\n            }\n            Err(error) => error,\n        },\n        Err(_) => json_error(StatusCode::CONFLICT, \"User already exists\"),\n    }\n}\n",
        "async fn auth_register(\n    State(state): State<SharedState>,\n    Json(req): Json<RegisterRequest>,\n) -> Response {\n    let name = req.name.trim();\n    let email = req.email.trim().to_lowercase();\n    let phone = req.phone.as_deref().map(str::trim).filter(|value| !value.is_empty());\n\n    if !(2..=100).contains(&name.chars().count())\n        || email.len() > 254\n        || !email.contains('@')\n        || !(15..=128).contains(&req.password.chars().count())\n    {\n        return json_error(StatusCode::BAD_REQUEST, \"Invalid registration data\");\n    }\n\n    let role = match req.role.as_str() {\n        \"customer\" | \"carrier\" | \"driver\" => req.role.as_str(),\n        _ => return json_error(StatusCode::BAD_REQUEST, \"Invalid registration role\"),\n    };\n\n    let salt = SaltString::generate(&mut rand::thread_rng());\n    let hash = match Argon2::default().hash_password(req.password.as_bytes(), &salt) {\n        Ok(hash) => hash.to_string(),\n        Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, \"Password hashing failed\"),\n    };\n    let id = Uuid::new_v4();\n    let row = sqlx::query_as::<_, (Uuid, String, String, Option<String>)>(\n        \"INSERT INTO users(id,name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,role,phone\",\n    )\n    .bind(id)\n    .bind(name)\n    .bind(email)\n    .bind(hash)\n    .bind(role)\n    .bind(phone)\n    .fetch_one(&state.db)\n    .await;\n\n    match row {\n        Ok((id, name, role, phone)) => match create_session(&state, id).await {\n            Ok(cookie) => {\n                let mut response = (\n                    StatusCode::CREATED,\n                    Json(json!({\n                        \"data\": { \"id\": id, \"name\": name, \"role\": role, \"phone\": phone }\n                    })),\n                )\n                    .into_response();\n                response.headers_mut().insert(header::SET_COOKIE, cookie);\n                response\n            }\n            Err(error) => error,\n        },\n        Err(error) if error.as_database_error().is_some_and(|db_error| db_error.is_unique_violation()) => {\n            json_error(StatusCode::BAD_REQUEST, \"Unable to create account\")\n        }\n        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, \"Unable to create account\"),\n    }\n}\n",
    ),
    (
        "        HeaderValue::from_static(\"rohbar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0\"),\n",
        "        HeaderValue::from_str(&format!(\n            \"rohbar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{}\",\n            if state.session_cookie_secure { \"; Secure\" } else { \"\" }\n        ))\n        .expect(\"cookie\"),\n",
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"safe patch aborted: expected exactly one match, found {count}: {old[:100]!r}")
    source = source.replace(old, new, 1)

MAIN.write_text(source, encoding="utf-8")
