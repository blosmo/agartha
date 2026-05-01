import { fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("./visualization/SeasonTreeScene", () => ({
  SeasonTreeScene: () => <div data-testid="mock-tree-scene">Mock tree</div>,
}));

describe("App", () => {
  it("renders the live timepiece controls and source-framed overlay", () => {
    render(<App />);

    expect(screen.getByLabelText("Orbit panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Tree panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Sunlight panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Progress panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forward 9 days" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Speed")).toBeInTheDocument();
    expect(screen.getByLabelText("Speed")).toHaveValue("5");
    expect(screen.queryByRole("group", { name: "Speed presets" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Compare" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overlay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Date panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Date", level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText("Months panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Months", level: 2 })).toBeInTheDocument();
    expect(screen.queryByText("Selected position")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily sunlight")).not.toBeInTheDocument();
    expect(screen.queryByText("Progress rings")).not.toBeInTheDocument();
    expect(screen.queryByText("Month structure")).not.toBeInTheDocument();
    expect(screen.queryByText("3D lens")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full screen orbit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full screen tree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full screen sunlight" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full screen progress" })).toBeInTheDocument();
    expect(screen.queryByText(/Krystal/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Overlay mode")).not.toBeInTheDocument();
  });

  it("updates the readout from scene selection and overlay controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTestId("mock-scene"));
    const comparison = screen.getByLabelText("Date panel");
    expect(within(comparison).getByRole("heading", { name: "Winter Reflection", level: 3 })).toBeInTheDocument();

    expect(comparison).toHaveTextContent("Winter");
    expect(comparison).not.toHaveTextContent("Gregorian");
  });

  it("renders sunlight lines and year and season progress rings together", () => {
    render(<App />);

    expect(screen.getByRole("img", { name: "Hours of sunlight by day of season" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Progress rings" })).toBeInTheDocument();
    expect(screen.getByText("Year progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rings" })).not.toBeInTheDocument();
  });

  it("scrubs the sunlight line within the active season at line crossovers", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTestId("mock-scene"));
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByDisplayValue("35")).toBeInTheDocument();

    const sunlightChart = screen.getByRole("img", { name: "Hours of sunlight by day of season" });
    Object.defineProperty(sunlightChart, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 440,
        bottom: 246,
        width: 440,
        height: 246,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(sunlightChart, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(sunlightChart, {
      clientX: 233,
      clientY: 85,
      pointerId: 1,
    });

    expect(screen.getByDisplayValue("36")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Winter Reflection", level: 3 })).toBeInTheDocument();
  });

  it("toggles the Gregorian overlay into every calendar view", async () => {
    const user = userEvent.setup();
    render(<App />);

    const overlayToggle = screen.getByLabelText("Gregorian");
    expect(overlayToggle).not.toBeChecked();
    expect(within(screen.getByLabelText("Date panel")).queryByText("Gregorian")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Months panel")).queryByText("Gregorian")).not.toBeInTheDocument();

    await user.click(overlayToggle);

    expect(overlayToggle).toBeChecked();
    expect(screen.getByRole("button", { name: "Overlay" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Split" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Date", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Months", level: 2 })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Date panel")).getAllByText("Gregorian").length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText("Months panel")).getAllByText("Gregorian").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "New Calendar sunlight by day of season" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gregorian sunlight by day of season" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "New Calendar year and season progress rings" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gregorian year and season progress rings" })).toBeInTheDocument();
    expect(screen.getByText("G Spring")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overlay" }));
    expect(screen.getByRole("button", { name: "Overlay" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Hours of sunlight by day of season" })).toBeInTheDocument();
  });

  it("changes simulation speed and steps through time with transport buttons", async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "7" } });
    expect(screen.getByLabelText("Speed")).toHaveValue("7");

    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "25" } });
    expect(screen.getByLabelText("Speed")).toHaveValue("25");

    await user.click(await screen.findByTestId("mock-scene"));
    expect(screen.getByDisplayValue("36")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByDisplayValue("35")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByDisplayValue("36")).toBeInTheDocument();
  });
});
