use agartha_server::actions::{ActionKind, ActionRequest, AuthContext};
use agartha_server::patches::{
    ChunkSnapshot, PatchBody, PatchEnvelope, FULL_SNAPSHOT_CELL_THRESHOLD,
};
use agartha_server::state::ServerState;
use agartha_server::ws::{PatchStreamHub, SubscriptionError, SubscriptionRequest};
use agartha_sim::materials::Material;
use agartha_sim::world::{ChunkCoord, WorldCoord};

#[test]
fn subscribed_client_receives_initial_snapshot_and_ordered_patch() {
    let mut state = ServerState::seeded_origin();
    let origin = ChunkCoord::new(0, 0);
    let snapshots = vec![ChunkSnapshot::from_chunk(
        "origin",
        state.chunk(origin).unwrap(),
    )];
    let mut hub = PatchStreamHub::new();

    let initial = hub
        .subscribe(
            "viewer",
            SubscriptionRequest::visible(origin, 0),
            &snapshots,
        )
        .unwrap();

    assert_eq!(initial.len(), 1);

    let target = WorldCoord::from_absolute(65, 65);
    let result = state.execute_action(
        &AuthContext::bearer("token-moss"),
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: Some(0),
            quote_id: None,
            action: ActionKind::PlaceMaterial {
                target,
                material: Material::Paint,
            },
        },
    );
    let patch = PatchEnvelope::from_changed_cells(
        "origin",
        result.event_id.unwrap(),
        state.chunk(origin).unwrap(),
        0,
        &result.affected_cells,
    );

    let delivered = hub.publish_for_client("viewer", &patch).unwrap();

    assert_eq!(delivered.base_version, 0);
    assert_eq!(delivered.next_version, 1);
    assert!(matches!(delivered.body, PatchBody::ChangedCells(_)));
}

#[test]
fn unsubscribed_chunks_do_not_stream_to_client() {
    let origin = ChunkCoord::new(0, 0);
    let other = ChunkCoord::new(2, 0);
    let state = ServerState::seeded_origin();
    let mut hub = PatchStreamHub::new();
    hub.subscribe("viewer", SubscriptionRequest::visible(origin, 0), &[])
        .unwrap();

    let patch = PatchEnvelope::from_changed_cells(
        "origin",
        "event-0001",
        state.chunk(origin).unwrap(),
        0,
        &[WorldCoord::new(
            other,
            agartha_sim::world::CellCoord::new(0, 0).unwrap(),
        )],
    );

    let patch = PatchEnvelope {
        chunk: other,
        ..patch
    };

    assert!(hub.publish_for_client("viewer", &patch).is_none());
}

#[test]
fn version_mismatch_requires_snapshot_recovery() {
    let state = ServerState::seeded_origin();
    let origin = ChunkCoord::new(0, 0);
    let patch = PatchEnvelope::from_changed_cells(
        "origin",
        "event-0001",
        state.chunk(origin).unwrap(),
        2,
        &[],
    );

    assert!(patch.requires_snapshot_recovery(Some(1)));
    assert!(!patch.requires_snapshot_recovery(Some(2)));
}

#[test]
fn dense_changes_use_full_chunk_snapshot_fallback() {
    let state = ServerState::seeded_origin();
    let origin = ChunkCoord::new(0, 0);
    let changed: Vec<WorldCoord> = (0..=FULL_SNAPSHOT_CELL_THRESHOLD)
        .map(|x| WorldCoord::from_absolute(x as i32, 0))
        .collect();

    let patch = PatchEnvelope::from_changed_cells(
        "origin",
        "event-0001",
        state.chunk(origin).unwrap(),
        0,
        &changed,
    );

    assert!(matches!(patch.body, PatchBody::FullChunk(_)));
}

#[test]
fn malformed_subscription_request_is_rejected() {
    let mut hub = PatchStreamHub::new();
    let error = hub
        .subscribe(
            "viewer",
            SubscriptionRequest::visible(ChunkCoord::new(0, 0), -1),
            &[],
        )
        .unwrap_err();

    assert_eq!(error, SubscriptionError::InvalidRadius(-1));
}
