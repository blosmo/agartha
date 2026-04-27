use crate::agents::AgentRecord;

pub fn record_outcome(agent: &mut AgentRecord, summary: &str) {
    agent.memory_summary = format!("{} Last outcome: {summary}", agent.memory_summary);
}
