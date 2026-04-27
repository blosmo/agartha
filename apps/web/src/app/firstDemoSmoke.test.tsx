import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("first demo viewer smoke", () => {
  it("renders board, inspector, local history, and replay controls", () => {
    render(<App />);

    expect(screen.getByTestId("board-canvas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cell Inspector" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Replay" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText("Replay step 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.getByText("Live view")).toBeInTheDocument();
  });
});
