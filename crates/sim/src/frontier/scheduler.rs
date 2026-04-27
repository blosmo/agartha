use std::collections::{BTreeMap, BTreeSet, VecDeque};

use crate::materials::{Material, RuleContext, RulePass};
use crate::world::{Chunk, ChunkCoord, Direction};

use super::{BorderHalo, HaloExchange, TickBudget};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ActiveReason {
    AgentEdit,
    DynamicMaterial,
    HaloChanged,
    ScheduledTick,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChunkLifecycle {
    Sleeping,
    Active,
    Waiting { due_tick: u64 },
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ChunkActivity {
    lifecycle: ChunkLifecycle,
    reasons: BTreeSet<ActiveReason>,
}

impl Default for ChunkActivity {
    fn default() -> Self {
        Self {
            lifecycle: ChunkLifecycle::Sleeping,
            reasons: BTreeSet::new(),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct TickReport {
    pub tick: u64,
    pub processed_chunks: usize,
    pub deferred_chunks: usize,
    pub sleeping_chunks: Vec<ChunkCoord>,
    pub waiting_chunks: Vec<(ChunkCoord, u64)>,
    pub woken_neighbors: Vec<ChunkCoord>,
    pub errors: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct ActiveFrontier {
    activity: BTreeMap<ChunkCoord, ChunkActivity>,
    queue: VecDeque<ChunkCoord>,
    halos: BTreeMap<ChunkCoord, BorderHalo>,
}

impl ActiveFrontier {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn wake_chunk(&mut self, coord: ChunkCoord, reason: ActiveReason) {
        let activity = self.activity.entry(coord).or_default();
        activity.lifecycle = ChunkLifecycle::Active;
        activity.reasons.insert(reason);
        if !self.queue.contains(&coord) {
            self.queue.push_back(coord);
        }
    }

    pub fn status(&self, coord: ChunkCoord) -> ChunkLifecycle {
        self.activity
            .get(&coord)
            .map(|activity| activity.lifecycle)
            .unwrap_or(ChunkLifecycle::Sleeping)
    }

    pub fn active_reasons(&self, coord: ChunkCoord) -> Vec<ActiveReason> {
        self.activity
            .get(&coord)
            .map(|activity| activity.reasons.iter().copied().collect())
            .unwrap_or_default()
    }

    pub fn tick(
        &mut self,
        chunks: &mut BTreeMap<ChunkCoord, Chunk>,
        tick: u64,
        budget: TickBudget,
    ) -> TickReport {
        self.promote_due_chunks(tick);

        let mut report = TickReport {
            tick,
            ..TickReport::default()
        };

        while report.processed_chunks < budget.max_active_chunks {
            let Some(coord) = self.queue.pop_front() else {
                break;
            };

            if self.status(coord) != ChunkLifecycle::Active {
                continue;
            }

            let Some(chunk) = chunks.get(&coord).cloned() else {
                report
                    .errors
                    .push(format!("missing active chunk {coord:?}"));
                self.sleep(coord, &mut report);
                continue;
            };

            let before = self.halos.get(&coord).cloned();
            let pass = RulePass::run(&chunk, RuleContext::for_tick(tick));
            let next = pass.apply_to(chunk);
            let after = BorderHalo::from_chunk(&next);
            chunks.insert(coord, next.clone());
            self.halos.insert(coord, after.clone());

            if let Some(before) = before {
                if let Ok(exchange) = HaloExchange::new(before, after) {
                    for direction in exchange.changed_edges() {
                        let neighbor = coord.neighbor(direction);
                        self.wake_chunk(neighbor, ActiveReason::HaloChanged);
                        report.woken_neighbors.push(neighbor);
                    }
                }
            } else if pass.touched_borders.north
                || pass.touched_borders.east
                || pass.touched_borders.south
                || pass.touched_borders.west
            {
                for neighbor in touched_neighbors(coord, &pass) {
                    self.wake_chunk(neighbor, ActiveReason::HaloChanged);
                    report.woken_neighbors.push(neighbor);
                }
            }

            if pass.quiescent {
                self.sleep(coord, &mut report);
            } else {
                let due_tick = next_due_tick(&next, tick);
                self.wait(coord, due_tick, &mut report);
            }

            report.processed_chunks += 1;
        }

        report.deferred_chunks = self
            .queue
            .iter()
            .filter(|coord| self.status(**coord) == ChunkLifecycle::Active)
            .count();
        report
    }

    fn promote_due_chunks(&mut self, tick: u64) {
        let due: Vec<ChunkCoord> = self
            .activity
            .iter()
            .filter_map(|(coord, activity)| match activity.lifecycle {
                ChunkLifecycle::Waiting { due_tick } if due_tick <= tick => Some(*coord),
                _ => None,
            })
            .collect();

        for coord in due {
            self.wake_chunk(coord, ActiveReason::ScheduledTick);
        }
    }

    fn sleep(&mut self, coord: ChunkCoord, report: &mut TickReport) {
        let activity = self.activity.entry(coord).or_default();
        activity.lifecycle = ChunkLifecycle::Sleeping;
        activity.reasons.clear();
        report.sleeping_chunks.push(coord);
    }

    fn wait(&mut self, coord: ChunkCoord, due_tick: u64, report: &mut TickReport) {
        let activity = self.activity.entry(coord).or_default();
        activity.lifecycle = ChunkLifecycle::Waiting { due_tick };
        activity.reasons.insert(ActiveReason::DynamicMaterial);
        report.waiting_chunks.push((coord, due_tick));
    }
}

fn touched_neighbors(coord: ChunkCoord, pass: &RulePass) -> Vec<ChunkCoord> {
    let mut neighbors = Vec::new();
    if pass.touched_borders.north {
        neighbors.push(coord.neighbor(Direction::North));
    }
    if pass.touched_borders.east {
        neighbors.push(coord.neighbor(Direction::East));
    }
    if pass.touched_borders.south {
        neighbors.push(coord.neighbor(Direction::South));
    }
    if pass.touched_borders.west {
        neighbors.push(coord.neighbor(Direction::West));
    }
    neighbors
}

fn next_due_tick(chunk: &Chunk, current_tick: u64) -> u64 {
    if chunk
        .cells()
        .iter()
        .any(|cell| matches!(cell.material, Material::Water | Material::Fire))
    {
        current_tick + 1
    } else {
        current_tick + 4
    }
}
