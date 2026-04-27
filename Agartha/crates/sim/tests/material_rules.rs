use agartha_sim::materials::{Material, RuleContext, RulePass};
use agartha_sim::world::{CellCoord, Chunk, ChunkCoord};

#[test]
fn painting_a_cell_changes_only_that_cell_and_is_quiescent() {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let target = CellCoord::new(10, 10).unwrap();

    let changes = chunk.place_material(target, Material::Paint, 0).unwrap();

    assert_eq!(changes.len(), 1);
    assert_eq!(chunk.cell(target).material, Material::Paint);

    let pass = RulePass::run(&chunk, RuleContext::for_tick(1));

    assert!(pass.changed_cells.is_empty());
    assert!(pass.quiescent);
}

#[test]
fn stone_resists_lower_priority_overwrite() {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let target = CellCoord::new(4, 4).unwrap();

    chunk.place_material(target, Material::Stone, 0).unwrap();

    let error = chunk
        .place_material(target, Material::Paint, 0)
        .unwrap_err();

    assert_eq!(error.to_string(), "stone resists lower-priority overwrite");
    assert_eq!(chunk.cell(target).material, Material::Stone);
}

#[test]
fn water_moves_only_to_local_valid_neighbors() {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let source = CellCoord::new(20, 20).unwrap();
    let below = CellCoord::new(20, 21).unwrap();

    chunk.place_material(source, Material::Water, 0).unwrap();

    let pass = RulePass::run(&chunk, RuleContext::for_tick(1));
    let next = pass.apply_to(chunk);

    assert_eq!(next.cell(source).material, Material::Empty);
    assert_eq!(next.cell(below).material, Material::Water);
    assert!(pass.changed_cells.contains(&source));
    assert!(pass.changed_cells.contains(&below));
    assert!(!pass.writes_outside_chunk);
}

#[test]
fn fire_spreads_to_adjacent_plants_and_burns_out() {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let fire = CellCoord::new(30, 30).unwrap();
    let plant = CellCoord::new(31, 30).unwrap();

    chunk.place_material(fire, Material::Fire, 0).unwrap();
    chunk.place_material(plant, Material::Plant, 0).unwrap();

    let pass = RulePass::run(&chunk, RuleContext::for_tick(1));
    let next = pass.apply_to(chunk);

    assert_eq!(next.cell(plant).material, Material::Fire);
    assert!(pass.changed_cells.contains(&plant));

    let mut burned = next;
    for tick in 2..=6 {
        burned = RulePass::run(&burned, RuleContext::for_tick(tick)).apply_to(burned);
    }

    assert_eq!(burned.cell(fire).material, Material::Empty);
}

#[test]
fn plant_growth_uses_slow_cadence_near_water_and_respects_density() {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let plant = CellCoord::new(40, 40).unwrap();
    let water = CellCoord::new(41, 40).unwrap();

    chunk.place_material(plant, Material::Plant, 0).unwrap();
    chunk.place_material(water, Material::Water, 0).unwrap();
    chunk
        .place_material(CellCoord::new(41, 41).unwrap(), Material::Stone, 0)
        .unwrap();
    chunk
        .place_material(CellCoord::new(42, 40).unwrap(), Material::Stone, 0)
        .unwrap();

    let waiting = RulePass::run(&chunk, RuleContext::for_tick(1));
    assert!(waiting.changed_cells.is_empty());

    let growing = RulePass::run(&chunk, RuleContext::for_tick(4));
    let next = growing.apply_to(chunk);

    assert!(growing
        .changed_cells
        .iter()
        .any(|coord| next.cell(*coord).material == Material::Plant));
}

#[test]
fn border_rules_report_activity_without_writing_outside_chunk() {
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    let border = CellCoord::new(10, 127).unwrap();

    chunk.place_material(border, Material::Water, 0).unwrap();
    let pass = RulePass::run(&chunk, RuleContext::for_tick(1));

    assert!(pass.touched_borders.south);
    assert!(!pass.writes_outside_chunk);
}

#[test]
fn malformed_raw_material_ids_fail_fast() {
    let error = Chunk::from_raw_materials(ChunkCoord::new(0, 0), vec![99]).unwrap_err();

    assert_eq!(error.to_string(), "raw chunk material length must be 16384");

    let error = Chunk::from_raw_materials(ChunkCoord::new(0, 0), vec![99; 128 * 128]).unwrap_err();

    assert_eq!(error.to_string(), "invalid material id 99");
}
