use agartha_sim::world::WorldCoord;

use crate::actions::energy::EnergyAccount;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub bearer_token: String,
    pub position: WorldCoord,
    pub perception_radius: i32,
    pub action_range: i32,
    pub memory_summary: String,
    pub energy: EnergyAccount,
}

impl AgentRecord {
    pub fn first_demo(
        id: impl Into<String>,
        name: impl Into<String>,
        token: impl Into<String>,
        position: WorldCoord,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            bearer_token: token.into(),
            position,
            perception_radius: 16,
            action_range: 24,
            memory_summary: "Newly seeded in the origin region.".to_string(),
            energy: EnergyAccount::first_demo(),
        }
    }
}
