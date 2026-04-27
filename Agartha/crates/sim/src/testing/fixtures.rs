use crate::materials::Material;
use crate::world::{CellCoord, Chunk, ChunkCoord};

pub fn origin_chunk_with_landmarks() -> Chunk {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let landmarks = [
        (64, 64, Material::Water),
        (66, 64, Material::Plant),
        (70, 60, Material::Fire),
        (58, 66, Material::Stone),
        (59, 66, Material::Stone),
        (60, 66, Material::Stone),
    ];

    for (x, y, material) in landmarks {
        chunk
            .place_material(CellCoord::new(x, y).unwrap(), material, 0)
            .expect("fixture coordinates and materials are valid");
    }

    chunk
}
