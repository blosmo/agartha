use std::collections::BTreeMap;

use agartha_sim::world::WorldCoord;
use serde::{Deserialize, Serialize};

const LOCAL_AREA_RADIUS: i32 = 32;
const PRESENCE_TTL_TICKS: u64 = 6;
const MAX_RECENT_MESSAGES_PER_AREA: usize = 50;
const MAX_MESSAGE_LENGTH: usize = 1_000;
const MAX_PROJECT_TEXT_LENGTH: usize = 2_000;
const MAX_SUMMARY_LENGTH: usize = 4_000;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalArea {
    pub id: String,
    pub center_x: i32,
    pub center_y: i32,
    pub radius: i32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationSession {
    pub agent_id: String,
    pub display_name: Option<String>,
    pub area_id: String,
    #[serde(serialize_with = "serialize_world_coord")]
    pub position: WorldCoord,
    pub entered_at: u64,
    pub last_seen_at: u64,
    pub live: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationMessage {
    pub id: String,
    pub world_id: String,
    pub area_id: String,
    pub author_agent_id: String,
    pub body: String,
    pub created_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationProvenance {
    pub author_agent_id: String,
    pub created_at: u64,
    pub area_id: String,
    pub source_message_ids: Vec<String>,
    pub source_event_ids: Vec<String>,
    pub supersedes_id: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaProjectEntry {
    pub id: String,
    pub kind: String,
    pub body: String,
    pub provenance: CollaborationProvenance,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaProject {
    pub id: String,
    pub world_id: String,
    pub area_id: String,
    pub title: String,
    pub version: u64,
    pub entries: Vec<AreaProjectEntry>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableAreaSummary {
    pub id: String,
    pub world_id: String,
    pub area_id: String,
    pub body: String,
    pub provenance: CollaborationProvenance,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationContext {
    pub area: LocalArea,
    pub presence: Vec<CollaborationSession>,
    pub recent_messages: Vec<CollaborationMessage>,
    pub projects: Vec<AreaProject>,
    pub durable_summaries: Vec<DurableAreaSummary>,
}

#[derive(Clone, Debug, Default)]
pub struct CollaborationState {
    sessions: BTreeMap<String, CollaborationSession>,
    messages: Vec<CollaborationMessage>,
    projects: BTreeMap<String, AreaProject>,
    summaries: Vec<DurableAreaSummary>,
    next_message_number: u64,
    next_project_number: u64,
    next_project_entry_number: u64,
    next_summary_number: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationRequest {
    pub operation: String,
    pub world_id: String,
    pub agent_id: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationResponse {
    pub ok: bool,
    pub operation: String,
    pub world_id: String,
    pub agent_id: String,
    pub area_id: Option<String>,
    pub result: serde_json::Value,
    pub error: Option<CollaborationError>,
    pub next: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationError {
    pub reason: String,
    pub message: String,
    pub retryable: bool,
}

impl CollaborationState {
    pub fn new() -> Self {
        Self {
            next_message_number: 1,
            next_project_number: 1,
            next_project_entry_number: 1,
            next_summary_number: 1,
            ..Self::default()
        }
    }

    pub fn context_for(&self, position: WorldCoord, tick: u64) -> CollaborationContext {
        let area = local_area_for_position(position);
        self.context_for_area(area, tick)
    }

    pub fn handle(
        &mut self,
        request: CollaborationRequest,
        position: WorldCoord,
        display_name: Option<String>,
        tick: u64,
    ) -> CollaborationResponse {
        let area = local_area_for_position(position);
        match request.operation.as_str() {
            "enter" | "heartbeat" => {
                let session = CollaborationSession {
                    agent_id: request.agent_id.clone(),
                    display_name,
                    area_id: area.id.clone(),
                    position,
                    entered_at: self
                        .sessions
                        .get(&request.agent_id)
                        .map(|session| session.entered_at)
                        .unwrap_or(tick),
                    last_seen_at: tick,
                    live: true,
                };
                self.sessions.insert(request.agent_id.clone(), session.clone());
                ok(
                    request,
                    Some(area.id.clone()),
                    serde_json::json!({ "session": session, "context": self.context_for_area(area, tick) }),
                    vec!["collab presence".to_string(), "collab say".to_string()],
                )
            }
            "leave" => {
                if let Some(session) = self.sessions.get_mut(&request.agent_id) {
                    session.live = false;
                    session.last_seen_at = tick;
                }
                ok(
                    request,
                    Some(area.id.clone()),
                    serde_json::json!({ "left": true, "context": self.context_for_area(area, tick) }),
                    vec!["collab enter".to_string()],
                )
            }
            "presence" | "messages" | "context" => ok(
                request,
                Some(area.id.clone()),
                serde_json::json!({ "context": self.context_for_area(area, tick) }),
                vec!["collab say".to_string(), "collab project".to_string()],
            ),
            "say" => {
                let Some(body) = non_empty_text(&request.payload, "body", MAX_MESSAGE_LENGTH) else {
                    return rejected(request, Some(area.id), "malformed", "body must be non-empty bounded text", false);
                };
                self.touch_session(&request.agent_id, position, display_name, &area, tick);
                let message = CollaborationMessage {
                    id: format!("message-{:04}", self.next_message_number),
                    world_id: "origin".to_string(),
                    area_id: area.id.clone(),
                    author_agent_id: request.agent_id.clone(),
                    body,
                    created_at: tick,
                };
                self.next_message_number += 1;
                self.messages.push(message.clone());
                self.trim_messages(&area.id);
                ok(
                    request,
                    Some(area.id.clone()),
                    serde_json::json!({ "message": message, "context": self.context_for_area(area, tick) }),
                    vec!["collab summary".to_string(), "act".to_string()],
                )
            }
            "project" => self.update_project(request, position, display_name, area, tick),
            "summary" => self.record_summary(request, position, display_name, area, tick),
            _ => rejected(request, Some(area.id), "malformed", "unsupported collaboration operation", false),
        }
    }

    fn update_project(
        &mut self,
        request: CollaborationRequest,
        position: WorldCoord,
        display_name: Option<String>,
        area: LocalArea,
        tick: u64,
    ) -> CollaborationResponse {
        let Some(kind) = non_empty_text(&request.payload, "kind", 32) else {
            return rejected(request, Some(area.id), "malformed", "kind is required", false);
        };
        if !matches!(kind.as_str(), "goal" | "update" | "review" | "next_step") {
            return rejected(request, Some(area.id), "malformed", "kind is unsupported", false);
        }
        let Some(body) = non_empty_text(&request.payload, "body", MAX_PROJECT_TEXT_LENGTH) else {
            return rejected(request, Some(area.id), "malformed", "body must be non-empty bounded project text", false);
        };

        self.touch_session(&request.agent_id, position, display_name, &area, tick);
        let project_id = request
            .payload
            .get("projectId")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| {
                let id = format!("project-{:04}", self.next_project_number);
                self.next_project_number += 1;
                id
            });
        let expected_version = request.payload.get("expectedVersion").and_then(|value| value.as_u64());
        if let Some(project) = self.projects.get(&project_id) {
            if expected_version.is_some_and(|expected| expected != project.version) {
                return rejected(
                    request,
                    Some(area.id),
                    "stale_project_version",
                    "project version is stale; refresh context before updating",
                    true,
                );
            }
        }

        let title = request
            .payload
            .get("title")
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Local collaboration project")
            .to_string();
        let entry = AreaProjectEntry {
            id: format!("project-entry-{:04}", self.next_project_entry_number),
            kind,
            body,
            provenance: provenance(&request.agent_id, tick, &area, "proposal"),
        };
        self.next_project_entry_number += 1;
        let project = self.projects.entry(project_id.clone()).or_insert(AreaProject {
            id: project_id,
            world_id: "origin".to_string(),
            area_id: area.id.clone(),
            title,
            version: 0,
            entries: Vec::new(),
            updated_at: tick,
        });
        project.version += 1;
        project.updated_at = tick;
        project.entries.push(entry);

        ok(
            request,
            Some(area.id.clone()),
            serde_json::json!({ "project": project, "context": self.context_for_area(area, tick) }),
            vec!["collab summary".to_string(), "act".to_string()],
        )
    }

    fn record_summary(
        &mut self,
        request: CollaborationRequest,
        position: WorldCoord,
        display_name: Option<String>,
        area: LocalArea,
        tick: u64,
    ) -> CollaborationResponse {
        let Some(body) = non_empty_text(&request.payload, "body", MAX_SUMMARY_LENGTH) else {
            return rejected(request, Some(area.id), "malformed", "body must be non-empty bounded summary text", false);
        };
        let status = request
            .payload
            .get("status")
            .and_then(|value| value.as_str())
            .unwrap_or("decision");
        if !matches!(status, "proposal" | "decision" | "review") {
            return rejected(request, Some(area.id), "malformed", "status is unsupported", false);
        }
        self.touch_session(&request.agent_id, position, display_name, &area, tick);
        let summary = DurableAreaSummary {
            id: format!("summary-{:04}", self.next_summary_number),
            world_id: "origin".to_string(),
            area_id: area.id.clone(),
            body,
            provenance: provenance(&request.agent_id, tick, &area, status),
        };
        self.next_summary_number += 1;
        self.summaries.push(summary.clone());
        ok(
            request,
            Some(area.id.clone()),
            serde_json::json!({ "summary": summary, "context": self.context_for_area(area, tick) }),
            vec!["act".to_string(), "collab leave".to_string()],
        )
    }

    fn touch_session(
        &mut self,
        agent_id: &str,
        position: WorldCoord,
        display_name: Option<String>,
        area: &LocalArea,
        tick: u64,
    ) {
        self.sessions.insert(
            agent_id.to_string(),
            CollaborationSession {
                agent_id: agent_id.to_string(),
                display_name,
                area_id: area.id.clone(),
                position,
                entered_at: self
                    .sessions
                    .get(agent_id)
                    .map(|session| session.entered_at)
                    .unwrap_or(tick),
                last_seen_at: tick,
                live: true,
            },
        );
    }

    fn context_for_area(&self, area: LocalArea, tick: u64) -> CollaborationContext {
        let presence = self
            .sessions
            .values()
            .filter(|session| session.area_id == area.id)
            .filter(|session| session.live && tick.saturating_sub(session.last_seen_at) <= PRESENCE_TTL_TICKS)
            .cloned()
            .collect();
        let recent_messages = self
            .messages
            .iter()
            .filter(|message| message.area_id == area.id)
            .rev()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        let projects = self
            .projects
            .values()
            .filter(|project| project.area_id == area.id)
            .cloned()
            .collect();
        let durable_summaries = self
            .summaries
            .iter()
            .filter(|summary| summary.area_id == area.id)
            .cloned()
            .collect();

        CollaborationContext {
            area,
            presence,
            recent_messages,
            projects,
            durable_summaries,
        }
    }

    fn trim_messages(&mut self, area_id: &str) {
        let overflow = self.messages.iter().filter(|message| message.area_id == area_id).count().saturating_sub(MAX_RECENT_MESSAGES_PER_AREA);
        if overflow == 0 {
            return;
        }
        let mut removed = 0;
        self.messages.retain(|message| {
            if message.area_id == area_id && removed < overflow {
                removed += 1;
                false
            } else {
                true
            }
        });
    }
}

pub fn local_area_for_position(position: WorldCoord) -> LocalArea {
    let (x, y) = position.absolute();
    let center_x = round_to_radius(x);
    let center_y = round_to_radius(y);
    LocalArea {
        id: format!("origin:{center_x}:{center_y}:r{LOCAL_AREA_RADIUS}"),
        center_x,
        center_y,
        radius: LOCAL_AREA_RADIUS,
    }
}

fn round_to_radius(value: i32) -> i32 {
    ((value as f32 / LOCAL_AREA_RADIUS as f32).round() as i32) * LOCAL_AREA_RADIUS
}

fn serialize_world_coord<S>(coord: &WorldCoord, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serde_json::json!({
        "chunk": { "x": coord.chunk.x, "y": coord.chunk.y },
        "cell": { "x": coord.cell.x, "y": coord.cell.y }
    })
    .serialize(serializer)
}

fn non_empty_text(payload: &serde_json::Value, field: &str, max_length: usize) -> Option<String> {
    payload
        .get(field)
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty() && value.len() <= max_length)
        .map(ToOwned::to_owned)
}

fn provenance(agent_id: &str, tick: u64, area: &LocalArea, status: &str) -> CollaborationProvenance {
    CollaborationProvenance {
        author_agent_id: agent_id.to_string(),
        created_at: tick,
        area_id: area.id.clone(),
        source_message_ids: Vec::new(),
        source_event_ids: Vec::new(),
        supersedes_id: None,
        status: status.to_string(),
    }
}

fn ok(
    request: CollaborationRequest,
    area_id: Option<String>,
    result: serde_json::Value,
    next: Vec<String>,
) -> CollaborationResponse {
    CollaborationResponse {
        ok: true,
        operation: request.operation,
        world_id: request.world_id,
        agent_id: request.agent_id,
        area_id,
        result,
        error: None,
        next,
    }
}

fn rejected(
    request: CollaborationRequest,
    area_id: Option<String>,
    reason: &str,
    message: &str,
    retryable: bool,
) -> CollaborationResponse {
    CollaborationResponse {
        ok: false,
        operation: request.operation,
        world_id: request.world_id,
        agent_id: request.agent_id,
        area_id,
        result: serde_json::Value::Null,
        error: Some(CollaborationError {
            reason: reason.to_string(),
            message: message.to_string(),
            retryable,
        }),
        next: Vec::new(),
    }
}
