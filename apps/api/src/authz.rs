use axum::{
    extract::{Request, State},
    http::{Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::{SharedState, session_user};

pub async fn authorize_request(
    State(state): State<SharedState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_owned();
    let method = request.method().clone();

    if is_public(&method, &path) {
        return next.run(request).await;
    }

    let user = match session_user(request.headers(), &state).await {
        Ok(user) => user,
        Err(response) => return response,
    };

    if !is_allowed_role(&user.role, &method, &path) {
        return forbidden();
    }

    if method == Method::POST && path.starts_with("/api/v1/offers/") && path.ends_with("/accept") {
        let offer_id = path
            .strip_prefix("/api/v1/offers/")
            .and_then(|value| value.strip_suffix("/accept"));
        if let Some(offer_id) = offer_id {
            let owns_shipment = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM offers o JOIN shipments s ON s.id=o.shipment_id WHERE o.id=$1 AND s.customer_id=$2)",
            )
            .bind(offer_id)
            .bind(user.id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(false);

            if user.role != "admin" && !owns_shipment {
                return forbidden();
            }
        }
    }

    next.run(request).await
}

fn is_public(method: &Method, path: &str) -> bool {
    matches!(
        (method, path),
        (&Method::GET, "/api/v1/health")
            | (&Method::GET, "/api/v1/about")
            | (&Method::POST, "/api/v1/auth/login")
            | (&Method::POST, "/api/v1/auth/register")
            | (&Method::POST, "/api/v1/auth/telegram")
            | (&Method::POST, "/api/v1/telegram/webhook")
    )
}

fn is_allowed_role(role: &str, method: &Method, path: &str) -> bool {
    if role == "admin" {
        return true;
    }

    if path == "/api/v1/auth/me" || path == "/api/v1/auth/logout" || path == "/api/v1/notifications"
    {
        return true;
    }
    if path.starts_with("/api/v1/notifications/") {
        return true;
    }
    if path == "/api/v1/events" && *method == Method::POST {
        return false;
    }
    if path == "/api/v1/ws" || path.ends_with("/stream") || path.ends_with("/events") {
        return true;
    }
    if path == "/api/v1/shipments" && *method == Method::GET {
        return true;
    }
    if path.starts_with("/api/v1/shipments/") && *method == Method::GET {
        return true;
    }
    if path.starts_with("/api/v1/shipments/") && path.ends_with("/status") {
        return role == "driver" || role == "carrier";
    }
    if path == "/api/v1/shipments" && *method == Method::POST {
        return role == "customer";
    }
    if path.contains("/offers") && *method == Method::GET {
        return true;
    }
    if path.starts_with("/api/v1/shipments/")
        && path.ends_with("/offers")
        && *method == Method::POST
    {
        return role == "carrier";
    }
    if path.starts_with("/api/v1/offers/") && path.ends_with("/accept") && *method == Method::POST {
        return role == "customer";
    }
    if path == "/api/v1/fleet" {
        return role == "carrier";
    }
    if path == "/api/v1/drivers/assignments" {
        return role == "carrier" || role == "driver";
    }
    if path.starts_with("/api/v1/shipments/")
        && path.ends_with("/driver")
        && *method == Method::POST
    {
        return role == "carrier";
    }

    false
}

fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        axum::Json(serde_json::json!({
            "error": {
                "code": "403",
                "message": "Insufficient permissions"
            }
        })),
    )
        .into_response()
}
