import { useEffect, useRef, useState } from "react";
import { type MaterialId, type WorldCoord } from "@agartha/protocol/world";

import { ChunkTextureCache } from "./chunkTextureCache";
import { materialColor } from "./materialPalette";
import { absoluteCoord, type DemoCell } from "../app/demoWorld";

const demoCache = new ChunkTextureCache();

export interface BoardCanvasProps {
  readonly cells: readonly DemoCell[];
  readonly selectedMaterial: MaterialId;
  readonly onPaintCell: (coord: WorldCoord, material: MaterialId) => void;
  readonly onSelectCell: (coord: WorldCoord) => void;
}

export function BoardCanvas({ cells, selectedMaterial, onPaintCell, onSelectCell }: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const [camera, setCamera] = useState({ x: -360, y: -320, zoom: 8 });

  useEffect(() => {
    let cancelled = false;
    let pixiApp: { destroy: (removeView?: boolean) => void; canvas?: HTMLCanvasElement } | undefined;

    async function mountPixi() {
      if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
        return;
      }

      const host = hostRef.current;
      if (!host) return;
      const pixi = await import("pixi.js");
      if (cancelled) return;

      const app = new pixi.Application();
      await app.init({
        width: host.clientWidth || 640,
        height: host.clientHeight || 480,
        background: "#0c0e12",
        antialias: false,
      });
      pixiApp = app;
      host.appendChild(app.canvas);

      drawDemoPixels(app.canvas, cells, 8);
    }

    void mountPixi();

    return () => {
      cancelled = true;
      pixiApp?.destroy(true);
    };
  }, [cells]);

  useEffect(() => {
    demoCache.applySnapshot({
      worldId: "origin",
      chunk: { x: 0, y: 0 },
      version: 1,
      cells,
    });
  }, [cells]);

  return (
    <div
      className="board-canvas"
      ref={hostRef}
      data-testid="board-canvas"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).dataset.cellId) {
          return;
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragStart.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX: camera.x,
          panY: camera.y,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragStart.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setCamera((current) => ({
          ...current,
          x: drag.panX + event.clientX - drag.x,
          y: drag.panY + event.clientY - drag.y,
        }));
      }}
      onPointerUp={(event) => {
        const drag = dragStart.current;
        if (drag && hostRef.current) {
          const moved = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
          if (moved < 4) {
            const rect = hostRef.current.getBoundingClientRect();
            const x = Math.floor((event.clientX - rect.left - camera.x) / camera.zoom);
            const y = Math.floor((event.clientY - rect.top - camera.y) / camera.zoom);
            const coord = {
              chunk: {
                x: Math.floor(x / 128),
                y: Math.floor(y / 128),
              },
              cell: {
                x: ((x % 128) + 128) % 128,
                y: ((y % 128) + 128) % 128,
              },
            };
            onSelectCell(coord);
            onPaintCell(coord, selectedMaterial);
          }
        }
        dragStart.current = null;
      }}
      onWheel={(event) => {
        event.preventDefault();
        setCamera((current) => ({
          ...current,
          zoom: Math.max(4, Math.min(18, current.zoom + (event.deltaY < 0 ? 1 : -1))),
        }));
      }}
    >
      <div
        className="board-canvas__fallback"
        data-testid="board-cells"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px)` }}
      >
        {cells.map((cell) => {
          const absolute = absoluteCoord(cell.coord);
          return (
          <span
            data-cell-id={cell.id}
            key={cell.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelectCell(cell.coord);
              onPaintCell(cell.coord, selectedMaterial);
            }}
            style={{
              backgroundColor: rgba(materialColor(cell.material)),
              height: camera.zoom,
              left: absolute.x * camera.zoom,
              top: absolute.y * camera.zoom,
              width: camera.zoom,
            }}
          />
          );
        })}
      </div>
    </div>
  );
}

function rgba(color: [number, number, number, number]) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

function drawDemoPixels(canvas: HTMLCanvasElement, cells: readonly DemoCell[], scale: number) {
  const context = canvas.getContext("2d");
  if (!context) return;

  for (const cell of cells) {
    const color = materialColor(cell.material);
    const absolute = absoluteCoord(cell.coord);
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
    context.fillRect(absolute.x * scale, absolute.y * scale, scale, scale);
  }
}
