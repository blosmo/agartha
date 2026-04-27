use std::collections::BTreeMap;

use agartha_sim::frontier::{ActiveFrontier, ActiveReason, ChunkLifecycle, TickBudget};
use agartha_sim::materials::Material;
use agartha_sim::world::{CellCoord, Chunk, ChunkCoord};

#[test]
fn agent_edit_wakes_static_chunk_and_then_sleeps_after_stabilization() {
    let coord = ChunkCoord::new(0, 0);
    let mut frontier = ActiveFrontier::new();
    let mut chunks = BTreeMap::new();
    let mut chunk = Chunk::new(coord);
    chunk
        .place_material(CellCoord::new(10, 10).unwrap(), Material::Paint, 0)
        .unwrap();
    chunks.insert(coord, chunk);

    frontier.wake_chunk(coord, ActiveReason::AgentEdit);

    assert_eq!(frontier.status(coord), ChunkLifecycle::Active);

    let report = frontier.tick(&mut chunks, 1, TickBudget::new(1));

    assert_eq!(report.processed_chunks, 1);
    assert_eq!(frontier.status(coord), ChunkLifecycle::Sleeping);
    assert_eq!(report.sleeping_chunks, vec![coord]);
}

#[test]
fn water_at_border_wakes_adjacent_chunk_from_halo_change() {
    let coord = ChunkCoord::new(0, 0);
    let south = ChunkCoord::new(0, 1);
    let mut frontier = ActiveFrontier::new();
    let mut chunks = BTreeMap::new();
    let mut chunk = Chunk::new(coord);
    chunk
        .place_material(CellCoord::new(10, 127).unwrap(), Material::Water, 0)
        .unwrap();
    chunks.insert(coord, chunk);

    frontier.wake_chunk(coord, ActiveReason::DynamicMaterial);
    let report = frontier.tick(&mut chunks, 1, TickBudget::new(1));

    assert!(report.woken_neighbors.contains(&south));
    assert_eq!(frontier.status(south), ChunkLifecycle::Active);
}

#[test]
fn dynamic_material_waits_until_its_next_scheduled_tick() {
    let coord = ChunkCoord::new(0, 0);
    let mut frontier = ActiveFrontier::new();
    let mut chunks = BTreeMap::new();
    let mut chunk = Chunk::new(coord);
    chunk
        .place_material(CellCoord::new(12, 12).unwrap(), Material::Plant, 0)
        .unwrap();
    chunks.insert(coord, chunk);

    frontier.wake_chunk(coord, ActiveReason::DynamicMaterial);
    let report = frontier.tick(&mut chunks, 2, TickBudget::new(8));

    assert_eq!(report.waiting_chunks, vec![(coord, 6)]);
    assert_eq!(
        frontier.status(coord),
        ChunkLifecycle::Waiting { due_tick: 6 }
    );

    let report = frontier.tick(&mut chunks, 5, TickBudget::new(8));
    assert_eq!(report.processed_chunks, 0);
    assert_eq!(
        frontier.status(coord),
        ChunkLifecycle::Waiting { due_tick: 6 }
    );
}

#[test]
fn tick_budget_defers_excess_active_chunks_without_losing_reasons() {
    let mut frontier = ActiveFrontier::new();
    let mut chunks = BTreeMap::new();

    for x in 0..3 {
        let coord = ChunkCoord::new(x, 0);
        chunks.insert(coord, Chunk::new(coord));
        frontier.wake_chunk(coord, ActiveReason::AgentEdit);
    }

    let report = frontier.tick(&mut chunks, 1, TickBudget::new(1));

    assert_eq!(report.processed_chunks, 1);
    assert_eq!(report.deferred_chunks, 2);
    assert_eq!(
        frontier.active_reasons(ChunkCoord::new(1, 0)),
        vec![ActiveReason::AgentEdit]
    );
}
