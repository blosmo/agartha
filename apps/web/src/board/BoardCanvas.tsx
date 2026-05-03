import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Crosshair, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { CHUNK_SIZE, MATERIAL, MATERIAL_NAME, type ChunkCoord, type WorldCoord } from "@agartha/protocol/world";

import { ChunkTextureCache, chunkKey, type ChunkTextureRecord } from "./chunkTextureCache";
import { materialColor } from "./materialPalette";
import { DEMO_CANVAS_CELLS, absoluteCoord, type DemoCell, type MaterialToolSettings, type PaintSwatch } from "../app/demoWorld";

const DEFAULT_CAMERA = { x: -620, y: -620, zoom: 8 };
const BOARD_CHUNKS = boardChunks();

export interface BoardCanvasProps {
  readonly cells: readonly DemoCell[];
  readonly paintSwatches: readonly PaintSwatch[];
  readonly selectedCoord: WorldCoord;
  readonly selection?: CellSelection;
  readonly toolSettings: MaterialToolSettings;
  readonly onApplyShape?: (coords: readonly WorldCoord[]) => void;
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
  onApplyShape,
  onApplyStroke,
  onApplyTool,
  onMarqueeSelect,
  onSelectCell,
}: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const backgroundLayerRef = useRef<HTMLDivElement | null>(null);
  const gpuHostRef = useRef<HTMLDivElement | null>(null);
  const cellsLayerRef = useRef<HTMLDivElement | null>(null);
  const chunkCanvasRefs = useRef(new Map<string, HTMLCanvasElement>());
  const textureCacheRef = useRef(new ChunkTextureCache());
  const gpuSurfaceRef = useRef<BoardGpuSurface | null>(null);
  const cameraRef = useRef(DEFAULT_CAMERA);
  const dragStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
    startCoord?: WorldCoord;
    lastStrokeCoord?: WorldCoord;
    mode: "line" | "pan" | "marquee" | "shape" | "stroke";
    strokeCoords?: WorldCoord[];
    strokeKeys?: Set<string>;
  } | null>(null);
  const [, forceCameraRender] = useState(0);
  const [rendererMode, setRendererMode] = useState<BoardRendererMode>("chunk-canvas");
  const [marqueePreview, setMarqueePreview] = useState<CellSelection | undefined>();
  const [linePreview, setLinePreview] = useState<LinePreview | undefined>();

  useEffect(() => {
    if (typeof window === "undefined" || window.navigator.userAgent.toLowerCase().includes("jsdom")) return;

    let cancelled = false;
    const host = gpuHostRef.current;
    if (!host) return;

    createBoardGpuSurface(host)
      .then((surface) => {
        if (cancelled) {
          surface.destroy();
          return;
        }

        gpuSurfaceRef.current = surface;
        setRendererMode(surface.mode);
        surface.setCamera(cameraRef.current);
        surface.syncChunks(textureCacheRef.current.entries(), chunkCanvasRefs.current);
      })
      .catch((error: unknown) => {
        console.warn("Agartha board GPU renderer unavailable, using chunk canvas fallback.", error);
        setRendererMode("chunk-canvas");
      });

    return () => {
      cancelled = true;
      gpuSurfaceRef.current?.destroy();
      gpuSurfaceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cellsByChunk = groupCellsByChunk(cells);
    const cache = textureCacheRef.current;

    for (const chunk of BOARD_CHUNKS) {
      const record = cache.applySnapshot(
        {
          worldId: "origin",
          chunk,
          version: 1,
          cells: cellsByChunk.get(chunkKey(chunk)) ?? [],
        },
        (cell) => materialColor(cell.material, cell.variant, paintSwatches),
      );
      const canvas = chunkCanvasRefs.current.get(chunkKey(chunk));
      if (canvas) paintChunkCanvas(canvas, record);
    }

    cache.releaseOutside(BOARD_CHUNKS);
    gpuSurfaceRef.current?.syncChunks(cache.entries(), chunkCanvasRefs.current);
  }, [cells, paintSwatches]);

  const camera = cameraRef.current;

  function applyCamera(nextCamera: typeof DEFAULT_CAMERA, shouldRender = false) {
    cameraRef.current = nextCamera;
    if (backgroundLayerRef.current) {
      backgroundLayerRef.current.style.transform = cameraTransform(nextCamera);
    }
    if (cellsLayerRef.current) {
      cellsLayerRef.current.style.transform = cameraTransform(nextCamera);
    }
    gpuSurfaceRef.current?.setCamera(nextCamera);
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
        const canShapeDrag = toolSettings.mode === "shape";
        const canLineDrag = toolSettings.mode === "line";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const currentCamera = cameraRef.current;
        const coord = screenToCoord(event.clientX, event.clientY, event.currentTarget, currentCamera);
        const strokeKeys = canStroke ? new Set<string>() : undefined;
        const strokeCoords = canStroke ? collectStrokeCoords([coord], strokeKeys) : undefined;
        if (canStroke && strokeCoords)
          previewStroke(strokeCoords, toolSettings, paintSwatches, textureCacheRef.current, chunkCanvasRefs.current, gpuSurfaceRef.current);
        dragStart.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX: currentCamera.x,
          panY: currentCamera.y,
          lastStrokeCoord: canStroke ? coord : undefined,
          mode: canStroke ? "stroke" : canShapeDrag ? "shape" : canLineDrag ? "line" : toolSettings.mode === "marquee" ? "marquee" : "pan",
          startCoord: canShapeDrag || canLineDrag || toolSettings.mode === "marquee" ? coord : undefined,
          strokeCoords,
          strokeKeys,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragStart.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.mode === "stroke") {
          const coord = screenToCoord(event.clientX, event.clientY, event.currentTarget, cameraRef.current);
          const strokeCoords = drag.lastStrokeCoord ? interpolatedCoords(drag.lastStrokeCoord, coord) : [coord];
          const nextStrokeCoords = collectStrokeCoords(strokeCoords, drag.strokeKeys);
          const finalCoord = strokeCoords[strokeCoords.length - 1];
          previewStroke(nextStrokeCoords, toolSettings, paintSwatches, textureCacheRef.current, chunkCanvasRefs.current, gpuSurfaceRef.current);
          dragStart.current = {
            ...drag,
            lastStrokeCoord: coord,
            strokeCoords: [...(drag.strokeCoords ?? []), ...nextStrokeCoords],
          };
          return;
        }
        if (drag.mode === "marquee" && drag.startCoord) {
          setMarqueePreview(selectionFromCoords(drag.startCoord, screenToCoord(event.clientX, event.clientY, event.currentTarget, cameraRef.current)));
          return;
        }
        if (drag.mode === "shape" && drag.startCoord) {
          const nextSelection = shapeSelectionFromPointer(
            drag.startCoord,
            screenToCoord(event.clientX, event.clientY, event.currentTarget, cameraRef.current),
            event.shiftKey,
          );
          setMarqueePreview(nextSelection);
          return;
        }
        if (drag.mode === "line" && drag.startCoord) {
          setLinePreview({ end: screenToCoord(event.clientX, event.clientY, event.currentTarget, cameraRef.current), start: drag.startCoord });
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
            const strokeCoords = drag.strokeCoords ?? [];
            const finalCoord = strokeCoords[strokeCoords.length - 1];
            if (finalCoord) onSelectCell(finalCoord);
            if (onApplyStroke) {
              onApplyStroke(strokeCoords);
            } else {
              strokeCoords.forEach((strokeCoord) => onApplyTool(strokeCoord));
            }
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
          if (drag.mode === "shape" && drag.startCoord) {
            const finalCoord = screenToCoord(event.clientX, event.clientY, hostRef.current, cameraRef.current);
            if (moved < 4) {
              onSelectCell(finalCoord);
              onApplyTool(finalCoord);
            } else {
              const nextSelection = shapeSelectionFromPointer(drag.startCoord, finalCoord, event.shiftKey);
              const shapeCoords = shapeCoordsFromSelection(nextSelection, toolSettings.shapeMode);
              setMarqueePreview(undefined);
              onSelectCell(finalCoord);
              if (onApplyShape) {
                onApplyShape(shapeCoords);
              } else if (onApplyStroke) {
                onApplyStroke(shapeCoords);
              } else {
                shapeCoords.forEach((shapeCoord) => onApplyTool(shapeCoord));
              }
            }
            dragStart.current = null;
            return;
          }
          if (drag.mode === "line" && drag.startCoord) {
            const finalCoord = screenToCoord(event.clientX, event.clientY, hostRef.current, cameraRef.current);
            if (moved < 4) {
              onSelectCell(finalCoord);
              onApplyTool(finalCoord);
            } else {
              const lineCoords = lineCoordsFromEndpoints(drag.startCoord, finalCoord, {
                endArrow: toolSettings.lineEndArrow,
                startArrow: toolSettings.lineStartArrow,
                thickness: toolSettings.lineThickness,
              });
              setLinePreview(undefined);
              onSelectCell(finalCoord);
              if (onApplyShape) {
                onApplyShape(lineCoords);
              } else if (onApplyStroke) {
                onApplyStroke(lineCoords);
              } else {
                lineCoords.forEach((lineCoord) => onApplyTool(lineCoord));
              }
            }
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
      <div
        aria-hidden="true"
        className="board-canvas__background-layer"
        data-testid="board-background-layer"
        ref={backgroundLayerRef}
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
      </div>
      <div
        aria-hidden="true"
        className="board-canvas__gpu-host"
        data-agent-id="board-gpu-host"
        data-renderer={rendererMode}
        data-testid="board-gpu-host"
        data-webgpu={rendererMode === "pixi-webgpu" ? "true" : "false"}
        ref={gpuHostRef}
      />
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
        aria-label={`Agartha board texture renderer with ${cells.length} active cells. ${selectedCellDescription(selectedCoord, cells)}`}
        className="board-canvas__texture-layer"
        data-active-cells={cells.length}
        data-agent-region="board-cells"
        data-renderer={rendererMode}
        data-testid="board-cells"
        ref={cellsLayerRef}
        role="img"
        style={{ transform: cameraTransform(camera) }}
      >
        {BOARD_CHUNKS.map((chunk) => (
          <canvas
            aria-hidden="true"
            className="board-canvas__chunk"
            data-agent-id={`chunk-${chunkKey(chunk)}`}
            data-testid="board-chunk"
            height={CHUNK_SIZE}
            key={chunkKey(chunk)}
            ref={(node) => {
              const key = chunkKey(chunk);
              if (node) {
                chunkCanvasRefs.current.set(key, node);
              } else {
                chunkCanvasRefs.current.delete(key);
              }
            }}
            style={{
              display: rendererMode === "chunk-canvas" ? undefined : "none",
              height: CHUNK_SIZE * camera.zoom,
              left: chunk.x * CHUNK_SIZE * camera.zoom,
              top: chunk.y * CHUNK_SIZE * camera.zoom,
              width: CHUNK_SIZE * camera.zoom,
            }}
            width={CHUNK_SIZE}
          />
        ))}
        <SelectionOverlay cameraZoom={camera.zoom} selection={marqueePreview ?? selection} />
        <LineOverlay cameraZoom={camera.zoom} line={linePreview} settings={toolSettings} />
        <div className="sr-only" data-agent-id="board-renderer-status" data-testid="board-renderer-status">
          Renderer: {rendererMode}
        </div>
        <div className="sr-only" data-agent-id="board-semantic-cell" data-testid="board-semantic">
          {selectedCellDescription(selectedCoord, cells)}
        </div>
      </div>
    </div>
  );
}

interface LinePreview {
  readonly start: WorldCoord;
  readonly end: WorldCoord;
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

function LineOverlay({
  cameraZoom,
  line,
  settings,
}: {
  readonly cameraZoom: number;
  readonly line?: LinePreview;
  readonly settings: MaterialToolSettings;
}) {
  if (!line) return null;
  const start = absoluteCoord(line.start);
  const end = absoluteCoord(line.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy) * cameraZoom);
  const thickness = Math.max(1, settings.lineThickness) * cameraZoom;

  return (
    <div
      aria-hidden="true"
      className="board-canvas__line-preview"
      data-end-arrow={settings.lineEndArrow ? "true" : "false"}
      data-start-arrow={settings.lineStartArrow ? "true" : "false"}
      data-testid="board-line-preview"
      style={
        {
          "--line-preview-length": `${length}px`,
          "--line-preview-thickness": `${thickness}px`,
          left: (start.x + 0.5) * cameraZoom,
          top: (start.y + 0.5) * cameraZoom,
          transform: `rotate(${Math.atan2(dy, dx)}rad)`,
        } as CSSProperties
      }
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

function shapeSelectionFromPointer(start: WorldCoord, end: WorldCoord, constrainToSquare: boolean): CellSelection {
  if (!constrainToSquare) return selectionFromCoords(start, end);

  const startAbsolute = absoluteCoord(start);
  const endAbsolute = absoluteCoord(end);
  const deltaX = endAbsolute.x - startAbsolute.x;
  const deltaY = endAbsolute.y - startAbsolute.y;
  const side = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const constrainedEnd = screenAbsoluteToCoord(
    startAbsolute.x + signedDirection(deltaX, 1) * side,
    startAbsolute.y + signedDirection(deltaY, 1) * side,
  );

  return selectionFromCoords(start, constrainedEnd);
}

function signedDirection(value: number, fallback: 1) {
  if (value < 0) return -1;
  if (value > 0) return 1;
  return fallback;
}

function shapeCoordsFromSelection(selection: CellSelection, shapeMode: MaterialToolSettings["shapeMode"]) {
  const origin = absoluteCoord(selection.origin);
  const width = Math.max(1, selection.width);
  const height = Math.max(1, selection.height);
  const centerX = origin.x + (width - 1) / 2;
  const centerY = origin.y + (height - 1) / 2;
  const radiusX = Math.max(0.5, width / 2);
  const radiusY = Math.max(0.5, height / 2);
  const coords: WorldCoord[] = [];

  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const x = origin.x + dx;
      const y = origin.y + dy;

      if (shapeMode === "circle") {
        const normalizedX = (x - centerX) / radiusX;
        const normalizedY = (y - centerY) / radiusY;
        if (normalizedX * normalizedX + normalizedY * normalizedY > 1) continue;
      }

      if (shapeMode === "diamond") {
        const normalizedX = Math.abs(x - centerX) / radiusX;
        const normalizedY = Math.abs(y - centerY) / radiusY;
        if (normalizedX + normalizedY > 1) continue;
      }

      coords.push(screenAbsoluteToCoord(x, y));
    }
  }

  return coords;
}

function lineCoordsFromEndpoints(
  start: WorldCoord,
  end: WorldCoord,
  options: { readonly thickness: number; readonly startArrow: boolean; readonly endArrow: boolean },
): WorldCoord[] {
  const startAbsolute = absoluteCoord(start);
  const endAbsolute = absoluteCoord(end);
  const lineCoords = rasterLine(startAbsolute.x, startAbsolute.y, endAbsolute.x, endAbsolute.y);
  const cells = new Map<string, WorldCoord>();
  addThickCoords(cells, lineCoords, options.thickness);

  if (options.endArrow) {
    addArrowHead(cells, startAbsolute, endAbsolute, options.thickness);
  }
  if (options.startArrow) {
    addArrowHead(cells, endAbsolute, startAbsolute, options.thickness);
  }

  return Array.from(cells.values()).sort((a, b) => formatCoord(a).localeCompare(formatCoord(b)));
}

function addArrowHead(
  cells: Map<string, WorldCoord>,
  from: { readonly x: number; readonly y: number },
  tip: { readonly x: number; readonly y: number },
  thickness: number,
) {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  if (dx === 0 && dy === 0) return;

  const angle = Math.atan2(dy, dx);
  const length = Math.max(4, Math.min(24, Math.round(thickness * 3 + 4)));
  for (const wing of [angle + (3 * Math.PI) / 4, angle - (3 * Math.PI) / 4]) {
    const endX = Math.round(tip.x + Math.cos(wing) * length);
    const endY = Math.round(tip.y + Math.sin(wing) * length);
    addThickCoords(cells, rasterLine(tip.x, tip.y, endX, endY), thickness);
  }
}

function addThickCoords(
  cells: Map<string, WorldCoord>,
  coords: readonly { readonly x: number; readonly y: number }[],
  thickness: number,
) {
  const radius = Math.max(0, (Math.round(thickness) - 1) / 2);
  const bound = Math.ceil(radius);
  for (const coord of coords) {
    for (let y = -bound; y <= bound; y += 1) {
      for (let x = -bound; x <= bound; x += 1) {
        if (x * x + y * y > radius * radius + 0.35) continue;
        const worldCoord = screenAbsoluteToCoord(coord.x + x, coord.y + y);
        cells.set(formatCoord(worldCoord), worldCoord);
      }
    }
  }
}

function rasterLine(startX: number, startY: number, endX: number, endY: number) {
  const coords: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  const sx = startX < endX ? 1 : -1;
  const sy = startY < endY ? 1 : -1;
  let error = dx - dy;
  let x = startX;
  let y = startY;

  while (true) {
    coords.push({ x, y });
    if (x === endX && y === endY) break;
    const error2 = 2 * error;
    if (error2 > -dy) {
      error -= dy;
      x += sx;
    }
    if (error2 < dx) {
      error += dx;
      y += sy;
    }
  }

  return coords;
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

function collectStrokeCoords(coords: readonly WorldCoord[], seen = new Set<string>()) {
  const nextCoords: WorldCoord[] = [];
  for (const coord of coords) {
    const key = formatCoord(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    nextCoords.push(coord);
  }
  return nextCoords;
}

function formatCoord(coord: WorldCoord) {
  const absolute = absoluteCoord(coord);
  return `${absolute.x}:${absolute.y}`;
}

function isStrokeTool(mode: MaterialToolSettings["mode"]) {
  return mode === "paint" || mode === "brush" || mode === "eraser";
}

function boardChunks(): ChunkCoord[] {
  const chunksPerAxis = Math.ceil(DEMO_CANVAS_CELLS / CHUNK_SIZE);
  const chunks: ChunkCoord[] = [];
  for (let y = 0; y < chunksPerAxis; y += 1) {
    for (let x = 0; x < chunksPerAxis; x += 1) {
      chunks.push({ x, y });
    }
  }
  return chunks;
}

function groupCellsByChunk(cells: readonly DemoCell[]) {
  const grouped = new Map<string, DemoCell[]>();
  for (const cell of cells) {
    const key = chunkKey(cell.coord.chunk);
    const chunkCells = grouped.get(key);
    if (chunkCells) {
      chunkCells.push(cell);
    } else {
      grouped.set(key, [cell]);
    }
  }
  return grouped;
}

function paintChunkCanvas(canvas: HTMLCanvasElement, record: ChunkTextureRecord) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context || typeof ImageData === "undefined") return;

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(record.pixels as ImageDataArray, CHUNK_SIZE, CHUNK_SIZE), 0, 0);
}

type BoardRendererMode = "chunk-canvas" | "pixi-webgpu" | "pixi-webgl" | "pixi-canvas";

interface BoardGpuSurface {
  readonly mode: BoardRendererMode;
  destroy(): void;
  setCamera(camera: typeof DEFAULT_CAMERA): void;
  syncChunks(records: readonly ChunkTextureRecord[], canvases: ReadonlyMap<string, HTMLCanvasElement>): void;
}

async function createBoardGpuSurface(host: HTMLDivElement): Promise<BoardGpuSurface> {
  const { Application, Sprite, Texture } = await import("pixi.js");
  const app = new Application();
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);

  await app.init({
    antialias: false,
    autoDensity: true,
    backgroundAlpha: 0,
    height,
    powerPreference: "high-performance",
    preference: "webgpu",
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    width,
  });

  const canvas = app.canvas;
  canvas.className = "board-canvas__gpu-surface";
  canvas.dataset.agentId = "board-gpu-surface";
  host.replaceChildren(canvas);

  const mode = detectPixiRendererMode(app.renderer);
  canvas.dataset.renderer = mode;
  canvas.dataset.webgpu = mode === "pixi-webgpu" ? "true" : "false";

  const spriteRecords = new Map<
    string,
    {
      readonly sprite: InstanceType<typeof Sprite>;
      revision: number;
    }
  >();

  const render = () => {
    app.render();
  };

  const resizeObserver = new ResizeObserver(() => {
    app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), Math.min(window.devicePixelRatio || 1, 2));
    render();
  });
  resizeObserver.observe(host);

  return {
    mode,
    destroy() {
      resizeObserver.disconnect();
      spriteRecords.clear();
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true, context: true });
      host.replaceChildren();
    },
    setCamera(camera) {
      app.stage.position.set(camera.x, camera.y);
      app.stage.scale.set(camera.zoom, camera.zoom);
      render();
    },
    syncChunks(records, canvases) {
      for (const record of records) {
        const key = chunkKey(record.chunk);
        const sourceCanvas = canvases.get(key);
        if (!sourceCanvas) continue;

        let spriteRecord = spriteRecords.get(key);
        if (!spriteRecord) {
          const texture = Texture.from(sourceCanvas, true);
          texture.source.magFilter = "nearest";
          texture.source.minFilter = "nearest";
          texture.source.mipmapFilter = "nearest";
          const sprite = new Sprite({ texture, roundPixels: true });
          sprite.x = record.chunk.x * CHUNK_SIZE;
          sprite.y = record.chunk.y * CHUNK_SIZE;
          sprite.width = CHUNK_SIZE;
          sprite.height = CHUNK_SIZE;
          spriteRecord = { revision: -1, sprite };
          spriteRecords.set(key, spriteRecord);
          app.stage.addChild(sprite);
        }

        if (spriteRecord.revision !== record.dirtyRevision) {
          spriteRecord.sprite.texture.source.update();
          spriteRecord.revision = record.dirtyRevision;
        }
      }

      render();
    },
  };
}

function detectPixiRendererMode(renderer: unknown): BoardRendererMode {
  if (renderer && typeof renderer === "object" && "gpu" in renderer) return "pixi-webgpu";
  if (renderer && typeof renderer === "object" && "gl" in renderer) return "pixi-webgl";
  return "pixi-canvas";
}

function previewStroke(
  strokeCoords: readonly WorldCoord[],
  toolSettings: MaterialToolSettings,
  paintSwatches: readonly PaintSwatch[],
  cache: ChunkTextureCache,
  canvases: ReadonlyMap<string, HTMLCanvasElement>,
  gpuSurface: BoardGpuSurface | null,
) {
  if (strokeCoords.length === 0) return;

  const dirtyChunks = new Set<string>();
  for (const coord of strokeCoords) {
    for (const target of previewTargets(coord, toolSettings)) {
      if (!isWithinDemoCanvas(target)) continue;
      const record = cache.get(target.chunk);
      if (!record) continue;
      paintPreviewCell(record, target, toolSettings, paintSwatches);
      dirtyChunks.add(chunkKey(target.chunk));
    }
  }

  for (const key of dirtyChunks) {
    const canvas = canvases.get(key);
    const record = cache.entries().find((entry) => chunkKey(entry.chunk) === key);
    if (canvas && record) paintChunkCanvas(canvas, record);
  }

  gpuSurface?.syncChunks(cache.entries(), canvases);
}

function previewTargets(coord: WorldCoord, toolSettings: MaterialToolSettings) {
  if (toolSettings.mode === "paint") return [coord];

  const origin = absoluteCoord(coord);
  const radius = Math.max(1, Math.min(10, Math.round(toolSettings.brushSize)));
  if (toolSettings.mode === "eraser" && radius === 1) return [coord];

  const targets: WorldCoord[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      targets.push(screenAbsoluteToCoord(origin.x + dx, origin.y + dy));
    }
  }
  return targets;
}

function paintPreviewCell(
  record: ChunkTextureRecord,
  coord: WorldCoord,
  toolSettings: MaterialToolSettings,
  paintSwatches: readonly PaintSwatch[],
) {
  const offset = (coord.cell.y * CHUNK_SIZE + coord.cell.x) * 4;
  const material = toolSettings.mode === "eraser" ? MATERIAL.Empty : toolSettings.material;
  const color = materialColor(material, material === MATERIAL.Paint ? toolSettings.paintVariant : 0, paintSwatches);
  record.pixels[offset] = color[0];
  record.pixels[offset + 1] = color[1];
  record.pixels[offset + 2] = color[2];
  record.pixels[offset + 3] = color[3];
  record.dirtyRevision += 1;
}

function isWithinDemoCanvas(coord: WorldCoord) {
  const absolute = absoluteCoord(coord);
  return absolute.x >= 0 && absolute.y >= 0 && absolute.x < DEMO_CANVAS_CELLS && absolute.y < DEMO_CANVAS_CELLS;
}

function selectedCellDescription(selectedCoord: WorldCoord, cells: readonly DemoCell[]) {
  const selectedKey = formatCoord(selectedCoord);
  const selectedCell = cells.find((cell) => formatCoord(cell.coord) === selectedKey);
  const material = selectedCell ? MATERIAL_NAME[selectedCell.material] : MATERIAL_NAME[0];
  const state = selectedCell?.state ?? 0;
  return `Selected cell ${selectedKey} ${material} state ${state}`;
}
