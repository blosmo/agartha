import { Archive, FrameCorners } from "@phosphor-icons/react";
import { useState } from "react";

import type { CellObjectTemplate } from "../app/demoWorld";
import type { CellSelection } from "../board/BoardCanvas";

export interface ObjectLibraryPanelProps {
  readonly selectedId?: string;
  readonly selection?: CellSelection;
  readonly stampRepeat: number;
  readonly stampStepX: number;
  readonly stampStepY: number;
  readonly templates: readonly CellObjectTemplate[];
  readonly onCapture: (label: string) => string;
  readonly onSelectTemplate: (id: string) => void;
  readonly onUpdateStampPattern: (repeat: number, stepX: number, stepY: number) => void;
}

export function ObjectLibraryPanel({
  selectedId,
  selection,
  stampRepeat,
  stampStepX,
  stampStepY,
  templates,
  onCapture,
  onSelectTemplate,
  onUpdateStampPattern,
}: ObjectLibraryPanelProps) {
  const [label, setLabel] = useState("house");
  const [lastCaptureMessage, setLastCaptureMessage] = useState<string | null>(null);

  const activeId = selectedId ?? templates[0]?.id;

  function capture() {
    const message = onCapture(label);
    setLastCaptureMessage(message);
  }

  return (
    <section className="inspector-panel object-library-panel" aria-label="Stamp library">
      <h2>Stamps</h2>
      <div className="object-library-panel__capture">
        <input
          aria-label="Object name"
          onChange={(event) => setLabel(event.currentTarget.value)}
          spellCheck="false"
          value={label}
        />
        <div className="object-library-panel__selection-readout" aria-label="Selection size">
          <FrameCorners aria-hidden="true" size={14} />
          {selection ? `${selection.width}x${selection.height}` : "No selection"}
        </div>
        <button aria-label="Capture object" onClick={capture} type="button">
          <Archive aria-hidden="true" size={15} />
        </button>
      </div>
      <div className="object-library-panel__templates" role="radiogroup" aria-label="Saved object">
        {templates.length === 0 ? (
          <p>Use Marquee, select cells, then capture.</p>
        ) : (
          templates.map((template) => (
            <button
              aria-checked={template.id === activeId}
              aria-label={template.label}
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              role="radio"
              type="button"
            >
              {template.label}
              <span aria-hidden="true">{template.samples.length}</span>
            </button>
          ))
        )}
      </div>
      <div className="object-library-panel__stamp-pattern" aria-label="Stamp pattern">
        <label>
          <span>Repeat</span>
          <input
            aria-label="Stamp repeat"
            max="24"
            min="1"
            onChange={(event) => onUpdateStampPattern(Number(event.currentTarget.value), stampStepX, stampStepY)}
            type="number"
            value={stampRepeat}
          />
        </label>
        <label>
          <span>Step X</span>
          <input
            aria-label="Stamp step X"
            max="96"
            min="-96"
            onChange={(event) => onUpdateStampPattern(stampRepeat, Number(event.currentTarget.value), stampStepY)}
            type="number"
            value={stampStepX}
          />
        </label>
        <label>
          <span>Step Y</span>
          <input
            aria-label="Stamp step Y"
            max="96"
            min="-96"
            onChange={(event) => onUpdateStampPattern(stampRepeat, stampStepX, Number(event.currentTarget.value))}
            type="number"
            value={stampStepY}
          />
        </label>
      </div>
      {lastCaptureMessage ? (
        <output aria-label="Last capture result" className="object-library-panel__feedback">
          {lastCaptureMessage}
        </output>
      ) : null}
    </section>
  );
}
