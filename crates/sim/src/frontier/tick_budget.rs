#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TickBudget {
    pub max_active_chunks: usize,
}

impl TickBudget {
    pub const fn new(max_active_chunks: usize) -> Self {
        Self { max_active_chunks }
    }
}
