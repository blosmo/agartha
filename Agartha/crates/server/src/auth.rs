use std::collections::BTreeMap;

use crate::actions::{AuthContext, RejectionReason};
use crate::agents::AgentRecord;

pub fn authenticate(
    agents: &BTreeMap<String, AgentRecord>,
    auth: &AuthContext,
) -> Result<String, RejectionReason> {
    agents
        .values()
        .find(|agent| agent.bearer_token == auth.bearer_token)
        .map(|agent| agent.id.clone())
        .ok_or(RejectionReason::Unauthenticated)
}
