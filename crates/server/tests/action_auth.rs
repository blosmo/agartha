use agartha_server::actions::{ActionKind, ActionRequest, AuthContext, RejectionReason};
use agartha_server::state::ServerState;
use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[test]
fn unauthenticated_action_rejects_before_quote_or_mutation() {
    let mut state = ServerState::seeded_origin();
    let target = WorldCoord::from_absolute(65, 65);
    let request = ActionRequest {
        claimed_agent_id: "agent-moss-archivist".to_string(),
        expected_chunk_version: None,
        quote_id: None,
        action: ActionKind::PlaceMaterial {
            target,
            material: Material::Paint,
        },
    };

    let result = state.execute_action(&AuthContext::bearer("wrong-token"), request);

    assert!(!result.accepted);
    assert_eq!(result.reason, Some(RejectionReason::Unauthenticated));
    assert_eq!(
        state
            .chunk(target.chunk)
            .unwrap()
            .cell(target.cell)
            .material,
        Material::Empty
    );
}

#[test]
fn mismatched_claimed_agent_cannot_spend_another_agent_energy() {
    let mut state = ServerState::seeded_origin();
    let target = WorldCoord::from_absolute(65, 65);
    let request = ActionRequest {
        claimed_agent_id: "agent-firebreak-builder".to_string(),
        expected_chunk_version: None,
        quote_id: None,
        action: ActionKind::PlaceMaterial {
            target,
            material: Material::Paint,
        },
    };

    let result = state.execute_action(&AuthContext::bearer("token-moss"), request);

    assert!(!result.accepted);
    assert_eq!(result.reason, Some(RejectionReason::PermissionDenied));
    assert_eq!(
        state.agent("agent-moss-archivist").unwrap().energy.current,
        40
    );
    assert_eq!(
        state
            .agent("agent-firebreak-builder")
            .unwrap()
            .energy
            .current,
        40
    );
}
