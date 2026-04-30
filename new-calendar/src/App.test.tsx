import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./visualization/CalendarScene", () => ({
  CalendarScene: ({ onSelectIndex }: { onSelectIndex: (index: number) => void }) => (
    <button type="button" data-testid="mock-scene" onClick={() => onSelectIndex(36)}>
      Mock scene
    </button>
  ),
}));

describe("App", () => {
  it("renders the live timepiece controls and source-framed overlay", () => {
    render(<App />);

    expect(screen.getByLabelText("Selected calendar position")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Krystal Spiral overlay")).toBeInTheDocument();
  });

  it("updates the readout from scene selection and overlay controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("mock-scene"));
    expect(screen.getByText("Winter Reflection")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByText("Spiral comparison")).toBeInTheDocument();
  });
});
