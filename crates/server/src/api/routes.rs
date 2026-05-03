use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};

use agartha_sim::world::{Chunk, ChunkCoord};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::actions::perception::WorldEnergyView;
use crate::actions::{AuthContext, RejectionReason};
use crate::api::dto::{
    api_error, base_versions_for, patch_dtos_from_result, ActionEnvelopeDto, ActionResultDto,
    AgentPerceptionDto, ApiErrorDto, ChunkCoordDto, ChunkSnapshotDto, CostQuoteDto,
    PatchEnvelopeDto, WorldEventDto,
};
use crate::collaboration::{CollaborationRequest, CollaborationResponse};
use crate::state::ServerState;
use crate::ws::SubscriptionRequest;

const WORLD_ID: &str = "origin";
const DEFAULT_BIND_ADDR: &str = "127.0.0.1:8787";

#[derive(Clone)]
pub struct ApiState {
    world: Arc<Mutex<ServerState>>,
    patches: broadcast::Sender<PatchEnvelopeDto>,
}

impl ApiState {
    pub fn seeded() -> Self {
        Self::new(ServerState::seeded_origin())
    }

    pub fn new(world: ServerState) -> Self {
        let (patches, _) = broadcast::channel(256);
        Self {
            world: Arc::new(Mutex::new(world)),
            patches,
        }
    }
}

pub fn app(state: ApiState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/observe", get(observe))
        .route("/quote", post(quote))
        .route("/act", post(act))
        .route("/collaboration", post(collaboration))
        .route("/admin/energy/refill", post(admin_refill_energy))
        .route("/chunks/{x}/{y}", get(chunk_snapshot))
        .route("/events", get(events))
        .route("/ws", get(ws_subscribe))
        .layer(cors_layer())
        .with_state(state)
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _| {
            is_allowed_local_origin(origin)
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::ACCEPT, header::AUTHORIZATION, header::CONTENT_TYPE])
}

fn is_allowed_local_origin(origin: &HeaderValue) -> bool {
    let Ok(origin) = origin.to_str() else {
        return false;
    };

    matches!(
        origin,
        "http://localhost:5173"
            | "http://localhost:5174"
            | "http://localhost:5175"
            | "http://localhost:5176"
            | "http://localhost:5177"
            | "http://127.0.0.1:5173"
            | "http://127.0.0.1:5174"
            | "http://127.0.0.1:5175"
            | "http://127.0.0.1:5176"
            | "http://127.0.0.1:5177"
    )
}

pub async fn serve_from_env() -> Result<(), Box<dyn std::error::Error>> {
    let addr =
        std::env::var("AGARTHA_SERVER_ADDR").unwrap_or_else(|_| DEFAULT_BIND_ADDR.to_string());
    serve(addr.parse()?, ApiState::seeded()).await
}

pub async fn serve(addr: SocketAddr, state: ApiState) -> Result<(), Box<dyn std::error::Error>> {
    if !is_loopback(addr) && std::env::var("AGARTHA_UNSAFE_BIND").ok().as_deref() != Some("true") {
        return Err(format!(
            "refusing to bind {addr}; use 127.0.0.1 or set AGARTHA_UNSAFE_BIND=true for local development"
        )
        .into());
    }

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app(state)).await?;
    Ok(())
}

async fn health() -> Json<HealthDto> {
    Json(HealthDto {
        ok: true,
        world_id: WORLD_ID.to_string(),
    })
}

async fn observe(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> Result<Json<AgentPerceptionDto>, ApiResponseError> {
    let auth = auth_from_headers(&headers)?;
    let mut world = state
        .world
        .lock()
        .map_err(|_| ApiResponseError::internal())?;
    let perception = world.observe(&auth)?;
    Ok(Json(perception.into()))
}

async fn quote(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(envelope): Json<ActionEnvelopeDto>,
) -> Result<Json<CostQuoteDto>, ApiResponseError> {
    let auth = auth_from_headers(&headers)?;
    let request = envelope.into_action_request()?;
    let mut world = state
        .world
        .lock()
        .map_err(|_| ApiResponseError::internal())?;
    let quote = world.quote_action(&auth, &request.action)?;
    Ok(Json(quote.into()))
}

async fn act(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(envelope): Json<ActionEnvelopeDto>,
) -> Result<Json<ActionResultDto>, ApiResponseError> {
    let auth = auth_from_headers(&headers)?;
    let request = envelope.into_action_request()?;
    let patches = {
        let mut world = state
            .world
            .lock()
            .map_err(|_| ApiResponseError::internal())?;
        let base_versions = base_versions_for(&request.action, |chunk| {
            world.chunk(chunk).map(|chunk| chunk.version)
        });
        let result = world.execute_action(&auth, request);
        let patches = if result.accepted {
            patch_dtos_from_result(
                WORLD_ID,
                &base_versions,
                |coord| world.chunk(coord).cloned(),
                &result,
            )
        } else {
            Vec::new()
        };
        let dto = ActionResultDto::from(result);
        (dto, patches)
    };

    for patch in patches.1 {
        let _ = state.patches.send(patch);
    }

    Ok(Json(patches.0))
}

async fn collaboration(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<CollaborationRequest>,
) -> Result<Json<CollaborationResponse>, ApiResponseError> {
    let auth = auth_from_headers(&headers)?;
    let mut world = state
        .world
        .lock()
        .map_err(|_| ApiResponseError::internal())?;
    Ok(Json(world.collaborate(&auth, request)?))
}

async fn admin_refill_energy(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<AdminRefillEnergyRequestDto>,
) -> Result<Json<AdminRefillEnergyResponseDto>, ApiResponseError> {
    admin_auth_from_headers(&headers)?;
    let mut world = state
        .world
        .lock()
        .map_err(|_| ApiResponseError::internal())?;
    let energy = world.refill_agent_energy(&request.agent_id, request.amount)?;
    Ok(Json(AdminRefillEnergyResponseDto {
        agent_id: request.agent_id,
        world_energy: energy.into(),
    }))
}

async fn chunk_snapshot(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path((x, y)): Path<(i32, i32)>,
) -> Result<Json<ChunkSnapshotDto>, ApiResponseError> {
    let auth = auth_from_headers(&headers)?;
    let mut world = state
        .world
        .lock()
        .map_err(|_| ApiResponseError::internal())?;
    world.observe(&auth)?;
    let coord = ChunkCoord::new(x, y);
    let chunk = world
        .chunk(coord)
        .cloned()
        .unwrap_or_else(|| Chunk::new(coord));
    Ok(Json(ChunkSnapshotDto::from_chunk(WORLD_ID, &chunk)))
}

async fn events(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(query): Query<EventsQuery>,
) -> Result<Json<Vec<WorldEventDto>>, ApiResponseError> {
    let auth = auth_from_headers(&headers)?;
    let mut world = state
        .world
        .lock()
        .map_err(|_| ApiResponseError::internal())?;
    world.observe(&auth)?;
    let limit = query.limit.unwrap_or(20).min(100);
    let events = world
        .events()
        .iter()
        .rev()
        .take(limit)
        .cloned()
        .map(Into::into)
        .collect();
    Ok(Json(events))
}

async fn ws_subscribe(State(state): State<ApiState>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: ApiState) {
    let Some(Ok(Message::Text(text))) = socket.recv().await else {
        return;
    };
    let Ok(request) = serde_json::from_str::<SubscribeMessageDto>(&text) else {
        let _ = socket
            .send(Message::Text(
                serde_json::to_string(&SocketMessageDto::error(
                    "malformed",
                    "invalid subscribe message",
                ))
                .unwrap_or_default()
                .into(),
            ))
            .await;
        return;
    };

    let subscription = match SubscriptionRequest::visible(
        ChunkCoord::new(request.chunk.x, request.chunk.y),
        request.radius_chunks,
    )
    .into_subscription()
    {
        Ok(subscription) => subscription,
        Err(_) => {
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&SocketMessageDto::error(
                        "invalid_target",
                        "invalid subscription radius",
                    ))
                    .unwrap_or_default()
                    .into(),
                ))
                .await;
            return;
        }
    };

    let snapshots_result: Result<Vec<ChunkSnapshotDto>, RejectionReason> = {
        let mut world = match state.world.lock() {
            Ok(world) => world,
            Err(_) => return,
        };
        if world.observe(&AuthContext::bearer(request.token)).is_err() {
            Err(RejectionReason::Unauthenticated)
        } else {
            let mut snapshots = Vec::new();
            for y in (request.chunk.y - request.radius_chunks)
                ..=(request.chunk.y + request.radius_chunks)
            {
                for x in (request.chunk.x - request.radius_chunks)
                    ..=(request.chunk.x + request.radius_chunks)
                {
                    let coord = ChunkCoord::new(x, y);
                    let chunk = world
                        .chunk(coord)
                        .cloned()
                        .unwrap_or_else(|| Chunk::new(coord));
                    snapshots.push(ChunkSnapshotDto::from_chunk(WORLD_ID, &chunk));
                }
            }
            Ok(snapshots)
        }
    };

    let snapshots = match snapshots_result {
        Ok(snapshots) => snapshots,
        Err(_) => {
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&SocketMessageDto::error(
                        "unauthenticated",
                        "invalid bearer token",
                    ))
                    .unwrap_or_default()
                    .into(),
                ))
                .await;
            return;
        }
    };

    for snapshot in snapshots {
        let message = SocketMessageDto::Snapshot { snapshot };
        let Ok(text) = serde_json::to_string(&message) else {
            return;
        };
        if socket.send(Message::Text(text.into())).await.is_err() {
            return;
        }
    }

    let mut receiver = state.patches.subscribe();
    while let Ok(patch) = receiver.recv().await {
        if !subscription.contains(ChunkCoord::new(patch.chunk.x, patch.chunk.y)) {
            continue;
        }
        let message = SocketMessageDto::Patch { patch };
        let Ok(text) = serde_json::to_string(&message) else {
            continue;
        };
        if socket.send(Message::Text(text.into())).await.is_err() {
            return;
        }
    }
}

fn auth_from_headers(headers: &HeaderMap) -> Result<AuthContext, ApiResponseError> {
    let Some(value) = headers.get(axum::http::header::AUTHORIZATION) else {
        return Err(ApiResponseError::from(RejectionReason::Unauthenticated));
    };
    let value = value
        .to_str()
        .map_err(|_| ApiResponseError::from(RejectionReason::Unauthenticated))?;
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(ApiResponseError::from(RejectionReason::Unauthenticated));
    };
    Ok(AuthContext::bearer(token))
}

fn admin_auth_from_headers(headers: &HeaderMap) -> Result<(), ApiResponseError> {
    let auth = auth_from_headers(headers)?;
    let expected =
        std::env::var("AGARTHA_ADMIN_TOKEN").unwrap_or_else(|_| "token-admin-local".to_string());
    if auth.bearer_token != expected {
        return Err(ApiResponseError::from(RejectionReason::PermissionDenied));
    }
    Ok(())
}

fn is_loopback(addr: SocketAddr) -> bool {
    match addr.ip() {
        IpAddr::V4(ip) => ip.is_loopback(),
        IpAddr::V6(ip) => ip.is_loopback(),
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthDto {
    ok: bool,
    world_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventsQuery {
    limit: Option<usize>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminRefillEnergyRequestDto {
    agent_id: String,
    amount: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminRefillEnergyResponseDto {
    agent_id: String,
    world_energy: WorldEnergyDto,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorldEnergyDto {
    current: u32,
    cap: u32,
    regenerates_every_ticks: u64,
    next_regeneration_tick: u64,
}

impl From<WorldEnergyView> for WorldEnergyDto {
    fn from(energy: WorldEnergyView) -> Self {
        Self {
            current: energy.current,
            cap: energy.cap,
            regenerates_every_ticks: energy.regenerates_every_ticks,
            next_regeneration_tick: energy.next_regeneration_tick,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscribeMessageDto {
    token: String,
    chunk: ChunkCoordDto,
    radius_chunks: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SocketMessageDto {
    Snapshot { snapshot: ChunkSnapshotDto },
    Patch { patch: PatchEnvelopeDto },
    Error { error: ApiErrorDto },
}

impl SocketMessageDto {
    fn error(reason: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Error {
            error: ApiErrorDto {
                reason: reason.into(),
                message: message.into(),
            },
        }
    }
}

pub struct ApiResponseError {
    status: StatusCode,
    error: ApiErrorDto,
}

impl ApiResponseError {
    fn internal() -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error: api_error(
                RejectionReason::PersistenceFailed,
                "server state unavailable",
            ),
        }
    }
}

impl From<RejectionReason> for ApiResponseError {
    fn from(reason: RejectionReason) -> Self {
        let status = match reason {
            RejectionReason::Unauthenticated => StatusCode::UNAUTHORIZED,
            RejectionReason::PermissionDenied => StatusCode::FORBIDDEN,
            RejectionReason::Malformed | RejectionReason::InvalidTarget => StatusCode::BAD_REQUEST,
            RejectionReason::InsufficientEnergy
            | RejectionReason::StaleChunkVersion
            | RejectionReason::IllegalMaterialOverwrite
            | RejectionReason::OutOfRange => StatusCode::CONFLICT,
            RejectionReason::PersistenceFailed => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self {
            status,
            error: api_error(reason, "request rejected"),
        }
    }
}

impl IntoResponse for ApiResponseError {
    fn into_response(self) -> Response {
        (self.status, Json(self.error)).into_response()
    }
}
