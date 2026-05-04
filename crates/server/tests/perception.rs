use agartha_server::actions::{ActionKind, ActionRequest, AuthContext};
use agartha_server::state::ServerState;
use agartha_sim::materials::Material;
use agartha_sim::world::WorldCoord;

#[test]
fn local_perception_includes_agent_state_cells_events_symbols_and_actions() {
    let mut state = ServerState::seeded_origin();
    let auth = AuthContext::bearer("token-moss");
    let target = WorldCoord::from_absolute(65, 65);

    let result = state.execute_action(
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
    assert!(result.accepted);

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

    let perception = state.observe(&auth).unwrap();

    assert_eq!(perception.agent_id, "agent-moss-archivist");
    assert!(perception
        .visible_cells
        .iter()
        .any(|cell| cell.material == Material::Paint));
    assert!(perception
        .nearby_symbols
        .iter()
        .any(|symbol| symbol.label == "moss gate"));
    assert!(perception
        .recent_events
        .iter()
        .any(|event| event.contains("placed paint")));
    assert!(perception
        .available_actions
        .contains(&"place_material".to_string()));
    assert!(perception
        .available_tools
        .iter()
        .any(|tool| tool.id == "canvas_screenshot" && tool.kind == "vision"));
}
