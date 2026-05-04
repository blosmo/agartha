use std::collections::BTreeMap;

use agartha_sim::materials::Material;
use agartha_sim::world::{CellCoord, Chunk, ChunkCoord, WorldCoord, CHUNK_SIZE};
use serde::{Deserialize, Serialize};

use crate::actions::perception::{AgentPerception, VisibleCell, WorldEnergyView};
use crate::actions::{ActionKind, ActionRequest, ActionResult, CostQuote, RejectionReason};
use crate::collaboration::CollaborationResponse;
use crate::events::{SymbolRecord, WorldEvent};
use crate::patches::{ChunkSnapshot, PatchBody, PatchEnvelope};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkCoordDto {
    pub x: i32,
    pub y: i32,
}

impl From<ChunkCoord> for ChunkCoordDto {
    fn from(coord: ChunkCoord) -> Self {
        Self {
            x: coord.x,
            y: coord.y,
        }
    }
}

impl From<ChunkCoordDto> for ChunkCoord {
    fn from(coord: ChunkCoordDto) -> Self {
        ChunkCoord::new(coord.x, coord.y)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellCoordDto {
    pub x: u8,
    pub y: u8,
}

impl From<CellCoord> for CellCoordDto {
    fn from(coord: CellCoord) -> Self {
        Self {
            x: coord.x,
            y: coord.y,
        }
    }
}

impl TryFrom<CellCoordDto> for CellCoord {
    type Error = RejectionReason;

    fn try_from(coord: CellCoordDto) -> Result<Self, Self::Error> {
        CellCoord::new(coord.x as i32, coord.y as i32).map_err(|_| RejectionReason::InvalidTarget)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldCoordDto {
    pub chunk: ChunkCoordDto,
    pub cell: CellCoordDto,
}

impl From<WorldCoord> for WorldCoordDto {
    fn from(coord: WorldCoord) -> Self {
        Self {
            chunk: coord.chunk.into(),
            cell: coord.cell.into(),
        }
    }
}

impl TryFrom<WorldCoordDto> for WorldCoord {
    type Error = RejectionReason;

    fn try_from(coord: WorldCoordDto) -> Result<Self, Self::Error> {
        Ok(WorldCoord::new(coord.chunk.into(), coord.cell.try_into()?))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RectDto {
    pub origin: WorldCoordDto,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEnvelopeDto {
    pub world_id: String,
    pub agent_id: String,
    pub action_type: String,
    pub expected_chunk_version: Option<u64>,
    pub quote_id: Option<String>,
    pub payload: serde_json::Value,
}

impl ActionEnvelopeDto {
    pub fn into_action_request(self) -> Result<ActionRequest, RejectionReason> {
        let action = match self.action_type.as_str() {
            "observe" => ActionKind::Observe,
            "inspect" => {
                let payload: InspectPayloadDto = payload(self.payload)?;
                ActionKind::Inspect {
                    target: payload.target.try_into()?,
                }
            }
            "move" => {
                let payload: MovePayloadDto = payload(self.payload)?;
                ActionKind::Move {
                    to: payload.to.try_into()?,
                }
            }
            "place_material" => {
                let payload: PlaceMaterialPayloadDto = payload(self.payload)?;
                ActionKind::PlaceMaterial {
                    target: payload.target.try_into()?,
                    material: material_from_id(payload.material)?,
                }
            }
            "paint_cells" => {
                let payload: PaintCellsPayloadDto = payload(self.payload)?;
                let cells = payload
                    .cells
                    .into_iter()
                    .map(WorldCoord::try_from)
                    .collect::<Result<Vec<_>, _>>()?;
                ActionKind::PaintCells { cells }
            }
            "register_symbol" => {
                let payload: RegisterSymbolPayloadDto = payload(self.payload)?;
                ActionKind::RegisterSymbol {
                    label: payload.label,
                    origin: payload.bounds.origin.try_into()?,
                    width: payload.bounds.width,
                    height: payload.bounds.height,
                }
            }
            "history" => {
                let payload: HistoryPayloadDto = payload(self.payload)?;
                ActionKind::History {
                    origin: payload.bounds.origin.try_into()?,
                    width: payload.bounds.width,
                    height: payload.bounds.height,
                }
            }
            "submit_note" => {
                let payload: SubmitNotePayloadDto = payload(self.payload)?;
                ActionKind::SubmitNote {
                    target: payload.target.map(WorldCoord::try_from).transpose()?,
                    body: payload.body,
                }
            }
            _ => return Err(RejectionReason::Malformed),
        };

        Ok(ActionRequest {
            claimed_agent_id: self.agent_id,
            expected_chunk_version: self.expected_chunk_version,
            quote_id: self.quote_id,
            action,
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InspectPayloadDto {
    target: WorldCoordDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MovePayloadDto {
    to: WorldCoordDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaceMaterialPayloadDto {
    target: WorldCoordDto,
    material: u16,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaintCellsPayloadDto {
    cells: Vec<WorldCoordDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterSymbolPayloadDto {
    label: String,
    bounds: RectDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryPayloadDto {
    bounds: RectDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubmitNotePayloadDto {
    target: Option<WorldCoordDto>,
    body: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostQuoteDto {
    pub quote_id: String,
    pub cost: u32,
    pub expected_chunk_version: Option<u64>,
}

impl From<CostQuote> for CostQuoteDto {
    fn from(quote: CostQuote) -> Self {
        Self {
            quote_id: quote.quote_id,
            cost: quote.cost,
            expected_chunk_version: quote.expected_chunk_version,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResultDto {
    pub accepted: bool,
    pub event_id: Option<String>,
    pub reason: Option<String>,
    pub cost: u32,
    pub energy_remaining: u32,
    pub affected_cells: Vec<WorldCoordDto>,
    pub affected_chunks: Vec<String>,
    pub summary: String,
}

impl From<ActionResult> for ActionResultDto {
    fn from(result: ActionResult) -> Self {
        Self {
            accepted: result.accepted,
            event_id: result.event_id,
            reason: result.reason.map(rejection_reason),
            cost: result.cost,
            energy_remaining: result.energy_remaining,
            affected_cells: result.affected_cells.into_iter().map(Into::into).collect(),
            affected_chunks: result.affected_chunks,
            summary: result.summary,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPerceptionDto {
    pub world_id: String,
    pub agent_id: String,
    pub position: WorldCoordDto,
    pub memory_summary: String,
    pub visible_cells: Vec<CellSampleDto>,
    pub nearby_symbols: Vec<SymbolMetadataDto>,
    pub recent_events: Vec<String>,
    pub collaboration: serde_json::Value,
    pub available_actions: Vec<String>,
    pub available_tools: Vec<AgentToolDto>,
    pub world_energy: WorldEnergyViewDto,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub description: String,
}

impl From<AgentPerception> for AgentPerceptionDto {
    fn from(perception: AgentPerception) -> Self {
        Self {
            world_id: perception.world_id,
            agent_id: perception.agent_id,
            position: perception.position.into(),
            memory_summary: perception.memory_summary,
            visible_cells: perception
                .visible_cells
                .into_iter()
                .map(Into::into)
                .collect(),
            nearby_symbols: perception
                .nearby_symbols
                .into_iter()
                .map(Into::into)
                .collect(),
            recent_events: perception.recent_events,
            collaboration: serde_json::to_value(perception.collaboration).unwrap_or(serde_json::Value::Null),
            available_actions: perception.available_actions,
            available_tools: perception
                .available_tools
                .into_iter()
                .map(|tool| AgentToolDto {
                    id: tool.id,
                    name: tool.name,
                    kind: tool.kind,
                    description: tool.description,
                })
                .collect(),
            world_energy: perception.world_energy.into(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationResponseDto {
    pub ok: bool,
    pub operation: String,
    pub world_id: String,
    pub agent_id: String,
    pub area_id: Option<String>,
    pub result: serde_json::Value,
    pub error: Option<serde_json::Value>,
    pub next: Vec<String>,
}

impl From<CollaborationResponse> for CollaborationResponseDto {
    fn from(response: CollaborationResponse) -> Self {
        Self {
            ok: response.ok,
            operation: response.operation,
            world_id: response.world_id,
            agent_id: response.agent_id,
            area_id: response.area_id,
            result: response.result,
            error: response.error.map(|error| serde_json::to_value(error).unwrap_or(serde_json::Value::Null)),
            next: response.next,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellSampleDto {
    pub coord: WorldCoordDto,
    pub material: u16,
    pub state: u16,
    pub variant: u32,
    pub flags: u16,
}

impl From<VisibleCell> for CellSampleDto {
    fn from(cell: VisibleCell) -> Self {
        Self {
            coord: cell.coord.into(),
            material: cell.material.id(),
            state: cell.state,
            variant: cell.variant,
            flags: cell.flags,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEnergyViewDto {
    pub current: u32,
    pub cap: u32,
    pub regenerates_every_ticks: u64,
    pub next_regeneration_tick: u64,
}

impl From<WorldEnergyView> for WorldEnergyViewDto {
    fn from(energy: WorldEnergyView) -> Self {
        Self {
            current: energy.current,
            cap: energy.cap,
            regenerates_every_ticks: energy.regenerates_every_ticks,
            next_regeneration_tick: energy.next_regeneration_tick,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolMetadataDto {
    pub id: String,
    pub label: String,
    pub author_agent_id: String,
    pub bounds: RectDto,
    pub created_event_id: String,
    pub note: Option<String>,
}

impl From<SymbolRecord> for SymbolMetadataDto {
    fn from(symbol: SymbolRecord) -> Self {
        Self {
            id: symbol.id,
            label: symbol.label,
            author_agent_id: symbol.author_agent_id,
            bounds: RectDto {
                origin: symbol.origin.into(),
                width: symbol.width,
                height: symbol.height,
            },
            created_event_id: symbol.created_event_id,
            note: symbol.note,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEventDto {
    pub id: String,
    pub tick: u64,
    pub agent_id: String,
    pub cost: u32,
    pub affected_cells: Vec<WorldCoordDto>,
    pub affected_chunks: Vec<String>,
    pub summary: String,
}

impl From<WorldEvent> for WorldEventDto {
    fn from(event: WorldEvent) -> Self {
        Self {
            id: event.id,
            tick: event.tick,
            agent_id: event.agent_id,
            cost: event.cost,
            affected_cells: event.affected_cells.into_iter().map(Into::into).collect(),
            affected_chunks: event.affected_chunks,
            summary: event.summary,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkSnapshotDto {
    pub world_id: String,
    pub chunk: ChunkCoordDto,
    pub version: u64,
    pub cells: Vec<CellSampleDto>,
}

impl From<ChunkSnapshot> for ChunkSnapshotDto {
    fn from(snapshot: ChunkSnapshot) -> Self {
        Self {
            world_id: snapshot.world_id,
            chunk: snapshot.chunk.into(),
            version: snapshot.version,
            cells: snapshot
                .cells
                .into_iter()
                .map(|cell| CellSampleDto {
                    coord: cell.coord.into(),
                    material: cell.material_id,
                    state: cell.state,
                    variant: cell.variant,
                    flags: cell.flags,
                })
                .collect(),
        }
    }
}

impl ChunkSnapshotDto {
    pub fn from_chunk(world_id: impl Into<String>, chunk: &Chunk) -> Self {
        ChunkSnapshot::from_chunk(world_id, chunk).into()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchEnvelopeDto {
    pub protocol_version: u16,
    pub world_id: String,
    pub chunk: ChunkCoordDto,
    pub base_version: u64,
    pub next_version: u64,
    pub event_id: String,
    pub body: PatchBodyDto,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "encoding", rename_all = "snake_case")]
pub enum PatchBodyDto {
    ChangedCells { cells: Vec<CellSampleDto> },
    FullChunk { snapshot: ChunkSnapshotDto },
}

impl From<PatchEnvelope> for PatchEnvelopeDto {
    fn from(patch: PatchEnvelope) -> Self {
        let body = match patch.body {
            PatchBody::ChangedCells(cells) => PatchBodyDto::ChangedCells {
                cells: cells
                    .into_iter()
                    .map(|cell| CellSampleDto {
                        coord: cell.coord.into(),
                        material: cell.material_id,
                        state: cell.state,
                        variant: cell.variant,
                        flags: cell.flags,
                    })
                    .collect(),
            },
            PatchBody::FullChunk(snapshot) => PatchBodyDto::FullChunk {
                snapshot: snapshot.into(),
            },
        };

        Self {
            protocol_version: patch.protocol_version,
            world_id: patch.world_id,
            chunk: patch.chunk.into(),
            base_version: patch.base_version,
            next_version: patch.next_version,
            event_id: patch.event_id,
            body,
        }
    }
}

pub fn patch_dtos_from_result(
    world_id: &str,
    base_versions: &BTreeMap<ChunkCoord, u64>,
    chunks: impl Fn(ChunkCoord) -> Option<Chunk>,
    result: &ActionResult,
) -> Vec<PatchEnvelopeDto> {
    let Some(event_id) = result.event_id.as_ref() else {
        return Vec::new();
    };

    let mut by_chunk: BTreeMap<ChunkCoord, Vec<WorldCoord>> = BTreeMap::new();
    for coord in &result.affected_cells {
        by_chunk.entry(coord.chunk).or_default().push(*coord);
    }

    by_chunk
        .into_iter()
        .filter_map(|(chunk_coord, changed)| {
            let chunk = chunks(chunk_coord)?;
            let base_version = base_versions
                .get(&chunk_coord)
                .copied()
                .unwrap_or(chunk.version);
            Some(
                PatchEnvelope::from_changed_cells(
                    world_id,
                    event_id.clone(),
                    &chunk,
                    base_version,
                    &changed,
                )
                .into(),
            )
        })
        .collect()
}

pub fn base_versions_for(
    action: &ActionKind,
    chunk_version: impl Fn(ChunkCoord) -> Option<u64>,
) -> BTreeMap<ChunkCoord, u64> {
    let mut versions = BTreeMap::new();
    for chunk in action_chunks(action) {
        versions.insert(chunk, chunk_version(chunk).unwrap_or(0));
    }
    versions
}

fn action_chunks(action: &ActionKind) -> Vec<ChunkCoord> {
    match action {
        ActionKind::Inspect { target }
        | ActionKind::PlaceMaterial { target, .. }
        | ActionKind::SubmitNote {
            target: Some(target),
            ..
        } => vec![target.chunk],
        ActionKind::Move { to } => vec![to.chunk],
        ActionKind::PaintCells { cells } => cells.iter().map(|coord| coord.chunk).collect(),
        ActionKind::RegisterSymbol { origin, .. } | ActionKind::History { origin, .. } => {
            vec![origin.chunk]
        }
        ActionKind::Observe | ActionKind::SubmitNote { target: None, .. } => Vec::new(),
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorDto {
    pub reason: String,
    pub message: String,
}

pub fn api_error(reason: RejectionReason, message: impl Into<String>) -> ApiErrorDto {
    ApiErrorDto {
        reason: rejection_reason(reason),
        message: message.into(),
    }
}

pub fn rejection_reason(reason: RejectionReason) -> String {
    match reason {
        RejectionReason::Malformed => "malformed",
        RejectionReason::Unauthenticated => "unauthenticated",
        RejectionReason::PermissionDenied => "permission_denied",
        RejectionReason::InsufficientEnergy => "insufficient_energy",
        RejectionReason::StaleChunkVersion => "stale_chunk_version",
        RejectionReason::InvalidTarget => "invalid_target",
        RejectionReason::IllegalMaterialOverwrite => "illegal_material_overwrite",
        RejectionReason::OutOfRange => "out_of_range",
        RejectionReason::PersistenceFailed => "persistence_failed",
    }
    .to_string()
}

fn payload<T>(value: serde_json::Value) -> Result<T, RejectionReason>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(value).map_err(|_| RejectionReason::Malformed)
}

fn material_from_id(id: u16) -> Result<Material, RejectionReason> {
    Material::try_from_id(id).map_err(|_| RejectionReason::Malformed)
}

pub fn chunk_snapshot_cells(chunk: &Chunk) -> Vec<CellSampleDto> {
    let mut cells = Vec::new();
    for y in 0..CHUNK_SIZE {
        for x in 0..CHUNK_SIZE {
            let cell_coord = CellCoord::new(x as i32, y as i32).expect("valid chunk coordinate");
            let cell = chunk.cell(cell_coord);
            cells.push(CellSampleDto {
                coord: WorldCoord::new(chunk.coord, cell_coord).into(),
                material: cell.material.id(),
                state: cell.state,
                variant: cell.variant,
                flags: cell.flags,
            });
        }
    }
    cells
}
