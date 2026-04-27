pub mod subscriptions;

use std::collections::BTreeMap;

use crate::patches::{ChunkSnapshot, PatchEnvelope};

pub use subscriptions::{SubscriptionError, SubscriptionRequest, SubscriptionSet};

#[derive(Clone, Debug, Default)]
pub struct PatchStreamHub {
    subscriptions: BTreeMap<String, SubscriptionSet>,
}

impl PatchStreamHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(
        &mut self,
        client_id: impl Into<String>,
        request: SubscriptionRequest,
        snapshots: &[ChunkSnapshot],
    ) -> Result<Vec<ChunkSnapshot>, SubscriptionError> {
        let subscription = request.into_subscription()?;
        let initial_snapshots = snapshots
            .iter()
            .filter(|snapshot| subscription.contains(snapshot.chunk))
            .cloned()
            .collect();
        self.subscriptions.insert(client_id.into(), subscription);
        Ok(initial_snapshots)
    }

    pub fn publish_for_client(
        &self,
        client_id: &str,
        patch: &PatchEnvelope,
    ) -> Option<PatchEnvelope> {
        self.subscriptions
            .get(client_id)
            .filter(|subscription| subscription.contains(patch.chunk))
            .map(|_| patch.clone())
    }
}
