use agartha_sim::world::{CellCoord, Chunk, ChunkCoord, WorldCoord};

pub const FULL_SNAPSHOT_CELL_THRESHOLD: usize = 512;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChangedCell {
    pub coord: WorldCoord,
    pub material_id: u16,
    pub state: u16,
    pub variant: u32,
    pub flags: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChunkSnapshot {
    pub world_id: String,
    pub chunk: ChunkCoord,
    pub version: u64,
    pub cells: Vec<ChangedCell>,
}

impl ChunkSnapshot {
    pub fn from_chunk(world_id: impl Into<String>, chunk: &Chunk) -> Self {
        let mut cells = Vec::new();
        for y in 0..agartha_sim::world::CHUNK_SIZE {
            for x in 0..agartha_sim::world::CHUNK_SIZE {
                let cell_coord = CellCoord::new(x as i32, y as i32).unwrap();
                let cell = chunk.cell(cell_coord);
                cells.push(ChangedCell {
                    coord: WorldCoord::new(chunk.coord, cell_coord),
                    material_id: cell.material.id(),
                    state: cell.state,
                    variant: cell.variant,
                    flags: cell.flags,
                });
            }
        }

        Self {
            world_id: world_id.into(),
            chunk: chunk.coord,
            version: chunk.version,
            cells,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PatchBody {
    ChangedCells(Vec<ChangedCell>),
    FullChunk(ChunkSnapshot),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PatchEnvelope {
    pub protocol_version: u16,
    pub world_id: String,
    pub chunk: ChunkCoord,
    pub base_version: u64,
    pub next_version: u64,
    pub event_id: String,
    pub body: PatchBody,
}

impl PatchEnvelope {
    pub fn from_changed_cells(
        world_id: impl Into<String>,
        event_id: impl Into<String>,
        chunk: &Chunk,
        base_version: u64,
        changed_cells: &[WorldCoord],
    ) -> Self {
        let world_id = world_id.into();
        let event_id = event_id.into();
        let body = if changed_cells.len() > FULL_SNAPSHOT_CELL_THRESHOLD {
            PatchBody::FullChunk(ChunkSnapshot::from_chunk(world_id.clone(), chunk))
        } else {
            PatchBody::ChangedCells(
                changed_cells
                    .iter()
                    .filter(|coord| coord.chunk == chunk.coord)
                    .map(|coord| {
                        let cell = chunk.cell(coord.cell);
                        ChangedCell {
                            coord: *coord,
                            material_id: cell.material.id(),
                            state: cell.state,
                            variant: cell.variant,
                            flags: cell.flags,
                        }
                    })
                    .collect(),
            )
        };

        Self {
            protocol_version: 1,
            world_id,
            chunk: chunk.coord,
            base_version,
            next_version: chunk.version,
            event_id,
            body,
        }
    }

    pub fn requires_snapshot_recovery(&self, current_version: Option<u64>) -> bool {
        current_version.is_some_and(|version| version != self.base_version)
    }
}
