use std::fmt;

use crate::materials::{Material, MaterialError};

use super::{CellCoord, ChunkCoord, CHUNK_SIZE};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Cell {
    pub material: Material,
    pub state: u16,
    pub variant: u32,
    pub flags: u16,
}

impl Cell {
    pub const fn empty() -> Self {
        Self {
            material: Material::Empty,
            state: 0,
            variant: 0,
            flags: 0,
        }
    }

    pub const fn with_material(material: Material, variant: u32) -> Self {
        Self {
            material,
            state: 0,
            variant,
            flags: 0,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Chunk {
    pub coord: ChunkCoord,
    pub version: u64,
    cells: Vec<Cell>,
}

impl Chunk {
    pub fn new(coord: ChunkCoord) -> Self {
        Self {
            coord,
            version: 0,
            cells: vec![Cell::empty(); CHUNK_SIZE * CHUNK_SIZE],
        }
    }

    pub fn from_raw_materials(coord: ChunkCoord, materials: Vec<u16>) -> Result<Self, ChunkError> {
        if materials.len() != CHUNK_SIZE * CHUNK_SIZE {
            return Err(ChunkError::InvalidRawLength {
                actual: materials.len(),
            });
        }

        let mut chunk = Self::new(coord);
        for (index, material_id) in materials.into_iter().enumerate() {
            chunk.cells[index].material = Material::try_from_id(material_id)?;
        }

        Ok(chunk)
    }

    pub fn index(&self, coord: CellCoord) -> usize {
        coord.y as usize * CHUNK_SIZE + coord.x as usize
    }

    pub fn cell(&self, coord: CellCoord) -> Cell {
        self.cells[self.index(coord)]
    }

    pub fn cells(&self) -> &[Cell] {
        &self.cells
    }

    pub fn set_cell(&mut self, coord: CellCoord, cell: Cell) -> Vec<CellCoord> {
        let index = self.index(coord);
        if self.cells[index] == cell {
            return Vec::new();
        }

        self.cells[index] = cell;
        self.version += 1;
        vec![coord]
    }

    pub fn place_material(
        &mut self,
        coord: CellCoord,
        material: Material,
        variant: u32,
    ) -> Result<Vec<CellCoord>, ChunkError> {
        let current = self.cell(coord);

        if current.material == Material::Stone && material.priority() < current.material.priority()
        {
            return Err(ChunkError::StoneResistsOverwrite);
        }

        Ok(self.set_cell(coord, Cell::with_material(material, variant)))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChunkError {
    InvalidRawLength { actual: usize },
    Material(MaterialError),
    StoneResistsOverwrite,
}

impl fmt::Display for ChunkError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ChunkError::InvalidRawLength { actual } => write!(
                formatter,
                "raw chunk material length must be {}",
                CHUNK_SIZE * CHUNK_SIZE
            )
            .and_then(|_| {
                if *actual == CHUNK_SIZE * CHUNK_SIZE {
                    Ok(())
                } else {
                    Ok(())
                }
            }),
            ChunkError::Material(error) => error.fmt(formatter),
            ChunkError::StoneResistsOverwrite => {
                write!(formatter, "stone resists lower-priority overwrite")
            }
        }
    }
}

impl std::error::Error for ChunkError {}

impl From<MaterialError> for ChunkError {
    fn from(value: MaterialError) -> Self {
        ChunkError::Material(value)
    }
}
