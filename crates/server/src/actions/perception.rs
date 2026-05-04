use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VisibleCell {
    pub coord: WorldCoord,
    pub material: Material,
    pub state: u16,
    pub variant: u32,
    pub flags: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldEnergyView {
    pub current: u32,
    pub cap: u32,
    pub regenerates_every_ticks: u64,
    pub next_regeneration_tick: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentToolView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentPerception {
    pub world_id: String,
    pub agent_id: String,
    pub position: WorldCoord,
    pub memory_summary: String,
    pub visible_cells: Vec<VisibleCell>,
    pub nearby_symbols: Vec<crate::events::SymbolRecord>,
    pub recent_events: Vec<String>,
    pub collaboration: crate::collaboration::CollaborationContext,
    pub available_actions: Vec<String>,
    pub available_tools: Vec<AgentToolView>,
    pub world_energy: WorldEnergyView,
}
