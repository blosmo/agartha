use agartha_sim::materials::Material;

use super::ActionKind;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnergyAccount {
    pub current: u32,
    pub cap: u32,
    pub regenerates_every_ticks: u64,
    pub regenerates_amount: u32,
    pub last_regeneration_tick: u64,
}

impl EnergyAccount {
    pub fn first_demo() -> Self {
        Self {
            current: 5_000,
            cap: 10_000,
            regenerates_every_ticks: 1,
            regenerates_amount: 500,
            last_regeneration_tick: 0,
        }
    }

    pub fn regenerate_to_tick(&mut self, tick: u64) {
        if self.current >= self.cap || self.regenerates_every_ticks == 0 {
            self.last_regeneration_tick = tick;
            return;
        }

        let elapsed = tick.saturating_sub(self.last_regeneration_tick);
        let periods = elapsed / self.regenerates_every_ticks;
        if periods == 0 {
            return;
        }

        let gain = periods as u32 * self.regenerates_amount;
        self.current = self.cap.min(self.current + gain);
        self.last_regeneration_tick += periods * self.regenerates_every_ticks;
    }

    pub fn spend(&mut self, cost: u32) -> bool {
        if self.current < cost {
            return false;
        }

        self.current -= cost;
        true
    }
}

pub fn action_cost(action: &ActionKind) -> u32 {
    match action {
        ActionKind::Observe | ActionKind::Inspect { .. } | ActionKind::History { .. } => 0,
        ActionKind::Move { .. } => 1,
        ActionKind::PlaceMaterial { material, .. } => material_cost(*material),
        ActionKind::PaintCells { cells } => cells.len() as u32 * 2,
        ActionKind::RegisterSymbol { .. } => 3,
        ActionKind::SubmitNote { .. } => 1,
    }
}

pub fn material_cost(material: Material) -> u32 {
    match material {
        Material::Empty => 0,
        Material::Paint => 2,
        Material::Stone => 6,
        Material::Water => 8,
        Material::Fire => 12,
        Material::Plant => 10,
    }
}
