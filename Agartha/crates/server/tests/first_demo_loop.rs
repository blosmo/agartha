use std::collections::BTreeMap;

use agartha_server::actions::{ActionKind, ActionRequest, AuthContext, RejectionReason};
use agartha_server::patches::{PatchBody, PatchEnvelope};
use agartha_server::persistence::event_log::{EventLog, ReplaySelection};
use agartha_server::persistence::LocalPersistence;
use agartha_server::state::ServerState;
use agartha_sim::frontier::{ActiveFrontier, ActiveReason, ChunkLifecycle, TickBudget};
use agartha_sim::materials::Material;
use agartha_sim::world::{CellCoord, Chunk, ChunkCoord, WorldCoord};

#[test]
fn first_demo_loop_accepts_actions_streams_persists_replays_and_rejects_invalid_work() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let target = WorldCoord::from_absolute(65, 65);

    let place = state.execute_action(
        &auth,
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
    assert!(place.accepted);

    let patch = PatchEnvelope::from_changed_cells(
        "origin",
        place.event_id.clone().unwrap(),
        state.chunk(target.chunk).unwrap(),
        0,
        &place.affected_cells,
    );
    assert!(matches!(patch.body, PatchBody::ChangedCells(_)));
    assert_eq!(patch.next_version, 1);

    let symbol = state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: None,
            quote_id: None,
            action: ActionKind::RegisterSymbol {
                label: "moss gate".to_string(),
                origin: target,
                width: 2,
                height: 2,
            },
        },
    );
    assert!(symbol.accepted);

    let note = state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: None,
            quote_id: None,
            action: ActionKind::SubmitNote {
                target: Some(target),
                body: "marker ready for future agents".to_string(),
            },
        },
    );
    assert!(note.accepted);

    let rejected = state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: Some(99),
            quote_id: None,
            action: ActionKind::PlaceMaterial {
                target,
                material: Material::Fire,
            },
        },
    );
    assert!(!rejected.accepted);
    assert_eq!(rejected.reason, Some(RejectionReason::StaleChunkVersion));
    assert_eq!(state.events().len(), 3);

    let mut persistence = LocalPersistence::new();
    persistence.write_state(state.to_persisted()).unwrap();
    let restored = ServerState::from_persisted(persistence.load_state().unwrap());

    assert_eq!(restored.events().len(), 3);
    assert_eq!(restored.symbols().len(), 1);
    assert_eq!(restored.notes().len(), 1);
    assert_eq!(
        restored
            .chunk(target.chunk)
            .unwrap()
            .cell(target.cell)
            .material,
        Material::Paint
    );

    let mut log = EventLog::default();
    for event in restored.events() {
        log.append(event.clone());
    }
    let replay = log.events_for_selection(ReplaySelection {
        origin: WorldCoord::from_absolute(64, 64),
        width: 4,
        height: 4,
    });
    assert_eq!(replay[0].id, "event-0001");
}

#[test]
fn first_demo_acceptance_includes_quiescent_sleep_after_static_edit() {
    let coord = ChunkCoord::new(0, 0);
    let mut chunks = BTreeMap::new();
    let mut chunk = Chunk::new(coord);
    chunk
        .place_material(CellCoord::new(32, 32).unwrap(), Material::Paint, 0)
        .unwrap();
    chunks.insert(coord, chunk);

    let mut frontier = ActiveFrontier::new();
    frontier.wake_chunk(coord, ActiveReason::AgentEdit);
    let report = frontier.tick(&mut chunks, 1, TickBudget::new(4));

    assert_eq!(report.processed_chunks, 1);
    assert_eq!(frontier.status(coord), ChunkLifecycle::Sleeping);
}
