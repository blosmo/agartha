use crate::world::{Cell, CellCoord, Chunk, CHUNK_SIZE};

use super::Material;

const FIRE_LIFETIME_TICKS: u16 = 4;
const FIRE_SPREAD_LIMIT: usize = 2;
const PLANT_GROWTH_CADENCE: u64 = 4;
const PLANT_DENSITY_LIMIT: usize = 4;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RuleContext {
    pub tick: u64,
}

impl RuleContext {
    pub const fn for_tick(tick: u64) -> Self {
        Self { tick }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct BorderTouches {
    pub north: bool,
    pub east: bool,
    pub south: bool,
    pub west: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RulePass {
    pub changed_cells: Vec<CellCoord>,
    pub touched_borders: BorderTouches,
    pub writes_outside_chunk: bool,
    pub quiescent: bool,
    updates: Vec<(CellCoord, Cell)>,
}

impl RulePass {
    pub fn run(chunk: &Chunk, context: RuleContext) -> Self {
        let mut pass = Self {
            changed_cells: Vec::new(),
            touched_borders: BorderTouches::default(),
            writes_outside_chunk: false,
            quiescent: true,
            updates: Vec::new(),
        };

        for y in 0..CHUNK_SIZE {
            for x in 0..CHUNK_SIZE {
                let coord = CellCoord::new(x as i32, y as i32)
                    .expect("loop bounds produce in-chunk coordinates");
                let cell = chunk.cell(coord);

                match cell.material {
                    Material::Empty | Material::Paint | Material::Stone => {}
                    Material::Water => apply_water(chunk, coord, &mut pass),
                    Material::Fire => apply_fire(chunk, coord, cell, &mut pass),
                    Material::Plant => apply_plant(chunk, coord, context, &mut pass),
                }
            }
        }

        pass.quiescent =
            pass.updates.is_empty() && chunk.cells().iter().all(|cell| !cell.material.is_dynamic());
        pass
    }

    pub fn apply_to(&self, mut chunk: Chunk) -> Chunk {
        for (coord, cell) in &self.updates {
            chunk.set_cell(*coord, *cell);
        }
        chunk
    }

    fn push_update(&mut self, coord: CellCoord, cell: Cell) {
        if self.updates.iter().any(|(existing, _)| *existing == coord) {
            return;
        }

        self.changed_cells.push(coord);
        self.updates.push((coord, cell));
    }
}

fn apply_water(chunk: &Chunk, coord: CellCoord, pass: &mut RulePass) {
    pass.quiescent = false;
    touch_border(coord, &mut pass.touched_borders);

    if let Some(down) = coord.offset(0, 1) {
        if chunk.cell(down).material == Material::Empty {
            pass.push_update(coord, Cell::empty());
            pass.push_update(down, Cell::with_material(Material::Water, 0));
            return;
        }
    }

    for dx in [1, -1] {
        if let Some(side) = coord.offset(dx, 0) {
            if chunk.cell(side).material == Material::Empty {
                pass.push_update(coord, Cell::empty());
                pass.push_update(side, Cell::with_material(Material::Water, 0));
                return;
            }
        }
    }
}

fn apply_fire(chunk: &Chunk, coord: CellCoord, cell: Cell, pass: &mut RulePass) {
    pass.quiescent = false;
    touch_border(coord, &mut pass.touched_borders);

    let mut spread = 0;
    for neighbor in cardinal_neighbors(coord) {
        if spread >= FIRE_SPREAD_LIMIT {
            break;
        }

        if chunk.cell(neighbor).material == Material::Plant {
            pass.push_update(neighbor, Cell::with_material(Material::Fire, 0));
            spread += 1;
        }
    }

    let next_age = cell.state + 1;
    if next_age >= FIRE_LIFETIME_TICKS {
        pass.push_update(coord, Cell::empty());
    } else {
        pass.push_update(
            coord,
            Cell {
                state: next_age,
                ..cell
            },
        );
    }
}

fn apply_plant(chunk: &Chunk, coord: CellCoord, context: RuleContext, pass: &mut RulePass) {
    touch_border(coord, &mut pass.touched_borders);

    if context.tick % PLANT_GROWTH_CADENCE != 0 || !has_adjacent_water(chunk, coord) {
        return;
    }

    if cardinal_neighbors(coord)
        .into_iter()
        .filter(|neighbor| chunk.cell(*neighbor).material == Material::Plant)
        .count()
        >= PLANT_DENSITY_LIMIT
    {
        return;
    }

    if let Some(target) = cardinal_neighbors(coord)
        .into_iter()
        .find(|neighbor| chunk.cell(*neighbor).material == Material::Empty)
    {
        pass.push_update(target, Cell::with_material(Material::Plant, 0));
    }
}

fn has_adjacent_water(chunk: &Chunk, coord: CellCoord) -> bool {
    cardinal_neighbors(coord)
        .into_iter()
        .any(|neighbor| chunk.cell(neighbor).material == Material::Water)
}

fn cardinal_neighbors(coord: CellCoord) -> Vec<CellCoord> {
    [(0, -1), (1, 0), (0, 1), (-1, 0)]
        .into_iter()
        .filter_map(|(dx, dy)| coord.offset(dx, dy))
        .collect()
}

fn touch_border(coord: CellCoord, borders: &mut BorderTouches) {
    borders.north |= coord.y == 0;
    borders.east |= coord.x as usize == CHUNK_SIZE - 1;
    borders.south |= coord.y as usize == CHUNK_SIZE - 1;
    borders.west |= coord.x == 0;
}
