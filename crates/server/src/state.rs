use std::collections::BTreeMap;

use agartha_sim::frontier::{ActiveFrontier, ActiveReason};
use agartha_sim::materials::Material;
use agartha_sim::world::{Chunk, ChunkCoord, WorldCoord};

use crate::actions::energy::action_cost;
use crate::actions::perception::{AgentPerception, VisibleCell, WorldEnergyView};
use crate::actions::validation::{primary_target, within_action_range};
use crate::actions::{
    ActionKind, ActionRequest, ActionResult, AuthContext, CostQuote, RejectionReason,
};
use crate::agents::AgentRecord;
use crate::auth::authenticate;
use crate::events::{SymbolRecord, WorldEvent, WorldNote};
use crate::memory::record_outcome;
use crate::persistence::PersistedState;

#[derive(Clone, Debug)]
pub struct ServerState {
    tick: u64,
    chunks: BTreeMap<ChunkCoord, Chunk>,
    agents: BTreeMap<String, AgentRecord>,
    frontier: ActiveFrontier,
    events: Vec<WorldEvent>,
    symbols: Vec<SymbolRecord>,
    notes: Vec<WorldNote>,
    next_event_number: u64,
    next_quote_number: u64,
    next_symbol_number: u64,
    next_note_number: u64,
}

impl ServerState {
    pub fn seeded_origin() -> Self {
        let origin = ChunkCoord::new(0, 0);
        let mut chunks = BTreeMap::new();
        chunks.insert(origin, Chunk::new(origin));

        let mut agents = BTreeMap::new();
        agents.insert(
            "agent-moss-archivist".to_string(),
            AgentRecord::first_demo(
                "agent-moss-archivist",
                "Moss Archivist",
                "token-moss",
                WorldCoord::from_absolute(64, 64),
            ),
        );
        agents.insert(
            "agent-firebreak-builder".to_string(),
            AgentRecord::first_demo(
                "agent-firebreak-builder",
                "Firebreak Builder",
                "token-firebreak",
                WorldCoord::from_absolute(66, 64),
            ),
        );
        agents.insert(
            "agent-stream-gardener".to_string(),
            AgentRecord::first_demo(
                "agent-stream-gardener",
                "Stream Gardener",
                "token-gardener",
                WorldCoord::from_absolute(62, 66),
            ),
        );

        Self {
            tick: 0,
            chunks,
            agents,
            frontier: ActiveFrontier::new(),
            events: Vec::new(),
            symbols: Vec::new(),
            notes: Vec::new(),
            next_event_number: 1,
            next_quote_number: 1,
            next_symbol_number: 1,
            next_note_number: 1,
        }
    }

    pub fn advance_tick(&mut self, tick: u64) {
        self.tick = self.tick.max(tick);
    }

    pub fn chunk(&self, coord: ChunkCoord) -> Option<&Chunk> {
        self.chunks.get(&coord)
    }

    pub fn agent(&self, id: &str) -> Option<&AgentRecord> {
        self.agents.get(id)
    }

    pub fn agent_mut(&mut self, id: &str) -> Option<&mut AgentRecord> {
        self.agents.get_mut(id)
    }

    pub fn events(&self) -> &[WorldEvent] {
        &self.events
    }

    pub fn symbols(&self) -> &[SymbolRecord] {
        &self.symbols
    }

    pub fn notes(&self) -> &[WorldNote] {
        &self.notes
    }

    pub fn to_persisted(&self) -> PersistedState {
        PersistedState {
            tick: self.tick,
            chunks: self.chunks.clone(),
            agents: self.agents.clone(),
            events: self.events.clone(),
            symbols: self.symbols.clone(),
            notes: self.notes.clone(),
            next_event_number: self.next_event_number,
            next_quote_number: self.next_quote_number,
            next_symbol_number: self.next_symbol_number,
            next_note_number: self.next_note_number,
        }
    }

    pub fn from_persisted(persisted: PersistedState) -> Self {
        Self {
            tick: persisted.tick,
            chunks: persisted.chunks,
            agents: persisted.agents,
            frontier: ActiveFrontier::new(),
            events: persisted.events,
            symbols: persisted.symbols,
            notes: persisted.notes,
            next_event_number: persisted.next_event_number,
            next_quote_number: persisted.next_quote_number,
            next_symbol_number: persisted.next_symbol_number,
            next_note_number: persisted.next_note_number,
        }
    }

    pub fn quote_action(
        &mut self,
        auth: &AuthContext,
        action: &ActionKind,
    ) -> Result<CostQuote, RejectionReason> {
        let agent_id = authenticate(&self.agents, auth)?;
        let agent = self
            .agents
            .get(&agent_id)
            .ok_or(RejectionReason::Unauthenticated)?;
        if let Some(target) = primary_target(action) {
            if !within_action_range(agent.position, target, agent.action_range) {
                return Err(RejectionReason::OutOfRange);
            }
        }

        let quote = CostQuote {
            quote_id: format!("quote-{:04}", self.next_quote_number),
            cost: action_cost(action),
            expected_chunk_version: primary_target(action)
                .and_then(|target| self.chunks.get(&target.chunk).map(|chunk| chunk.version)),
        };
        self.next_quote_number += 1;
        Ok(quote)
    }

    pub fn execute_action(&mut self, auth: &AuthContext, request: ActionRequest) -> ActionResult {
        let authenticated_agent_id = match authenticate(&self.agents, auth) {
            Ok(agent_id) => agent_id,
            Err(reason) => return ActionResult::rejected(reason, 0, 0),
        };

        if authenticated_agent_id != request.claimed_agent_id {
            let energy = self
                .agents
                .get(&authenticated_agent_id)
                .map(|agent| agent.energy.current)
                .unwrap_or(0);
            return ActionResult::rejected(RejectionReason::PermissionDenied, 0, energy);
        }

        self.regenerate_agent(&authenticated_agent_id);

        let cost = action_cost(&request.action);
        let agent_snapshot = self.agents.get(&authenticated_agent_id).cloned();
        let Some(agent) = agent_snapshot else {
            return ActionResult::rejected(RejectionReason::Unauthenticated, cost, 0);
        };

        if let Some(target) = primary_target(&request.action) {
            if !within_action_range(agent.position, target, agent.action_range) {
                return ActionResult::rejected(
                    RejectionReason::OutOfRange,
                    cost,
                    agent.energy.current,
                );
            }

            if let Some(expected) = request.expected_chunk_version {
                let actual = self
                    .chunks
                    .get(&target.chunk)
                    .map(|chunk| chunk.version)
                    .unwrap_or(0);
                if expected != actual {
                    return ActionResult::rejected(
                        RejectionReason::StaleChunkVersion,
                        cost,
                        agent.energy.current,
                    );
                }
            }
        }

        if agent.energy.current < cost {
            return ActionResult::rejected(
                RejectionReason::InsufficientEnergy,
                cost,
                agent.energy.current,
            );
        }

        match request.action {
            ActionKind::PlaceMaterial { target, material } => {
                self.place_material(&authenticated_agent_id, target, material, cost)
            }
            ActionKind::PaintCells { cells } => {
                self.paint_cells(&authenticated_agent_id, cells, cost)
            }
            ActionKind::Move { to } => self.move_agent(&authenticated_agent_id, to, cost),
            ActionKind::RegisterSymbol {
                label,
                origin,
                width,
                height,
            } => self.register_symbol(&authenticated_agent_id, label, origin, width, height, cost),
            ActionKind::SubmitNote { target, body } => {
                self.submit_note(&authenticated_agent_id, target, body, cost)
            }
            ActionKind::Observe | ActionKind::Inspect { .. } | ActionKind::History { .. } => {
                ActionResult::rejected(RejectionReason::Malformed, cost, agent.energy.current)
            }
        }
    }

    pub fn observe(&mut self, auth: &AuthContext) -> Result<AgentPerception, RejectionReason> {
        let agent_id = authenticate(&self.agents, auth)?;
        self.regenerate_agent(&agent_id);
        let agent = self
            .agents
            .get(&agent_id)
            .cloned()
            .ok_or(RejectionReason::Unauthenticated)?;
        let (origin_x, origin_y) = agent.position.absolute();
        let mut visible_cells = Vec::new();

        for y in (origin_y - agent.perception_radius)..=(origin_y + agent.perception_radius) {
            for x in (origin_x - agent.perception_radius)..=(origin_x + agent.perception_radius) {
                let coord = WorldCoord::from_absolute(x, y);
                if let Some(chunk) = self.chunks.get(&coord.chunk) {
                    let cell = chunk.cell(coord.cell);
                    if cell.material != Material::Empty {
                        visible_cells.push(VisibleCell {
                            coord,
                            material: cell.material,
                            state: cell.state,
                            variant: cell.variant,
                            flags: cell.flags,
                        });
                    }
                }
            }
        }

        Ok(AgentPerception {
            world_id: "origin".to_string(),
            agent_id: agent.id.clone(),
            position: agent.position,
            memory_summary: agent.memory_summary.clone(),
            visible_cells,
            nearby_symbols: self.symbols.clone(),
            recent_events: self
                .events
                .iter()
                .rev()
                .take(20)
                .map(|event| event.summary.clone())
                .collect(),
            available_actions: vec![
                "observe".to_string(),
                "inspect".to_string(),
                "move".to_string(),
                "place_material".to_string(),
                "paint_cells".to_string(),
                "register_symbol".to_string(),
                "history".to_string(),
                "submit_note".to_string(),
            ],
            world_energy: WorldEnergyView {
                current: agent.energy.current,
                cap: agent.energy.cap,
                regenerates_every_ticks: agent.energy.regenerates_every_ticks,
                next_regeneration_tick: agent.energy.last_regeneration_tick
                    + agent.energy.regenerates_every_ticks,
            },
        })
    }

    pub fn refill_agent_energy(
        &mut self,
        agent_id: &str,
        amount: Option<u32>,
    ) -> Result<WorldEnergyView, RejectionReason> {
        let Some(agent) = self.agents.get_mut(agent_id) else {
            return Err(RejectionReason::InvalidTarget);
        };

        agent.energy.current = match amount {
            Some(amount) => agent
                .energy
                .current
                .saturating_add(amount)
                .min(agent.energy.cap),
            None => agent.energy.cap,
        };

        Ok(WorldEnergyView {
            current: agent.energy.current,
            cap: agent.energy.cap,
            regenerates_every_ticks: agent.energy.regenerates_every_ticks,
            next_regeneration_tick: agent.energy.last_regeneration_tick
                + agent.energy.regenerates_every_ticks,
        })
    }

    fn place_material(
        &mut self,
        agent_id: &str,
        target: WorldCoord,
        material: Material,
        cost: u32,
    ) -> ActionResult {
        let chunk = self
            .chunks
            .entry(target.chunk)
            .or_insert_with(|| Chunk::new(target.chunk));
        let changed = match chunk.place_material(target.cell, material, 0) {
            Ok(changed) => changed,
            Err(_) => {
                let energy = self
                    .agents
                    .get(agent_id)
                    .map(|agent| agent.energy.current)
                    .unwrap_or(0);
                return ActionResult::rejected(
                    RejectionReason::IllegalMaterialOverwrite,
                    cost,
                    energy,
                );
            }
        };
        self.frontier
            .wake_chunk(target.chunk, ActiveReason::AgentEdit);
        let affected_cells: Vec<WorldCoord> = changed
            .into_iter()
            .map(|cell| WorldCoord::new(target.chunk, cell))
            .collect();
        let summary = format!(
            "{} placed {} at ({}, {})",
            agent_id,
            material_label(material),
            target.absolute().0,
            target.absolute().1
        );
        self.accept(
            agent_id,
            cost,
            affected_cells,
            vec![chunk_key(target.chunk)],
            summary,
        )
    }

    fn paint_cells(&mut self, agent_id: &str, cells: Vec<WorldCoord>, cost: u32) -> ActionResult {
        let mut staged_chunks = self.chunks.clone();
        let mut affected = Vec::new();
        let mut chunks = Vec::new();
        for coord in &cells {
            let chunk = staged_chunks
                .entry(coord.chunk)
                .or_insert_with(|| Chunk::new(coord.chunk));
            if chunk
                .place_material(coord.cell, Material::Paint, 0)
                .is_err()
            {
                let energy = self
                    .agents
                    .get(agent_id)
                    .map(|agent| agent.energy.current)
                    .unwrap_or(0);
                return ActionResult::rejected(
                    RejectionReason::IllegalMaterialOverwrite,
                    cost,
                    energy,
                );
            }
            affected.push(*coord);
            chunks.push(chunk_key(coord.chunk));
        }

        self.chunks = staged_chunks;
        for coord in &affected {
            self.frontier
                .wake_chunk(coord.chunk, ActiveReason::AgentEdit);
        }

        let summary = format!("{} painted {} cells", agent_id, affected.len());
        self.accept(agent_id, cost, affected, chunks, summary)
    }

    fn move_agent(&mut self, agent_id: &str, to: WorldCoord, cost: u32) -> ActionResult {
        if let Some(agent) = self.agents.get_mut(agent_id) {
            agent.position = to;
        }
        let summary = format!(
            "{} moved to ({}, {})",
            agent_id,
            to.absolute().0,
            to.absolute().1
        );
        self.accept(
            agent_id,
            cost,
            Vec::new(),
            vec![chunk_key(to.chunk)],
            summary,
        )
    }

    fn register_symbol(
        &mut self,
        agent_id: &str,
        label: String,
        origin: WorldCoord,
        width: u32,
        height: u32,
        cost: u32,
    ) -> ActionResult {
        let event_id = self.peek_event_id();
        let symbol = SymbolRecord {
            id: format!("symbol-{:04}", self.next_symbol_number),
            label: label.clone(),
            author_agent_id: agent_id.to_string(),
            origin,
            width,
            height,
            created_event_id: event_id.clone(),
            note: None,
        };
        self.next_symbol_number += 1;
        self.symbols.push(symbol);
        let summary = format!("{} registered symbol {}", agent_id, label);
        self.accept(
            agent_id,
            cost,
            Vec::new(),
            vec![chunk_key(origin.chunk)],
            summary,
        )
    }

    fn submit_note(
        &mut self,
        agent_id: &str,
        target: Option<WorldCoord>,
        body: String,
        cost: u32,
    ) -> ActionResult {
        let event_id = self.peek_event_id();
        let note = WorldNote {
            id: format!("note-{:04}", self.next_note_number),
            event_id,
            agent_id: agent_id.to_string(),
            target,
            body: body.clone(),
        };
        self.next_note_number += 1;
        self.notes.push(note);
        let chunks = target
            .map(|target| vec![chunk_key(target.chunk)])
            .unwrap_or_default();
        let summary = format!("{} noted: {}", agent_id, body);
        self.accept(agent_id, cost, Vec::new(), chunks, summary)
    }

    fn accept(
        &mut self,
        agent_id: &str,
        cost: u32,
        affected_cells: Vec<WorldCoord>,
        affected_chunks: Vec<String>,
        summary: String,
    ) -> ActionResult {
        let Some(agent) = self.agents.get_mut(agent_id) else {
            return ActionResult::rejected(RejectionReason::Unauthenticated, cost, 0);
        };
        if !agent.energy.spend(cost) {
            return ActionResult::rejected(
                RejectionReason::InsufficientEnergy,
                cost,
                agent.energy.current,
            );
        }
        record_outcome(agent, &summary);
        let energy_remaining = agent.energy.current;
        let event_id = self.next_event_id();
        let event = WorldEvent {
            id: event_id.clone(),
            tick: self.tick,
            agent_id: agent_id.to_string(),
            cost,
            affected_cells: affected_cells.clone(),
            affected_chunks: affected_chunks.clone(),
            summary: summary.clone(),
        };
        self.events.push(event);

        ActionResult {
            accepted: true,
            event_id: Some(event_id),
            reason: None,
            cost,
            energy_remaining,
            affected_cells,
            affected_chunks,
            summary,
        }
    }

    fn regenerate_agent(&mut self, agent_id: &str) {
        if let Some(agent) = self.agents.get_mut(agent_id) {
            agent.energy.regenerate_to_tick(self.tick);
        }
    }

    fn next_event_id(&mut self) -> String {
        let id = self.peek_event_id();
        self.next_event_number += 1;
        id
    }

    fn peek_event_id(&self) -> String {
        format!("event-{:04}", self.next_event_number)
    }
}

fn chunk_key(coord: ChunkCoord) -> String {
    format!("{}:{}", coord.x, coord.y)
}

fn material_label(material: Material) -> &'static str {
    match material {
        Material::Empty => "empty",
        Material::Paint => "paint",
        Material::Stone => "stone",
        Material::Water => "water",
        Material::Fire => "fire",
        Material::Plant => "plant",
    }
}
