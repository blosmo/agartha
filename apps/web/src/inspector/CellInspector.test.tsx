import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MATERIAL } from "@agartha/protocol/world";
import { toWorldCoord } from "@agartha/protocol/world";

import { CellInspector } from "./CellInspector";

describe("CellInspector", () => {
  it("shows selected cell material, state, coordinates, and version", () => {
    render(<CellInspector coord={toWorldCoord(65, 65)} material={MATERIAL.Fire} state={3} />);

    expect(screen.getByRole("heading", { name: "Selected cell" })).toBeInTheDocument();
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("0:0")).toBeInTheDocument();
    expect(screen.getByText("65:65")).toBeInTheDocument();
  });
});
