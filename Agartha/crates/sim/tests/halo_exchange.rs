use agartha_sim::frontier::{BorderHalo, HaloError, HaloExchange};
use agartha_sim::materials::Material;
use agartha_sim::world::{Cell, Direction, CHUNK_SIZE};

#[test]
fn changed_edges_are_detected_from_border_halos() {
    let empty = Cell::empty();
    let mut changed = vec![empty; CHUNK_SIZE];
    changed[0] = Cell::with_material(Material::Water, 0);

    let before = BorderHalo::from_edges(
        vec![empty; CHUNK_SIZE],
        vec![empty; CHUNK_SIZE],
        vec![empty; CHUNK_SIZE],
        vec![empty; CHUNK_SIZE],
    )
    .unwrap();
    let after = BorderHalo::from_edges(
        vec![empty; CHUNK_SIZE],
        vec![empty; CHUNK_SIZE],
        changed,
        vec![empty; CHUNK_SIZE],
    )
    .unwrap();

    let exchange = HaloExchange::new(before, after).unwrap();

    assert_eq!(exchange.changed_edges(), vec![Direction::South]);
}

#[test]
fn corrupted_halo_data_is_rejected() {
    let error = BorderHalo::from_edges(vec![], vec![], vec![], vec![]).unwrap_err();

    assert_eq!(
        error,
        HaloError::InvalidEdgeLength {
            direction: Direction::North,
            actual: 0
        }
    );
}
