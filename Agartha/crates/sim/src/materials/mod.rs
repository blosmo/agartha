mod budget;
mod rules;

use std::fmt;

pub use budget::{MaterialBudget, MATERIAL_BUDGETS};
pub use rules::{BorderTouches, RuleContext, RulePass};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(u16)]
pub enum Material {
    Empty = 0,
    Paint = 1,
    Stone = 2,
    Water = 3,
    Fire = 4,
    Plant = 5,
}

impl Material {
    pub fn try_from_id(id: u16) -> Result<Self, MaterialError> {
        match id {
            0 => Ok(Self::Empty),
            1 => Ok(Self::Paint),
            2 => Ok(Self::Stone),
            3 => Ok(Self::Water),
            4 => Ok(Self::Fire),
            5 => Ok(Self::Plant),
            other => Err(MaterialError::InvalidId(other)),
        }
    }

    pub const fn id(self) -> u16 {
        self as u16
    }

    pub const fn priority(self) -> u8 {
        match self {
            Material::Empty => 0,
            Material::Paint | Material::Plant => 1,
            Material::Water | Material::Fire => 2,
            Material::Stone => 3,
        }
    }

    pub const fn is_dynamic(self) -> bool {
        matches!(self, Material::Water | Material::Fire | Material::Plant)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MaterialError {
    InvalidId(u16),
}

impl fmt::Display for MaterialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MaterialError::InvalidId(id) => write!(formatter, "invalid material id {id}"),
        }
    }
}

impl std::error::Error for MaterialError {}
