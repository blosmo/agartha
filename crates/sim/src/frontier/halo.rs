use std::fmt;

use crate::world::{Cell, Chunk, Direction, CHUNK_SIZE};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BorderHalo {
    pub north: Vec<Cell>,
    pub east: Vec<Cell>,
    pub south: Vec<Cell>,
    pub west: Vec<Cell>,
}

impl BorderHalo {
    pub fn from_chunk(chunk: &Chunk) -> Self {
        let mut north = Vec::with_capacity(CHUNK_SIZE);
        let mut east = Vec::with_capacity(CHUNK_SIZE);
        let mut south = Vec::with_capacity(CHUNK_SIZE);
        let mut west = Vec::with_capacity(CHUNK_SIZE);

        for index in 0..CHUNK_SIZE {
            north.push(chunk.cell(crate::world::CellCoord::new(index as i32, 0).unwrap()));
            east.push(chunk.cell(
                crate::world::CellCoord::new((CHUNK_SIZE - 1) as i32, index as i32).unwrap(),
            ));
            south.push(chunk.cell(
                crate::world::CellCoord::new(index as i32, (CHUNK_SIZE - 1) as i32).unwrap(),
            ));
            west.push(chunk.cell(crate::world::CellCoord::new(0, index as i32).unwrap()));
        }

        Self {
            north,
            east,
            south,
            west,
        }
    }

    pub fn from_edges(
        north: Vec<Cell>,
        east: Vec<Cell>,
        south: Vec<Cell>,
        west: Vec<Cell>,
    ) -> Result<Self, HaloError> {
        let halo = Self {
            north,
            east,
            south,
            west,
        };
        halo.validate()?;
        Ok(halo)
    }

    pub fn edge(&self, direction: Direction) -> &[Cell] {
        match direction {
            Direction::North => &self.north,
            Direction::East => &self.east,
            Direction::South => &self.south,
            Direction::West => &self.west,
        }
    }

    pub fn validate(&self) -> Result<(), HaloError> {
        for (direction, edge) in [
            (Direction::North, &self.north),
            (Direction::East, &self.east),
            (Direction::South, &self.south),
            (Direction::West, &self.west),
        ] {
            if edge.len() != CHUNK_SIZE {
                return Err(HaloError::InvalidEdgeLength {
                    direction,
                    actual: edge.len(),
                });
            }
        }

        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HaloExchange {
    previous: BorderHalo,
    next: BorderHalo,
}

impl HaloExchange {
    pub fn new(previous: BorderHalo, next: BorderHalo) -> Result<Self, HaloError> {
        previous.validate()?;
        next.validate()?;
        Ok(Self { previous, next })
    }

    pub fn changed_edges(&self) -> Vec<Direction> {
        [
            Direction::North,
            Direction::East,
            Direction::South,
            Direction::West,
        ]
        .into_iter()
        .filter(|direction| self.previous.edge(*direction) != self.next.edge(*direction))
        .collect()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HaloError {
    InvalidEdgeLength { direction: Direction, actual: usize },
}

impl fmt::Display for HaloError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HaloError::InvalidEdgeLength { direction, actual } => write!(
                formatter,
                "halo edge {direction:?} length {actual} must be {CHUNK_SIZE}"
            ),
        }
    }
}

impl std::error::Error for HaloError {}
