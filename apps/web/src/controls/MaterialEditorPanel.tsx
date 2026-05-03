import {
  ArrowCounterClockwise,
  ArrowClockwise,
  Circle,
  Cursor,
  Plus,
  X,
  Diamond,
  Eraser,
  FrameCorners,
  PaintBrush,
  PaintBucket,
  PencilSimple,
  Rectangle,
  SlidersHorizontal,
  Stamp,
  type Icon,
} from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { MATERIAL, MATERIAL_NAME, type MaterialId } from "@agartha/protocol/world";

import {
  MATERIAL_TOOL_DEFAULTS,
  type MaterialToolSettings,
  type NewPaintSwatch,
  type PaintSwatch,
  type ShapeMode,
  type ToolMode,
} from "../app/demoWorld";

const EDITABLE_MATERIALS: MaterialId[] = [
  MATERIAL.Paint,
  MATERIAL.Stone,
  MATERIAL.Water,
  MATERIAL.Fire,
  MATERIAL.Plant,
];

const MATERIAL_SWATCH_COLORS: Record<MaterialId, string> = {
  [MATERIAL.Empty]: "#0c0e12",
  [MATERIAL.Paint]: "#5faaff",
  [MATERIAL.Stone]: "#7e848e",
  [MATERIAL.Water]: "#307ad2",
  [MATERIAL.Fire]: "#e6522a",
  [MATERIAL.Plant]: "#4fa45b",
};

const TOOL_OPTIONS: Array<{ readonly id: ToolMode; readonly label: string; readonly shortcut: string; readonly Icon: Icon }> = [
  { id: "paint", label: "Pencil", shortcut: "1", Icon: PencilSimple },
  { id: "brush", label: "Brush", shortcut: "2", Icon: PaintBrush },
  { id: "shape", label: "Shape", shortcut: "3", Icon: Rectangle },
  { id: "bucket", label: "Bucket", shortcut: "4", Icon: PaintBucket },
  { id: "eraser", label: "Eraser", shortcut: "5", Icon: Eraser },
  { id: "stamp", label: "Stamp", shortcut: "6", Icon: Stamp },
  { id: "cursor", label: "Cursor", shortcut: "7", Icon: Cursor },
  { id: "marquee", label: "Marquee", shortcut: "8", Icon: FrameCorners },
];

const SHAPE_OPTIONS: Array<{ readonly id: ShapeMode; readonly label: string; readonly Icon: Icon }> = [
  { id: "rectangle", label: "Rectangle", Icon: Rectangle },
  { id: "circle", label: "Circle", Icon: Circle },
  { id: "diamond", label: "Diamond", Icon: Diamond },
];

export interface MaterialEditorPanelProps {
  readonly settings: MaterialToolSettings;
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  readonly paintSwatches: readonly PaintSwatch[];
  readonly onCreatePaintSwatch: (material: NewPaintSwatch) => void;
  readonly onRedo: () => void;
  readonly onUndo: () => void;
  readonly onUpdatePaintSwatch: (id: number, color: string) => void;
  readonly onUpdateSettings: (settings: MaterialToolSettings) => void;
  readonly onClear: () => void;
  readonly onClearAllCells?: () => void;
  readonly showClearAllCells?: boolean;
}

export interface ToolDockProps {
  readonly paintSwatches: readonly PaintSwatch[];
  readonly settings: MaterialToolSettings;
  readonly onUpdateSettings: (settings: MaterialToolSettings) => void;
}

export function ToolDock({ paintSwatches, settings, onUpdateSettings }: ToolDockProps) {
  const materialPalette = getMaterialPalette(paintSwatches);

  function updateMode(mode: ToolMode) {
    onUpdateSettings({
      ...settings,
      mode,
      ...(mode === "eraser" ? MATERIAL_TOOL_DEFAULTS[MATERIAL.Empty] : {}),
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      const tool = TOOL_OPTIONS.find((option) => option.shortcut === event.key);
      if (!tool) return;
      event.preventDefault();
      updateMode(tool.id);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings, onUpdateSettings]);

  function selectMaterial(item: MaterialPaletteItem) {
    onUpdateSettings({
      ...settings,
      material: item.material,
      ...(item.material === MATERIAL.Paint ? { paintVariant: item.paintVariant ?? settings.paintVariant } : {}),
      ...MATERIAL_TOOL_DEFAULTS[item.material],
    });
  }

  return (
    <div className="tool-dock gradient-border-2 animate-gradient-border" role="radiogroup" aria-label="Tool">
      <div className="tool-dock__tools">
        {TOOL_OPTIONS.map((tool) => {
          const ToolIcon = tool.Icon;
          return (
            <div className="tool-dock__tool-shell" data-tool-shell={tool.id} key={tool.id}>
              {tool.id === "shape" && settings.mode === "shape" ? (
                <ShapeModeBar
                  mode={settings.shapeMode}
                  onChangeMode={(shapeMode) => onUpdateSettings({ ...settings, shapeMode })}
                />
              ) : null}
              {isBrushSizeTool(tool.id) && tool.id === settings.mode ? (
                <BrushSizeBar
                  brushSize={settings.brushSize}
                  onChangeBrushSize={(brushSize) => onUpdateSettings({ ...settings, brushSize })}
                />
              ) : null}
              <button
                aria-checked={tool.id === settings.mode}
                aria-label={tool.label}
                className="tool-dock__button"
                data-submenu-open={isBrushSizeTool(tool.id) && tool.id === settings.mode ? "true" : undefined}
                data-tooltip={`${tool.label} (${tool.shortcut})`}
                data-tool={tool.id}
                onClick={() => updateMode(tool.id)}
                role="radio"
                title={`${tool.label} (${tool.shortcut})`}
                type="button"
              >
                <ToolIcon aria-hidden="true" size={18} weight={tool.id === settings.mode ? "fill" : "regular"} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="tool-dock__colors" role="radiogroup" aria-label="Dock material palette">
        {materialPalette.map((item) => (
          <button
            aria-checked={isActiveMaterialPaletteItem(item, settings)}
            aria-label={item.ariaLabel}
            className="tool-dock__color"
            data-kind={item.kind}
            data-tooltip={item.label}
            key={item.id}
            onClick={() => selectMaterial(item)}
            role="radio"
            style={{ "--paint-slot-color": item.color } as React.CSSProperties}
            title={item.label}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function BrushSizeBar({
  brushSize,
  onChangeBrushSize,
}: {
  readonly brushSize: number;
  readonly onChangeBrushSize: (size: number) => void;
}) {
  return (
    <div className="brush-size-bar" aria-label="Brush size menu">
      <input
        aria-label="Toolbar brush size"
        max="10"
        min="1"
        onChange={(event) => onChangeBrushSize(Number(event.currentTarget.value))}
        type="range"
        value={brushSize}
      />
    </div>
  );
}

export function ShapeModeBar({
  mode,
  onChangeMode,
}: {
  readonly mode: ShapeMode;
  readonly onChangeMode: (mode: ShapeMode) => void;
}) {
  return (
    <div className="shape-mode-bar" role="radiogroup" aria-label="Shape mode">
      {SHAPE_OPTIONS.map((shape) => {
        const ShapeIcon = shape.Icon;
        return (
          <button
            aria-checked={shape.id === mode}
            aria-label={shape.label}
            data-tooltip={shape.label}
            key={shape.id}
            onClick={() => onChangeMode(shape.id)}
            role="radio"
            title={shape.label}
            type="button"
          >
            <ShapeIcon aria-hidden="true" size={17} weight={shape.id === mode ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}

function isBrushSizeTool(mode: ToolMode) {
  return mode === "brush" || mode === "eraser";
}

interface MaterialPaletteItem {
  readonly id: string;
  readonly ariaLabel: string;
  readonly color: string;
  readonly kind: "paint" | "material";
  readonly label: string;
  readonly material: MaterialId;
  readonly paintVariant?: number;
}

function getMaterialPalette(paintSwatches: readonly PaintSwatch[]): MaterialPaletteItem[] {
  const paintItems = paintSwatches.map((swatch) => ({
    ariaLabel: swatch.label,
    color: swatch.color,
    id: `paint-${swatch.id}`,
    kind: "paint" as const,
    label: swatch.label,
    material: MATERIAL.Paint,
    paintVariant: swatch.id,
  }));

  const materialItems = EDITABLE_MATERIALS.filter((material) => material !== MATERIAL.Paint).map((material) => {
    const label = materialDisplayName(material);
    return {
      ariaLabel: `${label} material`,
      color: MATERIAL_SWATCH_COLORS[material],
      id: `material-${MATERIAL_NAME[material]}`,
      kind: "material" as const,
      label,
      material,
    };
  });

  return [...paintItems, ...materialItems];
}

function isActiveMaterialPaletteItem(item: MaterialPaletteItem, settings: MaterialToolSettings) {
  if (item.material !== settings.material) return false;
  if (item.kind === "paint") return settings.paintVariant === item.paintVariant;
  return true;
}

function materialDisplayName(material: MaterialId) {
  const name = MATERIAL_NAME[material];
  return `${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`;
}

function materialDisplayNameForShape(shapeMode: ShapeMode) {
  return `${shapeMode[0]?.toUpperCase() ?? ""}${shapeMode.slice(1)}`;
}

export function MaterialEditorPanel({
  settings,
  canRedo,
  canUndo,
  paintSwatches,
  onCreatePaintSwatch,
  onRedo,
  onUndo,
  onUpdatePaintSwatch,
  onUpdateSettings,
  onClear,
  onClearAllCells,
  showClearAllCells = false,
}: MaterialEditorPanelProps) {
  const isEraser = settings.mode === "eraser";
  const isObjectTool = settings.mode === "stamp" || settings.mode === "cursor" || settings.mode === "marquee";
  const usesShapeSettings = !isObjectTool && settings.mode !== "paint" && settings.mode !== "eraser";
  const isPaint = !isEraser && settings.material === MATERIAL.Paint;
  const isSingleCellTool = settings.mode === "paint" || settings.mode === "eraser" || isObjectTool;
  const activePaintSwatch = paintSwatches.find((swatch) => swatch.id === settings.paintVariant) ?? paintSwatches[0];
  const activePaintColor = activePaintSwatch?.color ?? "#5faaff";
  const activeMaterialLabel = isPaint ? activePaintSwatch?.label ?? "Paint" : materialDisplayName(settings.material);
  const activeMaterialColor = isPaint ? activePaintColor : MATERIAL_SWATCH_COLORS[settings.material];
  const createMaterialButtonRef = useRef<HTMLButtonElement | null>(null);
  const createMaterialDialogRef = useRef<HTMLFormElement | null>(null);
  const [paintColorDraft, setPaintColorDraft] = useState(activePaintColor);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newMaterial, setNewMaterial] = useState<NewPaintSwatch>({
    label: "New material",
    color: "#88e060",
    density: 42,
    friction: 36,
    flow: 24,
    heat: 0,
    growth: 18,
    emissive: 10,
    stability: 64,
  });

  useEffect(() => {
    setPaintColorDraft(activePaintColor);
  }, [activePaintColor]);

  useEffect(() => {
    if (!isCreateModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeCreateModal();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateModalOpen]);

  function updatePaintColor(color: string) {
    setPaintColorDraft(color);
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      onUpdatePaintSwatch(settings.paintVariant, color.toLowerCase());
    }
  }

  function createMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreatePaintSwatch(newMaterial);
    setNewMaterial((current) => ({ ...current, label: "" }));
    setIsCreateModalOpen(false);
  }

  function openCreateModal() {
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    window.requestAnimationFrame(() => createMaterialButtonRef.current?.focus());
  }

  function keepModalFocus(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Tab") return;

    const focusableElements = createMaterialDialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
    );
    const focusable = Array.from(focusableElements ?? []).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateNewMaterialNumber(key: keyof Pick<NewPaintSwatch, "density" | "friction" | "flow" | "heat" | "growth" | "emissive" | "stability">, value: string) {
    setNewMaterial((current) => ({
      ...current,
      [key]: Math.max(0, Math.min(100, Math.round(Number(value)))),
    }));
  }

  return (
    <section className="inspector-panel material-editor" aria-label="Brush and paint settings">
      <div className="inspector-panel__header-row">
        <h2>Brush &amp; paint</h2>
      </div>
      {!isEraser && !isObjectTool ? (
        <div className="material-editor__active-material" aria-label="Active material">
          <span aria-hidden="true" style={{ "--active-material-color": activeMaterialColor } as React.CSSProperties} />
          <div>
            <strong>{activeMaterialLabel}</strong>
            <small>{isPaint ? "Paint material" : "Material"}</small>
          </div>
          {isPaint && activePaintSwatch ? (
            <dl aria-label="Active material properties">
              <div>
                <dt>Density</dt>
                <dd>{activePaintSwatch.density}</dd>
              </div>
              <div>
                <dt>Flow</dt>
                <dd>{activePaintSwatch.flow}</dd>
              </div>
              <div>
                <dt>Heat</dt>
                <dd>{activePaintSwatch.heat}</dd>
              </div>
              <div>
                <dt>Growth</dt>
                <dd>{activePaintSwatch.growth}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
      {isPaint && !isObjectTool ? (
        <div className="paint-slots" aria-label="Paint slots">
          <label className="paint-slots__color">
            <span>Color</span>
            <input
              aria-label="Paint color"
              onChange={(event) => updatePaintColor(event.currentTarget.value)}
              type="color"
              value={activePaintColor}
            />
          </label>
          <label className="paint-slots__hex">
            <span>Hex</span>
            <input
              aria-label="Paint hex"
              onChange={(event) => updatePaintColor(event.currentTarget.value)}
              spellCheck="false"
              value={paintColorDraft}
            />
          </label>
        </div>
      ) : null}
      {!isEraser && !isObjectTool ? (
        <button className="material-editor__new-material-button" onClick={openCreateModal} ref={createMaterialButtonRef} type="button">
          <Plus aria-hidden="true" size={15} />
          New material
        </button>
      ) : null}
      {usesShapeSettings ? (
        <div className="material-editor__settings" aria-label="Brush settings">
          <div className="material-editor__settings-header">
            <SlidersHorizontal aria-hidden="true" size={15} />
            <span>{settings.mode === "shape" ? `${materialDisplayNameForShape(settings.shapeMode)} Shape` : "Tool Shape"}</span>
          </div>
          <label>
            <span>Size</span>
            <output>{settings.brushSize}</output>
            <input
              aria-label="Brush size"
              max="10"
              min="1"
              onChange={(event) => onUpdateSettings({ ...settings, brushSize: Number(event.currentTarget.value) })}
              type="range"
              value={settings.brushSize}
            />
          </label>
          <label>
            <span>Hardness</span>
            <output>{settings.hardness}%</output>
            <input
              aria-label="Brush hardness"
              disabled={isSingleCellTool}
              max="100"
              min="0"
              onChange={(event) => onUpdateSettings({ ...settings, hardness: Number(event.currentTarget.value) })}
              step="5"
              type="range"
              value={settings.hardness}
            />
          </label>
          <label>
            <span>Opacity</span>
            <output>{settings.opacity}%</output>
            <input
              aria-label="Brush opacity"
              disabled={isSingleCellTool}
              max="100"
              min="10"
              onChange={(event) => onUpdateSettings({ ...settings, opacity: Number(event.currentTarget.value) })}
              step="5"
              type="range"
              value={settings.opacity}
            />
          </label>
        </div>
      ) : null}
      <button className="material-editor__clear" onClick={onClear} type="button">
        Reset demo cells
      </button>
      {showClearAllCells && onClearAllCells ? (
        <button className="material-editor__clear" data-variant="clear-all" onClick={onClearAllCells} type="button">
          Clear all cells
        </button>
      ) : null}
      <div className="material-editor__history-controls">
        <button aria-label="Undo edit" disabled={!canUndo} onClick={onUndo} type="button">
          <ArrowCounterClockwise aria-hidden="true" size={15} />
          Undo
        </button>
        <button aria-label="Redo edit" disabled={!canRedo} onClick={onRedo} type="button">
          <ArrowClockwise aria-hidden="true" size={15} />
          Redo
        </button>
      </div>
      {isCreateModalOpen ? (
        <div className="material-modal" role="presentation" onMouseDown={closeCreateModal}>
          <form
            aria-label="New material"
            aria-modal="true"
            className="material-modal__dialog gradient-border-2 gradient-border-to-br"
            onKeyDown={keepModalFocus}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={createMaterial}
            ref={createMaterialDialogRef}
            role="dialog"
          >
            <div className="material-modal__header">
              <div>
                <h2>New Material</h2>
                <p>Define the material once. Cells only store material id and variant.</p>
              </div>
              <button aria-label="Close new material modal" onClick={closeCreateModal} type="button">
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="material-modal__identity">
              <label>
                <span>Name</span>
                <input
                  aria-label="New material name"
                  autoFocus
                  onChange={(event) => {
                    const label = event.currentTarget.value;
                    setNewMaterial((current) => ({ ...current, label }));
                  }}
                  placeholder="moss, glass, lava..."
                  value={newMaterial.label}
                />
              </label>
              <label>
                <span>Color</span>
                <input
                  aria-label="New material color"
                  onChange={(event) => {
                    const color = event.currentTarget.value;
                    setNewMaterial((current) => ({ ...current, color }));
                  }}
                  type="color"
                  value={newMaterial.color}
                />
              </label>
            </div>
            <div className="material-modal__properties" aria-label="Material properties">
              <MaterialRange label="Density" value={newMaterial.density} onChange={(value) => updateNewMaterialNumber("density", value)} />
              <MaterialRange label="Friction" value={newMaterial.friction} onChange={(value) => updateNewMaterialNumber("friction", value)} />
              <MaterialRange label="Flow" value={newMaterial.flow} onChange={(value) => updateNewMaterialNumber("flow", value)} />
              <MaterialRange label="Heat" value={newMaterial.heat} onChange={(value) => updateNewMaterialNumber("heat", value)} />
              <MaterialRange label="Growth" value={newMaterial.growth} onChange={(value) => updateNewMaterialNumber("growth", value)} />
              <MaterialRange label="Emissive" value={newMaterial.emissive} onChange={(value) => updateNewMaterialNumber("emissive", value)} />
              <MaterialRange label="Stability" value={newMaterial.stability} onChange={(value) => updateNewMaterialNumber("stability", value)} />
            </div>
            <div className="material-modal__footer">
              <button onClick={closeCreateModal} type="button">
                Cancel
              </button>
              <button type="submit">Save material</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function MaterialRange({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <output>{value}</output>
      <input
        aria-label={`New material ${label.toLowerCase()}`}
        max="100"
        min="0"
        onChange={(event) => onChange(event.currentTarget.value)}
        type="range"
        value={value}
      />
    </label>
  );
}
