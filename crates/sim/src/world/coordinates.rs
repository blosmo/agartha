use std::fmt;

pub const CHUNK_SIZE: usize = 128;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ChunkCoord {
    pub x: i32,
    pub y: i32,
}

impl ChunkCoord {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    pub const fn neighbor(self, direction: Direction) -> Self {
        match direction {
            Direction::North => Self::new(self.x, self.y - 1),
            Direction::East => Self::new(self.x + 1, self.y),
            Direction::South => Self::new(self.x, self.y + 1),
            Direction::West => Self::new(self.x - 1, self.y),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CellCoord {
    pub x: u8,
    pub y: u8,
}

impl CellCoord {
    pub fn new(x: i32, y: i32) -> Result<Self, CoordError> {
        if x < 0 || y < 0 || x >= CHUNK_SIZE as i32 || y >= CHUNK_SIZE as i32 {
            return Err(CoordError::OutOfBounds { x, y });
        }

        Ok(Self {
            x: x as u8,
            y: y as u8,
        })
    }

    pub fn offset(self, dx: i32, dy: i32) -> Option<Self> {
        Self::new(self.x as i32 + dx, self.y as i32 + dy).ok()
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct WorldCoord {
    pub chunk: ChunkCoord,
    pub cell: CellCoord,
}

impl WorldCoord {
    pub const fn new(chunk: ChunkCoord, cell: CellCoord) -> Self {
        Self { chunk, cell }
    }

    pub fn from_absolute(x: i32, y: i32) -> Self {
        let size = CHUNK_SIZE as i32;
        let chunk = ChunkCoord::new(x.div_euclid(size), y.div_euclid(size));
        let cell = CellCoord::new(x.rem_euclid(size), y.rem_euclid(size))
            .expect("rem_euclid with chunk size must produce in-chunk coordinates");

        Self { chunk, cell }
    }

    pub fn absolute(self) -> (i32, i32) {
        (
            self.chunk.x * CHUNK_SIZE as i32 + self.cell.x as i32,
            self.chunk.y * CHUNK_SIZE as i32 + self.cell.y as i32,
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoordError {
    OutOfBounds { x: i32, y: i32 },
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Direction {
    North,
    East,
    South,
    West,
}

impl fmt::Display for CoordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoordError::OutOfBounds { x, y } => write!(
                formatter,
                "cell coordinate ({x}, {y}) must be within 0..{}",
                CHUNK_SIZE - 1
            ),
        }
    }
}

impl std::error::Error for CoordError {}
