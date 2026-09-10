import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentAllowance } from "./AgentAllowance";
const props = {
  name: "Maya",
  enabled: true,
  frozen: false,
  availableCents: 500,
  livemode: false,
  onUpdated: () => {},
};
const response = (value: unknown) => ({
  ok: true,
  status: 200,
  json: async () => value,
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("binds recipient, amount and expiry to the reviewed allocation and retries without duplicates", async () => {
  const bodies: string[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "/api/session") return response({});
    if (init.method === "POST") {
      bodies.push(String(init.body));
      if (bodies.length === 1) throw new Error("Response lost");
      return response({ allowanceId: "new" });
    }
    return response({ allowances: [], hasMore: false, nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AgentAllowance {...props} />);
  fireEvent.click(screen.getByText("Agent allowances"));
  fireEvent.change(screen.getByLabelText("Agent public ID"), {
    target: { value: "agent-maker" },
  });
  fireEvent.change(screen.getByLabelText("Allowance amount (USD)"), {
    target: { value: "2.50" },
  });
  fireEvent.change(screen.getByLabelText("Expires after (days)"), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review agent budget" }));
  expect(
    screen.getByText(/Allocate \$2.50 in test prepaid credits to agent-maker/),
  ).toHaveTextContent("expires 3 days after confirmation");
  expect(bodies).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Agent public ID"), {
    target: { value: "agent-different" },
  });
  fireEvent.change(screen.getByLabelText("Allowance amount (USD)"), {
    target: { value: "4.00" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm allowance action" }),
  );
  await screen.findByRole("button", {
    name: "Check unconfirmed payment action",
  });
  expect(JSON.parse(bodies[0])).toMatchObject({
    recipientId: "agent-maker",
    amountCents: 250,
    days: 3,
    requestId: expect.any(String),
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Check unconfirmed payment action" }),
  );
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[1]).toBe(bodies[0]);
  await screen.findByText("Confirmed. Your balance has been updated.");
  expect(
    screen.queryByRole("button", { name: "Confirm allowance action" }),
  ).not.toBeInTheDocument();
});
it("disables allocation for frozen wallets and explains unavailable passes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({ allowances: [], hasMore: false, nextCursor: null }),
    ),
  );
  const view = render(<AgentAllowance {...props} frozen />);
  fireEvent.click(screen.getByText("Agent allowances"));
  fireEvent.change(screen.getByLabelText("Agent public ID"), {
    target: { value: "agent-maker" },
  });
  expect(
    screen.getByRole("button", { name: "Review agent budget" }),
  ).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("wallet is frozen");
  view.rerender(<AgentAllowance {...props} enabled={false} />);
  expect(screen.queryByLabelText("Agent public ID")).not.toBeInTheDocument();
  expect(
    screen.getByText(/Add a build budget before sponsoring/),
  ).toBeInTheDocument();
});
it("shows actual reserved and spent amounts and never puts wallet credentials in the agent handoff", async () => {
  const copy = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({
        allowances: [
          {
            allowanceId: "allowance-example",
            sponsorId: "maya",
            sponsorName: "Maya",
            recipientId: "agent-maker",
            recipientName: "Maker",
            livemode: false,
            amountCents: 500,
            availableCents: 200,
            heldCents: 100,
            spentCents: 200,
            refundedCents: 0,
            status: "active",
            expiresAt: Date.now() + 86400000,
            createdAt: 1,
            canCreateJob: false,
            frozen: false,
            jobCount: 1,
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
    ),
  );
  render(<AgentAllowance {...props} />);
  fireEvent.click(screen.getByText("Agent allowances"));
  await screen.findByRole("heading", { name: "Maker" });
  expect(screen.getByText("Held for jobs")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Agent handoff"));
  fireEvent.click(screen.getByRole("button", { name: "Copy agent handoff" }));
  expect(copy).toHaveBeenCalledWith(
    `Allowance: allowance-example\nGuide: ${window.location.origin}/agents/playground.md`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoke & stop work" }));
  expect(
    screen.getByText(/Work already performed may be charged/),
  ).toBeInTheDocument();
});
