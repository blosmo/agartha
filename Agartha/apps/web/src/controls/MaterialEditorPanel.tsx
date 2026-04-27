import { MATERIAL, MATERIAL_NAME, type MaterialId } from "@agartha/protocol/world";

const EDITABLE_MATERIALS: MaterialId[] = [
  MATERIAL.Empty,
  MATERIAL.Paint,
  MATERIAL.Stone,
  MATERIAL.Water,
  MATERIAL.Fire,
  MATERIAL.Plant,
];

export interface MaterialEditorPanelProps {
  readonly selectedMaterial: MaterialId;
  readonly onSelectMaterial: (material: MaterialId) => void;
  readonly onClear: () => void;
}

export function MaterialEditorPanel({
  selectedMaterial,
  onSelectMaterial,
  onClear,
}: MaterialEditorPanelProps) {
  return (
    <section className="inspector-panel material-editor" aria-label="Material editor">
      <h2>Material Editor</h2>
      <div className="material-editor__palette" role="radiogroup" aria-label="Material">
        {EDITABLE_MATERIALS.map((material) => (
          <button
            aria-checked={material === selectedMaterial}
            className="material-editor__swatch"
            data-material={MATERIAL_NAME[material]}
            key={material}
            onClick={() => onSelectMaterial(material)}
            role="radio"
            type="button"
          >
            <span aria-hidden="true" />
            {MATERIAL_NAME[material]}
          </button>
        ))}
      </div>
      <button className="material-editor__clear" onClick={onClear} type="button">
        Reset demo cells
      </button>
    </section>
  );
}
