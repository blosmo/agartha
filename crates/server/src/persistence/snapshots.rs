use std::collections::BTreeMap;

use agartha_sim::world::{Chunk, ChunkCoord};

#[derive(Clone, Debug, Default)]
pub struct SnapshotStore {
    chunks: BTreeMap<ChunkCoord, Chunk>,
}

impl SnapshotStore {
    pub fn write_chunk(&mut self, chunk: Chunk) {
        self.chunks.insert(chunk.coord, chunk);
    }

    pub fn chunk(&self, coord: ChunkCoord) -> Option<&Chunk> {
        self.chunks.get(&coord)
    }
}
