use agartha_server::api::routes::{app, ApiState};
use agartha_server::state::ServerState;
use axum::body::{to_bytes, Body};
use axum::http::{header, Method, Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;

#[tokio::test]
async fn observe_quote_and_act_share_authoritative_state() {
    let app = app(ApiState::new(ServerState::seeded_origin()));

    let observe = request(Method::GET, "/observe", None)
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(observe).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let perception = json_body(response).await;
    assert_eq!(perception["agentId"], "agent-moss-archivist");

    let action = json!({
        "worldId": "origin",
        "agentId": "agent-moss-archivist",
        "actionType": "place_material",
        "expectedChunkVersion": 0,
        "payload": {
            "target": { "chunk": { "x": 0, "y": 0 }, "cell": { "x": 65, "y": 65 } },
            "material": 1
        }
    });

    let quote = request(Method::POST, "/quote", Some(action.clone()))
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::from(action.clone().to_string()))
        .unwrap();
    let response = app.clone().oneshot(quote).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["cost"], 2);

    let act = request(Method::POST, "/act", Some(action.clone()))
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::from(action.to_string()))
        .unwrap();
    let response = app.clone().oneshot(act).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let result = json_body(response).await;
    assert_eq!(result["accepted"], true);
    assert_eq!(result["eventId"], "event-0001");

    let chunk = request(Method::GET, "/chunks/0/0", None)
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(chunk).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let snapshot = json_body(response).await;
    assert_eq!(snapshot["version"], 1);
    assert!(snapshot["cells"]
        .as_array()
        .unwrap()
        .iter()
        .any(|cell| cell["coord"]["cell"] == json!({ "x": 65, "y": 65 }) && cell["material"] == 1));
}

#[tokio::test]
async fn missing_auth_rejects_read_and_write_routes() {
    let app = app(ApiState::new(ServerState::seeded_origin()));

    for (method, path, body) in [
        (Method::GET, "/observe", None),
        (Method::GET, "/chunks/0/0", None),
        (Method::GET, "/events", None),
        (
            Method::POST,
            "/act",
            Some(json!({
                "worldId": "origin",
                "agentId": "agent-moss-archivist",
                "actionType": "place_material",
                "payload": {
                    "target": { "chunk": { "x": 0, "y": 0 }, "cell": { "x": 65, "y": 65 } },
                    "material": 1
                }
            })),
        ),
    ] {
        let request = request(method, path, body.clone())
            .body(Body::from(
                body.map(|body| body.to_string()).unwrap_or_default(),
            ))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(json_body(response).await["reason"], "unauthenticated");
    }
}

#[tokio::test]
async fn admin_refill_energy_requires_admin_token_and_caps_at_agent_cap() {
    let mut state = ServerState::seeded_origin();
    state
        .agent_mut("agent-moss-archivist")
        .unwrap()
        .energy
        .current = 3;
    let app = app(ApiState::new(state));
    let body = json!({ "agentId": "agent-moss-archivist" });

    let forbidden = request(Method::POST, "/admin/energy/refill", Some(body.clone()))
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::from(body.clone().to_string()))
        .unwrap();
    let response = app.clone().oneshot(forbidden).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let refill = request(Method::POST, "/admin/energy/refill", Some(body.clone()))
        .header(header::AUTHORIZATION, "Bearer token-admin-local")
        .body(Body::from(body.to_string()))
        .unwrap();
    let response = app.clone().oneshot(refill).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let result = json_body(response).await;
    assert_eq!(result["agentId"], "agent-moss-archivist");
    assert_eq!(result["worldEnergy"]["current"], 50);

    let observe = request(Method::GET, "/observe", None)
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(observe).await.unwrap();
    assert_eq!(json_body(response).await["worldEnergy"]["current"], 50);
}

#[tokio::test]
async fn admin_refill_energy_can_add_a_partial_amount() {
    let mut state = ServerState::seeded_origin();
    state
        .agent_mut("agent-moss-archivist")
        .unwrap()
        .energy
        .current = 3;
    let app = app(ApiState::new(state));
    let body = json!({ "agentId": "agent-moss-archivist", "amount": 5 });

    let refill = request(Method::POST, "/admin/energy/refill", Some(body.clone()))
        .header(header::AUTHORIZATION, "Bearer token-admin-local")
        .body(Body::from(body.to_string()))
        .unwrap();
    let response = app.oneshot(refill).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["worldEnergy"]["current"], 8);
}

#[tokio::test]
async fn cors_allows_loopback_vite_origins_with_authorization_headers() {
    let app = app(ApiState::new(ServerState::seeded_origin()));

    let preflight = Request::builder()
        .method(Method::OPTIONS)
        .uri("/events")
        .header(header::ORIGIN, "http://127.0.0.1:5177")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
        .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(preflight).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
        Some(&"http://127.0.0.1:5177".parse().unwrap())
    );
}

fn request(method: Method, path: &str, body: Option<Value>) -> axum::http::request::Builder {
    let builder = Request::builder().method(method).uri(path);
    if body.is_some() {
        builder.header(header::CONTENT_TYPE, "application/json")
    } else {
        builder
    }
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}
