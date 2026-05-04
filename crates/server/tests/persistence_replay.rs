use agartha_server::actions::{ActionKind, ActionRequest, AuthContext};
use agartha_server::persistence::event_log::{EventLog, ReplaySelection};
use agartha_server::persistence::LocalPersistence;
use agartha_server::state::ServerState;
use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[test]
fn local_persistence_restores_chunks_agents_metadata_notes_and_events() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let target = WorldCoord::from_absolute(65, 65);
    state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: None,
            quote_id: None,
            action: ActionKind::PlaceMaterial {
                target,
                material: Material::Paint,
            },
        },
    );
    state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: None,
            quote_id: None,
            action: ActionKind::SubmitNote {
                target: Some(target),
                body: "painted a marker".to_string(),
            },
        },
    );

    let mut persistence = LocalPersistence::new();
    persistence.write_state(state.to_persisted()).unwrap();
    let restored = ServerState::from_persisted(persistence.load_state().unwrap());

    assert_eq!(restored.events().len(), 2);
    assert_eq!(restored.notes().len(), 1);
    assert_eq!(
        restored
            .agent("agent-moss-archivist")
            .unwrap()
            .energy
            .current,
        4_997
    );
    assert_eq!(
        restored
            .chunk(target.chunk)
            .unwrap()
            .cell(target.cell)
            .material,
        Material::Paint
    );
}

#[test]
fn selected_area_replay_filters_events_by_affected_cells() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let target = WorldCoord::from_absolute(65, 65);
    let outside = WorldCoord::from_absolute(90, 90);
    state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: None,
            quote_id: None,
            action: ActionKind::PlaceMaterial {
                target,
                material: Material::Paint,
            },
        },
    );
    state.execute_action(
        &auth,
        ActionRequest {
            claimed_agent_id: "agent-moss-archivist".to_string(),
            expected_chunk_version: None,
            quote_id: None,
            action: ActionKind::PlaceMaterial {
                target: outside,
                material: Material::Paint,
            },
        },
    );

    let mut log = EventLog::default();
    for event in state.events() {
        log.append(event.clone());
    }
    let replay = log.events_for_selection(ReplaySelection {
        origin: WorldCoord::from_absolute(60, 60),
        width: 10,
        height: 10,
    });

    assert_eq!(replay.len(), 1);
    assert_eq!(replay[0].id, "event-0001");
}

#[test]
fn persistence_failure_can_prevent_durable_acknowledgement() {
    let state = ServerState::seeded_origin();
    let mut persistence = LocalPersistence::new();
    persistence.fail_next_write();

    assert!(persistence.write_state(state.to_persisted()).is_err());
    assert!(persistence.load_state().is_none());
}
