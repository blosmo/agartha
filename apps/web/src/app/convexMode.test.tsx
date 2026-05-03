import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { demoCell, type DemoCell } from "./demoWorld";

type BrowserPaintCell = Omit<DemoCell, "id">;
type BrowserPaintArgs = { readonly cells: readonly BrowserPaintCell[] };

describe("Convex-backed browser edits", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("submits exact browser stroke cells through the Convex browser-paint mutation", async () => {
    const convexAct = vi.fn(async ({ envelope }: { envelope: any }) => ({
      accepted: true,
      affectedCells: envelope.payload.cells ?? [envelope.payload.target],
      affectedChunks: ["1:1"],
      cost: 1,
      energyRemaining: 99,
      eventId: `event-${convexAct.mock.calls.length}`,
      summary: `${envelope.actionType} accepted`,
    }));
    const convexPaintBrowserCells = vi.fn(async ({ cells }: BrowserPaintArgs) => ({
      accepted: true,
      affectedCells: cells.map((cell) => cell.coord),
      affectedChunks: ["1:1"],
      cost: 0,
      energyRemaining: 99,
      eventId: "browser-paint",
      summary: "browser_paint_cells accepted",
    }));

    render(
      <App
        convexAct={convexAct as never}
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSnapshot={{
          cells: [],
          chunkVersions: { "1:1": 0 },
          events: [],
        }}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    fireEvent.click(screen.getByRole("radio", { name: "Plant material" }));

    const board = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(board, { clientX: 420, clientY: 420, pointerId: 1 });
    fireEvent.pointerMove(board, { clientX: 436, clientY: 420, pointerId: 1 });
    fireEvent.pointerUp(board, { clientX: 436, clientY: 420, pointerId: 1 });

    await waitFor(() => expect(convexPaintBrowserCells).toHaveBeenCalledTimes(1));
    expect(convexAct).not.toHaveBeenCalled();
    const browserPaintCall = (convexPaintBrowserCells.mock.calls as unknown as BrowserPaintArgs[][])[0]?.[0];
    expect(browserPaintCall?.cells.every((cell) => cell.material === 5)).toBe(true);
    expect(Number(screen.getByTestId("board-cells").getAttribute("data-active-cells"))).toBeGreaterThan(0);
    expect(document.querySelector('[data-agent-id="canvas-source-status"]')).toHaveTextContent(
      "Brush stroke accepted",
    );
  });

  it("keeps the exact optimistic cell across stale Convex snapshots until the accepted cell arrives", async () => {
    let resolvePaint: ((value: unknown) => void) | undefined;
    const convexPaintBrowserCells = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePaint = resolve;
        }),
    );
    const emptySnapshot = {
      cells: [],
      chunkVersions: { "1:1": 0 },
      events: [],
    };
    const { rerender } = render(
      <App
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSnapshot={emptySnapshot}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );

    const board = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(board, { clientX: 800, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(board, { clientX: 800, clientY: 500, pointerId: 1 });

    await waitFor(() => expect(convexPaintBrowserCells).toHaveBeenCalledTimes(1));
    const exactBrowserPaintCall = (convexPaintBrowserCells.mock.calls as unknown as BrowserPaintArgs[][])[0]?.[0];
    expect(exactBrowserPaintCall?.cells).toMatchObject([
      {
        coord: { chunk: { x: 1, y: 1 }, cell: { x: 49, y: 12 } },
        material: 1,
        state: 0,
        variant: 0,
      },
    ]);
    expect(exactBrowserPaintCall?.cells[0]).not.toHaveProperty("id");
    expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "1");

    rerender(
      <App
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSnapshot={emptySnapshot}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );
    expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "1");

    resolvePaint?.({
      accepted: true,
      affectedCells: [{ chunk: { x: 1, y: 1 }, cell: { x: 49, y: 12 } }],
      affectedChunks: ["1:1"],
      cost: 0,
      energyRemaining: 99,
      eventId: "browser-paint",
      summary: "browser_paint_cells accepted",
    });
    await waitFor(() => {
      expect(document.querySelector('[data-agent-id="canvas-source-status"]')).toHaveTextContent(
        "Paint stroke accepted: 1 cells",
      );
    });

    rerender(
      <App
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSnapshot={{
          cells: [demoCell(177, 140, 1)],
          chunkVersions: { "1:1": 1 },
          events: [{ id: "browser-paint", tick: 1, summary: "browser_paint_cells accepted" }],
        }}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );
    expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "1");
  });
});
