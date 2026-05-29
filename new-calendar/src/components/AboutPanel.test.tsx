import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AboutPanel } from "./AboutPanel";

describe("AboutPanel", () => {
  it("renders attribution and official link when open", () => {
    render(<AboutPanel open onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "About The New Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tom Sherman", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /The New Calendar/i })[0]).toHaveAttribute(
      "href",
      "https://thenewcalendar.com/",
    );
    expect(screen.getByRole("heading", { name: "Structure in this app", level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/unofficial interactive visualization/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<AboutPanel open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "About The New Calendar" })).not.toBeInTheDocument();
  });

  it("calls onClose from the close button and backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<AboutPanel open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(container.querySelector(".about-dialog-root") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
