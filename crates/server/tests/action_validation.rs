use agartha_server::actions::{ActionKind, ActionRequest, AuthContext, RejectionReason};
use agartha_server::state::ServerState;
use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[test]
fn accepted_place_material_spends_energy_mutates_cells_and_records_event() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let target = WorldCoord::from_absolute(65, 65);
    let quote = state
        .quote_action(
            &auth,
            &ActionKind::PlaceMaterial {
                target,
                material: Material::Paint,
            },
        )
        .unwrap();
    let request = ActionRequest {
        claimed_agent_id: "agent-moss-archivist".to_string(),
        expected_chunk_version: Some(0),
        quote_id: Some(quote.quote_id),
        action: ActionKind::PlaceMaterial {
            target,
            material: Material::Paint,
        },
    };

    let result = state.execute_action(&auth, request);

    assert!(result.accepted);
    assert_eq!(result.cost, 2);
    assert_eq!(result.event_id.as_deref(), Some("event-0001"));
    assert_eq!(
        state
            .chunk(target.chunk)
            .unwrap()
            .cell(target.cell)
            .material,
        Material::Paint
    );
    assert_eq!(
        state.agent("agent-moss-archivist").unwrap().energy.current,
        4_998
    );
}

#[test]
fn stale_expected_chunk_version_rejects_without_spending_or_mutating() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let target = WorldCoord::from_absolute(65, 65);
    let request = ActionRequest {
        claimed_agent_id: "agent-moss-archivist".to_string(),
        expected_chunk_version: Some(99),
        quote_id: None,
        action: ActionKind::PlaceMaterial {
            target,
            material: Material::Paint,
        },
    };

    let result = state.execute_action(&auth, request);

    assert!(!result.accepted);
    assert_eq!(result.reason, Some(RejectionReason::StaleChunkVersion));
    assert_eq!(
        state.agent("agent-moss-archivist").unwrap().energy.current,
        5_000
    );
    assert_eq!(
        state
            .chunk(target.chunk)
            .unwrap()
            .cell(target.cell)
            .material,
        Material::Empty
    );
    assert!(state.events().is_empty());
}

#[test]
fn out_of_range_action_rejects_even_with_enough_energy() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let far_target = WorldCoord::from_absolute(200, 200);
    let request = ActionRequest {
        claimed_agent_id: "agent-moss-archivist".to_string(),
        expected_chunk_version: None,
        quote_id: None,
        action: ActionKind::PlaceMaterial {
            target: far_target,
            material: Material::Stone,
        },
    };

    let result = state.execute_action(&auth, request);

    assert!(!result.accepted);
    assert_eq!(result.reason, Some(RejectionReason::OutOfRange));
    assert_eq!(state.events().len(), 0);
}
