use agartha_sim::world::{CellCoord, Chunk, ChunkCoord, WorldCoord, CHUNK_SIZE};

#[test]
fn absolute_coordinates_map_across_chunk_edges() {
    assert_eq!(
        WorldCoord::from_absolute(127, 0),
        WorldCoord::new(ChunkCoord::new(0, 0), CellCoord::new(127, 0).unwrap())
    );
    assert_eq!(
        WorldCoord::from_absolute(128, 0),
        WorldCoord::new(ChunkCoord::new(1, 0), CellCoord::new(0, 0).unwrap())
    );
    assert_eq!(
        WorldCoord::from_absolute(-1, -129),
        WorldCoord::new(ChunkCoord::new(-1, -2), CellCoord::new(127, 127).unwrap())
    );
}

#[test]
fn chunk_indexing_accepts_only_in_chunk_cells() {
    let chunk = Chunk::new(ChunkCoord::new(0, 0));

    assert_eq!(chunk.index(CellCoord::new(0, 0).unwrap()), 0);
    assert_eq!(
        chunk.index(CellCoord::new(127, 127).unwrap()),
        CHUNK_SIZE * CHUNK_SIZE - 1
    );
    assert!(CellCoord::new(128, 0).is_err());
    assert!(CellCoord::new(0, 128).is_err());
}
