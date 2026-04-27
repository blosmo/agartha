use std::collections::BTreeSet;
use std::fmt;

use agartha_sim::world::ChunkCoord;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SubscriptionRequest {
    pub center: ChunkCoord,
    pub radius_chunks: i32,
}

impl SubscriptionRequest {
    pub const fn visible(center: ChunkCoord, radius_chunks: i32) -> Self {
        Self {
            center,
            radius_chunks,
        }
    }

    pub fn into_subscription(self) -> Result<SubscriptionSet, SubscriptionError> {
        if self.radius_chunks < 0 || self.radius_chunks > 8 {
            return Err(SubscriptionError::InvalidRadius(self.radius_chunks));
        }

        let mut chunks = BTreeSet::new();
        for y in (self.center.y - self.radius_chunks)..=(self.center.y + self.radius_chunks) {
            for x in (self.center.x - self.radius_chunks)..=(self.center.x + self.radius_chunks) {
                chunks.insert(ChunkCoord::new(x, y));
            }
        }

        Ok(SubscriptionSet { chunks })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionSet {
    chunks: BTreeSet<ChunkCoord>,
}

impl SubscriptionSet {
    pub fn contains(&self, chunk: ChunkCoord) -> bool {
        self.chunks.contains(&chunk)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionError {
    InvalidRadius(i32),
}

impl fmt::Display for SubscriptionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SubscriptionError::InvalidRadius(radius) => {
                write!(formatter, "invalid subscription radius {radius}")
            }
        }
    }
}

impl std::error::Error for SubscriptionError {}
