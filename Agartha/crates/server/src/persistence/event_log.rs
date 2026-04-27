use agartha_sim::world::WorldCoord;

use crate::events::WorldEvent;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReplaySelection {
    pub origin: WorldCoord,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Default)]
pub struct EventLog {
    events: Vec<WorldEvent>,
}

impl EventLog {
    pub fn append(&mut self, event: WorldEvent) {
        self.events.push(event);
    }

    pub fn events_for_selection(&self, selection: ReplaySelection) -> Vec<WorldEvent> {
        self.events
            .iter()
            .filter(|event| {
                event
                    .affected_cells
                    .iter()
                    .any(|cell| contains(selection, *cell))
            })
            .cloned()
            .collect()
    }
}

fn contains(selection: ReplaySelection, coord: WorldCoord) -> bool {
    let (origin_x, origin_y) = selection.origin.absolute();
    let (coord_x, coord_y) = coord.absolute();
    coord_x >= origin_x
        && coord_y >= origin_y
        && coord_x < origin_x + selection.width as i32
        && coord_y < origin_y + selection.height as i32
}
