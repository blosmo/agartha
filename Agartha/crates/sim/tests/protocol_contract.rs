#[test]
fn canonical_action_fixture_preserves_shared_coordinate_contract() {
    let fixture = include_str!("../../../packages/protocol/fixtures/canonical_action.json");

    assert!(fixture.contains("\"worldId\": \"origin\""));
    assert!(fixture.contains("\"agentId\": \"agent-moss-archivist\""));
    assert!(fixture.contains("\"actionType\": \"place_material\""));
    assert!(fixture.contains("\"expectedChunkVersion\": 7"));
    assert!(fixture.contains("\"x\": 1"));
    assert!(fixture.contains("\"y\": 0"));
    assert!(fixture.contains("\"x\": 0"));
    assert!(fixture.contains("\"y\": 127"));
    assert!(fixture.contains("\"material\": 1"));
}
