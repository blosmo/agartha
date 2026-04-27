use agartha_sim::world::WorldCoord;

use super::ActionKind;

pub fn primary_target(action: &ActionKind) -> Option<WorldCoord> {
    match action {
        ActionKind::Observe => None,
        ActionKind::Inspect { target } => Some(*target),
        ActionKind::Move { to } => Some(*to),
        ActionKind::PlaceMaterial { target, .. } => Some(*target),
        ActionKind::PaintCells { cells } => cells.first().copied(),
        ActionKind::RegisterSymbol { origin, .. } => Some(*origin),
        ActionKind::History { origin, .. } => Some(*origin),
        ActionKind::SubmitNote { target, .. } => *target,
    }
}

pub fn within_action_range(origin: WorldCoord, target: WorldCoord, range: i32) -> bool {
    let (origin_x, origin_y) = origin.absolute();
    let (target_x, target_y) = target.absolute();
    (origin_x - target_x).abs() <= range && (origin_y - target_y).abs() <= range
}
