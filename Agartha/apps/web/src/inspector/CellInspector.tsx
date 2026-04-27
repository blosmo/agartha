import { MATERIAL, MATERIAL_NAME, toWorldCoord, type MaterialId } from "@agartha/protocol/world";

export interface CellInspectorProps {
  readonly material?: MaterialId;
  readonly state?: number;
}

export function CellInspector({ material = MATERIAL.Paint, state = 0 }: CellInspectorProps) {
  const coord = toWorldCoord(65, 65);

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
