pub mod energy;
pub mod perception;
pub mod validation;

use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthContext {
    pub bearer_token: String,
}

impl AuthContext {
    pub fn bearer(token: impl Into<String>) -> Self {
        Self {
            bearer_token: token.into(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionKind {
    Observe,
    Inspect {
        target: WorldCoord,
    },
    Move {
        to: WorldCoord,
    },
    PlaceMaterial {
        target: WorldCoord,
        material: Material,
    },
    PaintCells {
        cells: Vec<WorldCoord>,
    },
    RegisterSymbol {
        label: String,
        origin: WorldCoord,
        width: u32,
        height: u32,
    },
    History {
        origin: WorldCoord,
        width: u32,
        height: u32,
    },
    SubmitNote {
        target: Option<WorldCoord>,
        body: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionRequest {
    pub claimed_agent_id: String,
    pub expected_chunk_version: Option<u64>,
    pub quote_id: Option<String>,
    pub action: ActionKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CostQuote {
    pub quote_id: String,
    pub cost: u32,
    pub expected_chunk_version: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionResult {
    pub accepted: bool,
    pub event_id: Option<String>,
    pub reason: Option<RejectionReason>,
    pub cost: u32,
    pub energy_remaining: u32,
    pub affected_cells: Vec<WorldCoord>,
    pub affected_chunks: Vec<String>,
    pub summary: String,
}

impl ActionResult {
    pub fn rejected(reason: RejectionReason, cost: u32, energy_remaining: u32) -> Self {
        Self {
            accepted: false,
            event_id: None,
            reason: Some(reason),
            cost,
            energy_remaining,
            affected_cells: Vec::new(),
            affected_chunks: Vec::new(),
            summary: "action rejected".to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RejectionReason {
    Malformed,
    Unauthenticated,
    PermissionDenied,
    InsufficientEnergy,
    StaleChunkVersion,
    InvalidTarget,
    IllegalMaterialOverwrite,
    OutOfRange,
    PersistenceFailed,
}
