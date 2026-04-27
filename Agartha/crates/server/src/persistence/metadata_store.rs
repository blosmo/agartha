use std::collections::BTreeMap;

use crate::agents::AgentRecord;
use crate::events::{SymbolRecord, WorldNote};

#[derive(Clone, Debug, Default)]
pub struct MetadataStore {
    pub agents: BTreeMap<String, AgentRecord>,
    pub symbols: Vec<SymbolRecord>,
    pub notes: Vec<WorldNote>,
}
