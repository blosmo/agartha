import { MATERIAL, MATERIAL_NAME, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

export interface CellInspectorProps {
  readonly coord: WorldCoord;
  readonly material?: MaterialId;
  readonly state?: number;
}

export function CellInspector({ coord, material = MATERIAL.Paint, state = 0 }: CellInspectorProps) {
  return (
    <section className="inspector-panel" aria-label="Cell inspector">
      <h2>Cell Inspector</h2>
      <dl>
        <div>
          <dt>Material</dt>
          <dd>{MATERIAL_NAME[material]}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{state}</dd>
        </div>
        <div>
          <dt>Chunk</dt>
          <dd>
            {coord.chunk.x}:{coord.chunk.y}
          </dd>
        </div>
        <div>
          <dt>Cell</dt>
          <dd>
            {coord.cell.x}:{coord.cell.y}
          </dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>1</dd>
        </div>
      </dl>
    </section>
  );
}
