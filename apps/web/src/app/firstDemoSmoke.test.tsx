import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("first demo viewer smoke", () => {
  it("renders board, inspector, local history, and replay controls", () => {
    render(<App convexUrl={null} />);

    expect(screen.getByTestId("board-canvas")).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /Agartha cellular world board/ })).toHaveAttribute(
      "data-agent-id",
      "board-canvas",
    );
    expect(document.querySelector('[data-agent-id="agartha-agent-state"]')).toHaveTextContent('"app":"agartha-first-demo"');
    expect(document.querySelector('[data-agent-id="latest-event-status"]')).toHaveTextContent("Seeded origin materials");
    expect(screen.getByRole("heading", { name: "Terrain" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Selected cell" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Agent Command" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stamps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brush & paint" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveClass("event-history-panel__list");
    expect(screen.queryByRole("heading", { name: "Replay" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo edit" })).toBeDisabled();
    expect(
      screen.getAllByRole("radio", { name: "Paint 1" }).some((element) => element.getAttribute("aria-checked") === "true"),
    ).toBe(true);
    expect(screen.getByRole("radio", { name: "Pencil" })).toHaveAttribute("title", "Pencil (1)");
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByRole("radio", { name: "Brush" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getAllByRole("radio", { name: "Paint 2" })[0]);
    expect(screen.getAllByRole("radio", { name: "Paint 2" }).some((element) => element.getAttribute("aria-checked") === "true")).toBe(true);
    expect(screen.getByLabelText("Paint color")).toHaveAttribute("type", "color");
    expect(screen.getByLabelText("Paint hex")).toBeInTheDocument();
    expect(screen.getByLabelText("Active material")).toHaveTextContent("Paint 2");
    fireEvent.click(screen.getByRole("button", { name: "New material" }));
    expect(screen.getByRole("dialog", { name: "New material" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New material name"), { target: { value: "Moss" } });
    fireEvent.change(screen.getByLabelText("New material color"), { target: { value: "#88cc55" } });
    fireEvent.change(screen.getByLabelText("New material flow"), { target: { value: "57" } });
    fireEvent.click(screen.getByRole("button", { name: "Save material" }));
    expect(screen.getByRole("radio", { name: "Moss" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Active material")).toHaveTextContent("Moss");
    expect(screen.getByLabelText("Active material properties")).toHaveTextContent("Flow57");
    expect(screen.getAllByText("Saved material Moss", { exact: false }).length).toBeGreaterThan(0);
    const board = screen.getByTestId("board-canvas");
    const boardCells = screen.getByTestId("board-cells");
    const chunkCanvases = boardCells.querySelectorAll('canvas[data-agent-id^="chunk-"]');
    expect(boardCells).toHaveAttribute("data-agent-region", "board-cells");
    expect(boardCells).toHaveAttribute("data-renderer", "chunk-canvas");
    expect(chunkCanvases.length).toBe(4);
    expect(boardCells.querySelectorAll('[role="gridcell"][data-agent-id^="cell-"]').length).toBe(0);
    expect(screen.getByTestId("board-semantic")).toHaveTextContent("Selected cell");
    fireEvent.click(screen.getByRole("radio", { name: "Cursor" }));
    expect(screen.getByRole("radio", { name: "Cursor" })).toHaveAttribute("aria-checked", "true");
    const cursorChunkCount = chunkCanvases.length;
    applyBoardPointer(board);
    expect(screen.getByTestId("board-selection")).toBeInTheDocument();
    expect(screen.getByTestId("board-cells").querySelectorAll('canvas[data-agent-id^="chunk-"]').length).toEqual(cursorChunkCount);
    expect(screen.getByRole("radio", { name: "Marquee" })).toHaveAttribute("title", "Marquee (8)");

    expect(screen.queryByLabelText("Agent command input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Agent" }));
    fireEvent.change(screen.getByLabelText("Agent CLI input"), { target: { value: "flower 70 52" } });
    fireEvent.click(screen.getByRole("button", { name: "Run agent CLI command" }));
    expect(screen.getAllByText("Agent command: built flower", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "masterpiece phoenix 70 52" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Agent CLI input"), { target: { value: "masterpiece phoenix 94 84 0.75" } });
    fireEvent.click(screen.getByRole("button", { name: "Run agent CLI command" }));
    expect(screen.getAllByText("Agent command: rendered phoenix masterpiece", { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset demo cells" }));
    expect(screen.getByRole("heading", { name: "Replay" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Agent CLI input"), {
      target: { value: "object save house 66 48 18 16" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run agent CLI command" }));
    expect(screen.getByRole("radio", { name: "house" })).toHaveAttribute("aria-checked", "true");

    fireEvent.change(screen.getByLabelText("Agent CLI input"), {
      target: { value: "object stamp house 92 52" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run agent CLI command" }));
    expect(screen.getAllByText("Agent command: stamped object house", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Stamp repeat")).toHaveValue(1);

    fireEvent.change(screen.getByLabelText("Agent CLI input"), {
      target: { value: "object stamp house 112 52 3 18 0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run agent CLI command" }));
    expect(screen.getAllByText("Agent command: stamped 3 house objects", { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "Human" }));
    expect(screen.getByRole("radio", { name: "Pencil" })).toBeInTheDocument();
    const cellsBeforeClearAll = screen.getByTestId("board-cells").getAttribute("data-active-cells");
    expect(Number(cellsBeforeClearAll)).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Clear all cells" }));
    expect(screen.getByTestId("board-cells")).toHaveAttribute("data-active-cells", "0");
    expect(document.querySelector('[data-agent-id="latest-event-status"]')).toHaveTextContent("Cleared all canvas cells");
    expect(screen.getByRole("button", { name: "Undo edit" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
    expect(Number(screen.getByTestId("board-cells").getAttribute("data-active-cells"))).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "Cursor" }));
    fireEvent.keyDown(board, { key: "ArrowRight" });
    expect(screen.getByTestId("board-selection")).toBeInTheDocument();
    const initialTransform = boardCells.style.transform;
    fireEvent.wheel(board, { deltaX: 24, deltaY: 18 });
    expect(boardCells.style.transform).not.toEqual(initialTransform);
    const initialChunkSize = screen.getByTestId("board-cells").querySelector<HTMLCanvasElement>("canvas")?.style.width;
    fireEvent.wheel(board, { ctrlKey: true, deltaY: -40 });
    expect(screen.getByTestId("board-cells").querySelector<HTMLCanvasElement>("canvas")?.style.width).not.toEqual(initialChunkSize);
    fireEvent.click(screen.getByRole("radio", { name: "Pencil" }));
    const transformBeforePaintDrag = boardCells.style.transform;
    fireEvent.pointerDown(board, { clientX: 420, clientY: 420, pointerId: 1 });
    fireEvent.pointerMove(board, { clientX: 452, clientY: 420, pointerId: 1 });
    fireEvent.pointerUp(board, { clientX: 452, clientY: 420, pointerId: 1 });
    expect(boardCells.style.transform).toEqual(transformBeforePaintDrag);
    expect(document.querySelector('[data-agent-id="latest-event-status"]')).toHaveTextContent("Paint stroke:");

    expect(screen.getByRole("radio", { name: "Stream Garden" })).toHaveAttribute("aria-checked", "true");
    const initialCells = screen.getByTestId("board-cells").getAttribute("data-active-cells");
    fireEvent.click(screen.getByRole("radio", { name: "Ember Break" }));
    expect(screen.getByRole("radio", { name: "Ember Break" })).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector('[data-agent-id="latest-event-status"]')).toHaveTextContent("Loaded Ember Break terrain seed 9021");
    expect(screen.getByTestId("board-cells").getAttribute("data-active-cells")).not.toEqual(initialCells);

    fireEvent.click(screen.getByRole("radio", { name: "Brush" }));
    fireEvent.click(screen.getByRole("radio", { name: "Plant material" }));
    fireEvent.change(screen.getByLabelText("Brush size"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Brush hardness"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Brush opacity"), { target: { value: "90" } });
    expect(screen.getByRole("radio", { name: "Brush" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Plant material" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Active material")).toHaveTextContent("Plant");

    applyBoardPointer(board, 456, 420);
    expect(screen.getAllByText("Brush stroke:", { exact: false }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "Shape" }));
    expect(screen.getByRole("radio", { name: "Shape" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Rectangle" }));
    expect(screen.getByRole("radio", { name: "Rectangle" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Circle" }));
    expect(screen.getByRole("radio", { name: "Circle" })).toHaveAttribute("aria-checked", "true");
    applyBoardPointer(board, 472, 420);
    expect(screen.getAllByText("Shape tool:", { exact: false }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "Eraser" }));
    applyBoardPointer(board, 472, 420);
    expect(screen.getAllByText("Eraser stroke:", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Undo edit" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
    expect(screen.getAllByText("Undo edit:", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Redo edit" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Redo edit" }));
    expect(screen.getAllByText("Redo edit:", { exact: false }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Step time" }));
    expect(screen.getByText("Tick 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText("Replay step 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText("Live view")).toBeInTheDocument();
  }, 60000);
});

function applyBoardPointer(board: HTMLElement, clientX = 420, clientY = 420) {
  fireEvent.pointerDown(board, { clientX, clientY, pointerId: 1 });
  fireEvent.pointerUp(board, { clientX, clientY, pointerId: 1 });
}
