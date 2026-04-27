use super::Material;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MaterialBudget {
    pub material: Material,
    pub neighborhood_radius: u8,
    pub update_cadence_ticks: u64,
    pub lifetime_ticks: Option<u16>,
    pub spread_limit_per_tick: u8,
}

pub const MATERIAL_BUDGETS: [MaterialBudget; 6] = [
    MaterialBudget {
        material: Material::Empty,
        neighborhood_radius: 0,
        update_cadence_ticks: 0,
        lifetime_ticks: None,
        spread_limit_per_tick: 0,
    },
    MaterialBudget {
        material: Material::Paint,
        neighborhood_radius: 0,
        update_cadence_ticks: 0,
        lifetime_ticks: None,
        spread_limit_per_tick: 0,
    },
    MaterialBudget {
        material: Material::Stone,
        neighborhood_radius: 0,
        update_cadence_ticks: 0,
        lifetime_ticks: None,
        spread_limit_per_tick: 0,
    },
    MaterialBudget {
        material: Material::Water,
        neighborhood_radius: 1,
        update_cadence_ticks: 1,
        lifetime_ticks: None,
        spread_limit_per_tick: 1,
    },
    MaterialBudget {
        material: Material::Fire,
        neighborhood_radius: 1,
        update_cadence_ticks: 1,
        lifetime_ticks: Some(4),
        spread_limit_per_tick: 2,
    },
    MaterialBudget {
        material: Material::Plant,
        neighborhood_radius: 1,
        update_cadence_ticks: 4,
        lifetime_ticks: None,
        spread_limit_per_tick: 1,
    },
];
