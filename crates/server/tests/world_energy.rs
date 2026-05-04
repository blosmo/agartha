use agartha_server::actions::{ActionKind, ActionRequest, AuthContext, RejectionReason};
use agartha_server::state::ServerState;
use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[test]
fn energy_regenerates_on_fixed_cadence_up_to_cap() {
    let mut state = ServerState::seeded_origin();
    state
        .agent_mut("agent-moss-archivist")
        .unwrap()
        .energy
        .current = 35;

    state.advance_tick(4);
    let perception = state.observe(&AuthContext::bearer("token-moss")).unwrap();

    assert_eq!(perception.world_energy.current, 2_035);

    state.advance_tick(100);
    let perception = state.observe(&AuthContext::bearer("token-moss")).unwrap();

    assert_eq!(perception.world_energy.current, 10_000);
}

#[test]
fn insufficient_energy_dynamic_material_rejects_with_required_cost() {
    let mut state = ServerState::seeded_origin();
    state
        .agent_mut("agent-moss-archivist")
        .unwrap()
        .energy
        .current = 3;
    let target = WorldCoord::from_absolute(65, 65);
    let request = ActionRequest {
        claimed_agent_id: "agent-moss-archivist".to_string(),
        expected_chunk_version: None,
        quote_id: None,
        action: ActionKind::PlaceMaterial {
            target,
            material: Material::Fire,
        },
    };

    let result = state.execute_action(&AuthContext::bearer("token-moss"), request);

    assert!(!result.accepted);
    assert_eq!(result.reason, Some(RejectionReason::InsufficientEnergy));
    assert_eq!(result.cost, 12);
    assert_eq!(
        state.agent("agent-moss-archivist").unwrap().energy.current,
        3
    );
}
