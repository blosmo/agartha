import type { TerrainSeed } from "../app/demoWorld";

export interface TerrainSeedPanelProps {
  readonly seeds: readonly TerrainSeed[];
  readonly selectedSeedId: string;
  readonly onSelectSeed: (seedId: string) => void;
}

export function TerrainSeedPanel({ seeds, selectedSeedId, onSelectSeed }: TerrainSeedPanelProps) {
  const selectedSeed = seeds.find((seed) => seed.id === selectedSeedId) ?? seeds[0];

  return (
    <section className="inspector-panel terrain-seed-panel" aria-label="Terrain preset">
      <h2>Terrain</h2>
      <div className="terrain-seed-panel__options" role="radiogroup" aria-label="Terrain seed">
        {seeds.map((seed) => (
          <button
            aria-checked={seed.id === selectedSeedId}
            key={seed.id}
            onClick={() => onSelectSeed(seed.id)}
            role="radio"
            type="button"
          >
            {seed.label}
          </button>
        ))}
      </div>
      <p>{selectedSeed.description}</p>
    </section>
  );
}
