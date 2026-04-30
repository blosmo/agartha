import { useEffect, useRef, useState } from "react";
import { Crosshair, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { MATERIAL_NAME, type WorldCoord } from "@agartha/protocol/world";

import { ChunkTextureCache } from "./chunkTextureCache";
import { materialColor } from "./materialPalette";
import { DEMO_CANVAS_CELLS, absoluteCoord, type DemoCell, type MaterialToolSettings, type PaintSwatch } from "../app/demoWorld";

const demoCache = new ChunkTextureCache();
const DEFAULT_CAMERA = { x: -620, y: -620, zoom: 8 };

export interface BoardCanvasProps {
  readonly cells: readonly DemoCell[];
  readonly paintSwatches: readonly PaintSwatch[];
  readonly selectedCoord: WorldCoord;
  readonly selection?: CellSelection;
  readonly toolSettings: MaterialToolSettings;
  readonly onApplyStroke?: (coords: readonly WorldCoord[]) => void;
  readonly onApplyTool: (coord: WorldCoord) => void;
  readonly onMarqueeSelect: (selection: CellSelection) => void;
  readonly onSelectCell: (coord: WorldCoord) => void;
}

export interface CellSelection {
  readonly origin: WorldCoord;
  readonly width: number;
  readonly height: number;
}

export function BoardCanvas({
  cells,
  paintSwatches,
  selectedCoord,
  selection,
  toolSettings,
  onApplyStroke,
  onApplyTool,
  onMarqueeSelect,
  onSelectCell,
}: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cellsLayerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef(DEFAULT_CAMERA);
  const dragStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
    startCoord?: WorldCoord;
    lastStrokeCoord?: WorldCoord;
    mode: "pan" | "marquee" | "stroke";
  } | null>(null);
  const suppressNextCellClick = useRef(false);
  const [, forceCameraRender] = useState(0);
  const [marqueePreview, setMarqueePreview] = useState<CellSelection | undefined>();

  useEffect(() => {
    demoCache.applySnapshot({
      worldId: "origin",
      chunk: { x: 0, y: 0 },
      version: 1,
      cells,
    });
  }, [cells]);

  const camera = cameraRef.current;

  function applyCamera(nextCamera: typeof DEFAULT_CAMERA, shouldRender = false) {
    cameraRef.current = nextCamera;
    if (cellsLayerRef.current) {
      cellsLayerRef.current.style.transform = cameraTransform(nextCamera);
    }
    if (shouldRender) {
      forceCameraRender((version) => version + 1);
    }
  }

  function applyZoom(nextZoom: number, anchor?: { readonly x: number; readonly y: number }) {
    const boundedZoom = Math.max(4, Math.min(18, nextZoom));
    const currentCamera = cameraRef.current;
    const host = hostRef.current;
    if (!host || boundedZoom === currentCamera.zoom) return;

    const anchorX = anchor?.x ?? host.clientWidth / 2;
    const anchorY = anchor?.y ?? host.clientHeight / 2;
    const worldX = (anchorX - currentCamera.x) / currentCamera.zoom;
    const worldY = (anchorY - currentCamera.y) / currentCamera.zoom;

    applyCamera(
      {
        x: anchorX - worldX * boundedZoom,
        y: anchorY - worldY * boundedZoom,
        zoom: boundedZoom,
      },
      true,
    );
  }

  function selectRelativeCell(deltaX: number, deltaY: number) {
    const absolute = absoluteCoord(selectedCoord);
    const nextCoord = screenAbsoluteToCoord(absolute.x + deltaX, absolute.y + deltaY);
    onSelectCell(nextCoord);
    onMarqueeSelect({ height: 1, origin: nextCoord, width: 1 });
  }

  return (
    <div
      aria-label="Agartha cellular world board. Use arrow keys to move the selected cell, Enter to apply the active tool, plus and minus to zoom, and 0 to reset view."
      className="board-canvas"
      data-agent-id="board-canvas"
      data-tool={toolSettings.mode}
      ref={hostRef}
      role="application"
      tabIndex={0}
      data-testid="board-canvas"
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectRelativeCell(0, -1);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectRelativeCell(0, 1);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          selectRelativeCell(-1, 0);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          selectRelativeCell(1, 0);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onApplyTool(selectedCoord);
          return;
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          applyZoom(cameraRef.current.zoom + 1);
          return;
        }
        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          applyZoom(cameraRef.current.zoom - 1);
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          applyCamera(DEFAULT_CAMERA, true);
        }
      }}
      onPointerDown={(event) => {
        const canStroke = isStrokeTool(toolSettings.mode);
        if ((event.target as HTMLElement).dataset.cellId && !isSelectionTool(toolSettings.mode) && !canStroke) {
          return;
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const currentCamera = cameraRef.current;
        const coord = screenToCoord(event.clientX, event.clientY, event.currentTarget, currentCamera);
        if (canStroke) {
          suppressNextCellClick.current = Boolean((event.target as HTMLElement).dataset.cellId);
          onSelectCell(coord);
          onApplyTool(coord);
        }
        dragStart.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX: currentCamera.x,
          panY: currentCamera.y,
          lastStrokeCoord: canStroke ? coord : undefined,
          mode: canStroke ? "stroke" : toolSettings.mode === "marquee" ? "marquee" : "pan",
          startCoord: toolSettings.mode === "marquee" ? coord : undefined,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragStart.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.mode === "stroke") {
          const coord = screenToCoord(event.clientX, event.clientY, event.currentTarget, cameraRef.current);
          const strokeCoords = drag.lastStrokeCoord ? interpolatedCoords(drag.lastStrokeCoord, coord) : [coord];
          const finalCoord = strokeCoords[strokeCoords.length - 1];
          if (finalCoord) onSelectCell(finalCoord);
          if (onApplyStroke) {
            onApplyStroke(strokeCoords);
          } else {
            strokeCoords.forEach((strokeCoord) => onApplyTool(strokeCoord));
          }
          dragStart.current = { ...drag, lastStrokeCoord: coord };
          return;
        }
        if (drag.mode === "marquee" && drag.startCoord) {
          setMarqueePreview(selectionFromCoords(drag.startCoord, screenToCoord(event.clientX, event.clientY, event.currentTarget, cameraRef.current)));
          return;
        }
        applyCamera(
          {
            ...cameraRef.current,
            x: drag.panX + event.clientX - drag.x,
            y: drag.panY + event.clientY - drag.y,
          },
          false,
        );
      }}
      onPointerUp={(event) => {
        const drag = dragStart.current;
        if (drag && hostRef.current) {
          const moved = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
          if (drag.mode === "stroke") {
            dragStart.current = null;
            return;
          }
          if (drag.mode === "marquee" && drag.startCoord) {
            const nextSelection = selectionFromCoords(drag.startCoord, screenToCoord(event.clientX, event.clientY, hostRef.current, cameraRef.current));
            setMarqueePreview(undefined);
            onMarqueeSelect(nextSelection);
            onSelectCell(nextSelection.origin);
            dragStart.current = null;
            return;
          }
          if (moved < 4) {
            const coord = screenToCoord(event.clientX, event.clientY, hostRef.current, cameraRef.current);
            onSelectCell(coord);
            onApplyTool(coord);
          }
        }
        dragStart.current = null;
      }}
      onWheel={(event) => {
        event.preventDefault();
        const isPinchZoom = event.ctrlKey || event.metaKey;
        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const deltaX = event.deltaX;
        const deltaY = event.deltaY;
        const currentCamera = cameraRef.current;
        if (isPinchZoom) {
          applyZoom(currentCamera.zoom + (deltaY < 0 ? 1 : -1), { x: pointerX, y: pointerY });
          return;
        }

        applyCamera(
          {
            ...currentCamera,
            x: currentCamera.x - deltaX,
            y: currentCamera.y - deltaY,
          },
          false,
        );
      }}
    >
      <div className="board-canvas__view-controls" aria-label="View controls" data-agent-region="view-controls">
        <button
          aria-label="Reset view"
          data-agent-id="reset-view"
          onClick={() => applyCamera(DEFAULT_CAMERA, true)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <Crosshair aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Zoom in"
          data-agent-id="zoom-in"
          onClick={() => applyZoom(cameraRef.current.zoom + 1)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <MagnifyingGlassPlus aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Zoom out"
          data-agent-id="zoom-out"
          onClick={() => applyZoom(cameraRef.current.zoom - 1)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <MagnifyingGlassMinus aria-hidden="true" size={16} />
        </button>
      </div>
      <div
        className="board-canvas__fallback"
        data-agent-region="board-cells"
        data-testid="board-cells"
        ref={cellsLayerRef}
        role="grid"
        style={{ transform: cameraTransform(camera) }}
      >
        <div
          className="board-canvas__extent"
          data-testid="board-extent"
          style={{
            backgroundSize: `${camera.zoom}px ${camera.zoom}px, ${camera.zoom}px ${camera.zoom}px, auto, auto`,
            height: DEMO_CANVAS_CELLS * camera.zoom,
            width: DEMO_CANVAS_CELLS * camera.zoom,
          }}
        />
        {cells.map((cell) => {
          const absolute = absoluteCoord(cell.coord);
          const isSelected = formatCoord(cell.coord) === formatCoord(selectedCoord);
          return (
            <span
              aria-label={`Cell ${formatCoord(cell.coord)} ${MATERIAL_NAME[cell.material]} state ${cell.state}`}
              aria-selected={isSelected}
              data-cell-id={cell.id}
              data-agent-id={`cell-${cell.id}`}
              data-material={MATERIAL_NAME[cell.material]}
              key={cell.id}
              role="gridcell"
              onClick={(event) => {
                event.stopPropagation();
                onSelectCell(cell.coord);
                if (toolSettings.mode === "cursor") {
                  onMarqueeSelect({ height: 1, origin: cell.coord, width: 1 });
                  return;
                }
                if (toolSettings.mode === "marquee") {
                  onMarqueeSelect({ height: 1, origin: cell.coord, width: 1 });
                  return;
                }
                if (isStrokeTool(toolSettings.mode)) {
                  if (suppressNextCellClick.current) {
                    suppressNextCellClick.current = false;
                    return;
                  }
                  onApplyTool(cell.coord);
                  return;
                }
                onApplyTool(cell.coord);
              }}
              style={{
                backgroundColor: rgba(materialColor(cell.material, cell.variant, paintSwatches)),
                height: camera.zoom,
                left: absolute.x * camera.zoom,
                top: absolute.y * camera.zoom,
                width: camera.zoom,
              }}
            />
          );
        })}
        <SelectionOverlay cameraZoom={camera.zoom} selection={marqueePreview ?? selection} />
      </div>
    </div>
  );
}

function SelectionOverlay({ cameraZoom, selection }: { readonly cameraZoom: number; readonly selection?: CellSelection }) {
  if (!selection) return null;
  const origin = absoluteCoord(selection.origin);
  return (
    <div
      className="board-canvas__selection"
      data-testid="board-selection"
      style={{
        height: selection.height * cameraZoom,
        left: origin.x * cameraZoom,
        top: origin.y * cameraZoom,
        width: selection.width * cameraZoom,
      }}
    />
  );
}

function screenToCoord(clientX: number, clientY: number, element: HTMLElement, camera: { x: number; y: number; zoom: number }) {
  const rect = element.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left - camera.x) / camera.zoom);
  const y = Math.floor((clientY - rect.top - camera.y) / camera.zoom);
  return {
    chunk: {
      x: Math.floor(x / 128),
      y: Math.floor(y / 128),
    },
    cell: {
      x: ((x % 128) + 128) % 128,
      y: ((y % 128) + 128) % 128,
    },
  };
}

function cameraTransform(camera: { x: number; y: number }) {
  return `translate3d(${camera.x}px, ${camera.y}px, 0)`;
}

function selectionFromCoords(a: WorldCoord, b: WorldCoord): CellSelection {
  const absoluteA = absoluteCoord(a);
  const absoluteB = absoluteCoord(b);
  const minX = Math.min(absoluteA.x, absoluteB.x);
  const minY = Math.min(absoluteA.y, absoluteB.y);
  return {
    height: Math.abs(absoluteB.y - absoluteA.y) + 1,
    origin: screenAbsoluteToCoord(minX, minY),
    width: Math.abs(absoluteB.x - absoluteA.x) + 1,
  };
}

function screenAbsoluteToCoord(x: number, y: number): WorldCoord {
  return {
    chunk: {
      x: Math.floor(x / 128),
      y: Math.floor(y / 128),
    },
    cell: {
      x: ((x % 128) + 128) % 128,
      y: ((y % 128) + 128) % 128,
    },
  };
}

function interpolatedCoords(start: WorldCoord, end: WorldCoord): WorldCoord[] {
  const absoluteStart = absoluteCoord(start);
  const absoluteEnd = absoluteCoord(end);
  const dx = absoluteEnd.x - absoluteStart.x;
  const dy = absoluteEnd.y - absoluteStart.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [];

  const coords: WorldCoord[] = [];
  for (let step = 1; step <= steps; step += 1) {
    coords.push(
      screenAbsoluteToCoord(
        Math.round(absoluteStart.x + (dx * step) / steps),
        Math.round(absoluteStart.y + (dy * step) / steps),
      ),
    );
  }
  return coords;
}

function formatCoord(coord: WorldCoord) {
  const absolute = absoluteCoord(coord);
  return `${absolute.x}:${absolute.y}`;
}

function isStrokeTool(mode: MaterialToolSettings["mode"]) {
  return mode === "paint" || mode === "brush" || mode === "eraser";
}

function isSelectionTool(mode: MaterialToolSettings["mode"]) {
  return mode === "cursor" || mode === "marquee";
}

function rgba(color: [number, number, number, number]) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}
