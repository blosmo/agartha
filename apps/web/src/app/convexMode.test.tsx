import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MATERIAL } from "@agartha/protocol/world";

import { App } from "./App";
import { demoCell, type DemoCell } from "./demoWorld";

type BrowserPaintCell = Omit<DemoCell, "id">;
type BrowserPaintArgs = { readonly cells: readonly BrowserPaintCell[] };

describe("Convex-backed browser edits", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("routes time controls through Convex global mutations", async () => {
    const convexStepWorld = vi.fn(async () => ({
      accepted: true,
      affectedCells: [],
      affectedChunks: ["1:1"],
      cost: 0,
      energyRemaining: 99,
      eventId: "time-step",
      summary: "time_step accepted: tick 1",
    }));
    const convexResetWorldTime = vi.fn(async () => ({
      accepted: true,
      affectedCells: [],
      affectedChunks: [],
      cost: 0,
      energyRemaining: 99,
      eventId: "time-reset",
      summary: "time_reset accepted",
    }));
    render(
      <App
        convexResetWorldTime={convexResetWorldTime as never}
        convexSnapshot={{
          cells: [],
          chunkVersions: { "1:1": 0 },
          events: [],
          tick: 0,
        }}
        convexStepWorld={convexStepWorld as never}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Step time" }));
    await waitFor(() => expect(convexStepWorld).toHaveBeenCalledTimes(1));
    expect(convexStepWorld).toHaveBeenCalledWith({ agentId: "agent-browser", token: "token-browser", worldId: "origin" });

    fireEvent.click(screen.getByRole("button", { name: "Reset time" }));
    await waitFor(() => expect(convexResetWorldTime).toHaveBeenCalledTimes(1));
    expect(convexResetWorldTime).toHaveBeenCalledWith({ agentId: "agent-browser", token: "token-browser", worldId: "origin" });
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
          tick: 0,
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

  it("submits erased Convex cells as empty tombstones and keeps them erased optimistically", async () => {
    const convexPaintBrowserCells = vi.fn(async ({ cells }: BrowserPaintArgs) => ({
      accepted: true,
      affectedCells: cells.map((cell) => cell.coord),
      affectedChunks: ["1:1"],
      cost: 0,
      energyRemaining: 99,
      eventId: "browser-erase",
      summary: "browser_paint_cells accepted",
    }));
    const filledCell = demoCell(177, 140, MATERIAL.Plant);
    const staleSnapshot = {
      cells: [filledCell],
      chunkVersions: { "1:1": 0 },
      events: [],
      tick: 0,
    };
    const { rerender } = render(
      <App
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSnapshot={staleSnapshot}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Eraser" }));
    const board = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(board, { clientX: 800, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(board, { clientX: 800, clientY: 500, pointerId: 1 });

    await waitFor(() => expect(convexPaintBrowserCells).toHaveBeenCalledTimes(1));
    const eraseCall = (convexPaintBrowserCells.mock.calls as unknown as BrowserPaintArgs[][])[0]?.[0];
    expect(eraseCall?.cells).toMatchObject([
      {
        coord: { chunk: { x: 1, y: 1 }, cell: { x: 49, y: 12 } },
        material: MATERIAL.Empty,
        state: 0,
        variant: 0,
      },
    ]);
    await waitFor(() => expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "0"));

    rerender(
      <App
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSnapshot={staleSnapshot}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );
    expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "0");
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
      tick: 0,
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
          tick: 1,
        }}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );
    expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "1");
  });

  it("saves captured objects to Convex and stamps them through the browser-paint mutation", async () => {
    const filledCell = demoCell(177, 140, MATERIAL.Plant);
    const convexSaveObjectTemplate = vi.fn(async ({ template }: { template: { id: string; label: string } }) => ({
      accepted: true,
      objectId: template.id,
      summary: `object_template saved: ${template.label}`,
    }));
    const convexPaintBrowserCells = vi.fn(async ({ cells }: BrowserPaintArgs) => ({
      accepted: true,
      affectedCells: cells.map((cell) => cell.coord),
      affectedChunks: ["1:1"],
      cost: 0,
      energyRemaining: 99,
      eventId: "browser-stamp",
      summary: "browser_paint_cells accepted",
    }));

    render(
      <App
        convexObjectTemplates={[]}
        convexPaintBrowserCells={convexPaintBrowserCells as never}
        convexSaveObjectTemplate={convexSaveObjectTemplate as never}
        convexSnapshot={{
          cells: [filledCell],
          chunkVersions: { "1:1": 0 },
          events: [],
          tick: 0,
        }}
        convexUrl="https://example.convex.cloud"
        convexWriteConfig={{ agentId: "agent-browser", token: "token-browser", worldId: "origin" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture object" }));

    await waitFor(() => expect(convexSaveObjectTemplate).toHaveBeenCalledTimes(1));
    expect(convexSaveObjectTemplate).toHaveBeenCalledWith({
      agentId: "agent-browser",
      template: expect.objectContaining({
        id: "house",
        label: "house",
        samples: [expect.objectContaining({ material: MATERIAL.Plant })],
      }),
      token: "token-browser",
      worldId: "origin",
    });

    const board = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(board, { clientX: 760, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(board, { clientX: 760, clientY: 500, pointerId: 1 });

    await waitFor(() => expect(convexPaintBrowserCells).toHaveBeenCalledTimes(1));
    expect(convexPaintBrowserCells).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-browser",
        cells: [expect.objectContaining({ material: MATERIAL.Plant })],
        token: "token-browser",
        worldId: "origin",
      }),
    );
    expect(document.querySelector('[data-agent-id="canvas-source-status"]')).toHaveTextContent("Stamp accepted");
  });
});
