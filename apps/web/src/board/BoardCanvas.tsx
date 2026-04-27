import { useEffect, useRef, useState } from "react";
import { MATERIAL, toWorldCoord, type MaterialId } from "@agartha/protocol/world";

import { ChunkTextureCache } from "./chunkTextureCache";
import { materialColor } from "./materialPalette";

const DEMO_CELLS = [
  sample(64, 64, MATERIAL.Water),
  sample(65, 64, MATERIAL.Plant),
  sample(66, 64, MATERIAL.Paint),
  sample(67, 64, MATERIAL.Stone),
  sample(70, 64, MATERIAL.Fire),
];

const demoCache = new ChunkTextureCache();
demoCache.applySnapshot({
  worldId: "origin",
  chunk: { x: 0, y: 0 },
  version: 1,
  cells: DEMO_CELLS,
});

export function BoardCanvas() {
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

      drawDemoPixels(app.canvas, 8);
    }

    void mountPixi();

    return () => {
      cancelled = true;
      pixiApp?.destroy(true);
    };
  }, []);

  return (
    <div
      className="board-canvas"
      ref={hostRef}
      data-testid="board-canvas"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
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
      onPointerUp={() => {
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
        aria-hidden="true"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px)` }}
      >
        {DEMO_CELLS.map((cell) => (
          <span
            key={`${cell.coord.cell.x}:${cell.coord.cell.y}`}
            style={{
              backgroundColor: rgba(materialColor(cell.material)),
              height: camera.zoom,
              left: cell.coord.cell.x * camera.zoom,
              top: cell.coord.cell.y * camera.zoom,
              width: camera.zoom,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function sample(x: number, y: number, material: MaterialId) {
  return {
    coord: toWorldCoord(x, y),
    material,
    state: 0,
    variant: 0,
    flags: 0,
  };
}

function rgba(color: [number, number, number, number]) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

function drawDemoPixels(canvas: HTMLCanvasElement, scale: number) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const cells = [
    sample(32, 32, MATERIAL.Water),
    sample(33, 32, MATERIAL.Plant),
    sample(34, 32, MATERIAL.Paint),
    sample(35, 32, MATERIAL.Stone),
    sample(36, 32, MATERIAL.Fire),
  ];

  for (const cell of cells) {
    const color = materialColor(cell.material);
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
    context.fillRect(cell.coord.cell.x * scale, cell.coord.cell.y * scale, scale, scale);
  }
}
