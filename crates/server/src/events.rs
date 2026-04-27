use agartha_sim::world::WorldCoord;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldEvent {
    pub id: String,
    pub tick: u64,
    pub agent_id: String,
    pub cost: u32,
    pub affected_cells: Vec<WorldCoord>,
    pub affected_chunks: Vec<String>,
    pub summary: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SymbolRecord {
    pub id: String,
    pub label: String,
    pub author_agent_id: String,
    pub origin: WorldCoord,
    pub width: u32,
    pub height: u32,
    pub created_event_id: String,
    pub note: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldNote {
    pub id: String,
    pub event_id: String,
    pub agent_id: String,
    pub target: Option<WorldCoord>,
    pub body: String,
}
