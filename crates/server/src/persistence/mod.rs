pub mod event_log;
pub mod metadata_store;
pub mod snapshots;

use std::collections::BTreeMap;

use agartha_sim::world::{Chunk, ChunkCoord};

use crate::agents::AgentRecord;
use crate::collaboration::CollaborationState;
use crate::events::{SymbolRecord, WorldEvent, WorldNote};

#[derive(Clone, Debug)]
pub struct PersistedState {
    pub tick: u64,
    pub chunks: BTreeMap<ChunkCoord, Chunk>,
    pub agents: BTreeMap<String, AgentRecord>,
    pub events: Vec<WorldEvent>,
    pub symbols: Vec<SymbolRecord>,
    pub notes: Vec<WorldNote>,
    pub collaboration: CollaborationState,
    pub next_event_number: u64,
    pub next_quote_number: u64,
    pub next_symbol_number: u64,
    pub next_note_number: u64,
}

#[derive(Clone, Debug, Default)]
pub struct LocalPersistence {
    state: Option<PersistedState>,
    fail_next_write: bool,
}

impl LocalPersistence {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn fail_next_write(&mut self) {
        self.fail_next_write = true;
    }

    pub fn write_state(&mut self, state: PersistedState) -> Result<(), PersistenceError> {
        if self.fail_next_write {
            self.fail_next_write = false;
            return Err(PersistenceError::WriteFailed);
        }

        self.state = Some(state);
        Ok(())
    }

    pub fn load_state(&self) -> Option<PersistedState> {
        self.state.clone()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PersistenceError {
    WriteFailed,
}
