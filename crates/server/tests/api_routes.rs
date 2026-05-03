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
async fn collaboration_route_tracks_presence_chat_project_summary_and_leave() {
    let app = app(ApiState::new(ServerState::seeded_origin()));

    let enter = json!({
        "operation": "enter",
        "worldId": "origin",
        "agentId": "agent-moss-archivist",
        "payload": {}
    });
    let response = app
        .clone()
        .oneshot(
            request(Method::POST, "/collaboration", Some(enter.clone()))
                .header(header::AUTHORIZATION, "Bearer token-moss")
                .body(Body::from(enter.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let entered = json_body(response).await;
    assert_eq!(entered["ok"], true);
    assert_eq!(entered["areaId"], "origin:64:64:r32");
    assert_eq!(entered["result"]["context"]["presence"][0]["agentId"], "agent-moss-archivist");

    let say = json!({
        "operation": "say",
        "worldId": "origin",
        "agentId": "agent-firebreak-builder",
        "payload": { "body": "I will keep the firebreak north of the moss edge." }
    });
    let response = app
        .clone()
        .oneshot(
            request(Method::POST, "/collaboration", Some(say.clone()))
                .header(header::AUTHORIZATION, "Bearer token-firebreak")
                .body(Body::from(say.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let said = json_body(response).await;
    assert_eq!(said["result"]["message"]["body"], "I will keep the firebreak north of the moss edge.");
    assert_eq!(said["result"]["context"]["recentMessages"].as_array().unwrap().len(), 1);

    let project = json!({
        "operation": "project",
        "worldId": "origin",
        "agentId": "agent-moss-archivist",
        "payload": { "title": "Shared boundary", "kind": "goal", "body": "Keep moss and fire separated.", "expectedVersion": 0 }
    });
    let response = app
        .clone()
        .oneshot(
            request(Method::POST, "/collaboration", Some(project.clone()))
                .header(header::AUTHORIZATION, "Bearer token-moss")
                .body(Body::from(project.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let projected = json_body(response).await;
    assert_eq!(projected["result"]["project"]["version"], 1);

    let stale = json!({
        "operation": "project",
        "worldId": "origin",
        "agentId": "agent-firebreak-builder",
        "payload": {
            "projectId": projected["result"]["project"]["id"],
            "kind": "review",
            "body": "Stale update",
            "expectedVersion": 0
        }
    });
    let response = app
        .clone()
        .oneshot(
            request(Method::POST, "/collaboration", Some(stale.clone()))
                .header(header::AUTHORIZATION, "Bearer token-firebreak")
                .body(Body::from(stale.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["error"]["reason"], "stale_project_version");

    let summary = json!({
        "operation": "summary",
        "worldId": "origin",
        "agentId": "agent-moss-archivist",
        "payload": { "body": "Decision: leave a neutral buffer between moss and fire.", "status": "decision" }
    });
    let response = app
        .clone()
        .oneshot(
            request(Method::POST, "/collaboration", Some(summary.clone()))
                .header(header::AUTHORIZATION, "Bearer token-moss")
                .body(Body::from(summary.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["result"]["summary"]["provenance"]["status"], "decision");

    let leave = json!({
        "operation": "leave",
        "worldId": "origin",
        "agentId": "agent-moss-archivist",
        "payload": {}
    });
    let response = app
        .oneshot(
            request(Method::POST, "/collaboration", Some(leave.clone()))
                .header(header::AUTHORIZATION, "Bearer token-moss")
                .body(Body::from(leave.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let left = json_body(response).await;
    let presence = left["result"]["context"]["presence"].as_array().unwrap();
    assert!(!presence.iter().any(|agent| agent["agentId"] == "agent-moss-archivist"));
    assert_eq!(left["result"]["context"]["durableSummaries"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn observe_includes_machine_readable_collaboration_context() {
    let app = app(ApiState::new(ServerState::seeded_origin()));
    let enter = json!({
        "operation": "enter",
        "worldId": "origin",
        "agentId": "agent-moss-archivist",
        "payload": {}
    });
    let _ = app
        .clone()
        .oneshot(
            request(Method::POST, "/collaboration", Some(enter.clone()))
                .header(header::AUTHORIZATION, "Bearer token-moss")
                .body(Body::from(enter.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let observe = request(Method::GET, "/observe", None)
        .header(header::AUTHORIZATION, "Bearer token-moss")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(observe).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let perception = json_body(response).await;
    assert_eq!(perception["collaboration"]["area"]["id"], "origin:64:64:r32");
    assert_eq!(perception["collaboration"]["presence"][0]["agentId"], "agent-moss-archivist");
    assert!(perception["availableActions"].as_array().unwrap().contains(&json!("collab")));
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
