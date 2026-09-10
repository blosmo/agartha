import { IdentityRecovery } from "./IdentityRecovery";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { YourPass } from "./PlaygroundFunding";
import { CreditTopUp } from "./CreditTopUp";
const offer = {
  offerId: "trial",
  feeCents: 50,
  generationCents: 150,
  totalCents: 200,
  livemode: false,
  available: true,
};
const pricing = {
  topUpCents: [500, 2000],
  purchasesEnabled: false,
  paymentMode: "test",
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
it("requires review and exact allocation confirmation before activating a pass", async () => {
  const fetcher = vi.fn(async (url: string, init: RequestInit) =>
    response(
      url.endsWith("credit-pricing")
        ? pricing
        : init.method === "POST"
          ? {}
          : {
              offer,
              pass: null,
              wallet: { availableCents: 300, heldCents: 0, frozen: false },
            },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<YourPass name="Maya" onName={() => {}} onInvite={() => {}} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review build budget" }),
  );
  expect(
    screen.getByText(/This deducts \$0.50 for hosting/),
  ).toBeInTheDocument();
  expect(
    fetcher.mock.calls.filter(([, init]) => init.method === "POST"),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm build budget" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/activate"))).toBe(
      true,
    ),
  );
  const call = fetcher.mock.calls.find(([url]) => url.endsWith("/activate"))!;
  expect(JSON.parse(String(call[1].body))).toMatchObject({
    offerId: "trial",
    livemode: false,
    requestId: expect.any(String),
  });
});
it("keeps unavailable purchases and passes honest without fabricating a balance", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      response(
        url.endsWith("credit-pricing")
          ? pricing
          : {
              offer: {
                ...offer,
                available: false,
                unavailableReason: "Pass pricing is not configured.",
              },
              pass: null,
              wallet: null,
            },
      ),
    ),
  );
  render(<YourPass name="" onName={() => {}} onInvite={() => {}} />);
  expect(
    await screen.findByText("Pass pricing is not configured."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Review build budget" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Add \$/ }),
  ).not.toBeInTheDocument();
});
it("recovers the same checkout purchase after a lost response, then checks actual settlement", async () => {
  let creates = 0;
  const purchaseBodies: string[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("credit-pricing"))
      return response({ ...pricing, purchasesEnabled: true });
    if (url === "/api/session") return response({});
    if (url === "/api/playground/identity")
      return response({
        agentId: "checkout-identity",
        name: "Maya",
        expiresAt: 99,
        recoveryConfigured: true,
        recoverable: true,
      });
    if (url.endsWith("/identity/export"))
      return response({ recoveryCode: "private-backup-fixture" });
    if (url === "/api/playground/credits") {
      purchaseBodies.push(String(init.body));
      if (++creates === 1) throw new Error("Lost response");
      return response({ status: "pending" });
    }
    if (url.endsWith("/checkout"))
      return response({ paymentUrl: "https://checkout.stripe.com/test" });
    return response({ status: "paid" });
  });
  vi.stubGlobal("fetch", fetcher);
  const updated = vi.fn();
  render(
    <>
      <IdentityRecovery name="Maya" onRestored={() => {}} />
      <CreditTopUp name="Maya" onUpdated={updated} />
    </>,
  );
  expect(screen.queryByLabelText("Recovery code")).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.some(([url]) => url.endsWith("/identity/export")),
  ).toBe(false);
  fireEvent.click(await screen.findByRole("button", { name: "Add $5.00" }));
  expect(purchaseBodies).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Prepare checkout" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Reveal and save a recovery code",
  );
  expect(purchaseBodies).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Back up identity" }));
  expect(await screen.findByLabelText("Recovery code")).toHaveValue(
    "private-backup-fixture",
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare checkout" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Lost response"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Recover checkout link" }),
  );
  expect(
    await screen.findByRole("link", { name: "Open secure checkout ↗" }),
  ).toHaveAttribute("href", "https://checkout.stripe.com/test");
  expect(purchaseBodies[0]).toBe(purchaseBodies[1]);
  fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Payment status: paid.",
  );
  expect(updated).toHaveBeenCalledOnce();
});

it.each(["queued", "completed", "failed"])("reconciles an uncertain start with a %s job before cancellation or settlement", async (jobStatus) => {
  const { ProjectFunding } = await import("./PlaygroundFunding");
  let started = false;
  const posted: string[] = [];
  const funding = () => ({
    projectId: "recover",
    livemode: false,
    targetCents: 200,
    feeCents: 50,
    backedCents: 200,
    status: started ? "building" : "funding",
    ...(started
      ? {
          jobId: "same-job",
          job: {
            status: jobStatus,
            progress: "Observed",
            artifactsReady: false,
            visuallyInspected: false,
          },
        }
      : {}),
    chargedCents: 0,
    refundedCents: 0,
    backers: [],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "/api/session") return response({});
      if (url.endsWith("/pass")) return response({ offer });
      if (init.method === "POST") {
        posted.push(url);
        if (url.endsWith("/start")) {
          started = true;
          throw new Error("Dispatch response lost");
        }
        return response(funding());
      }
      return response(funding());
    }),
  );
  render(
    <ProjectFunding
      name="Maya"
      project={{
        projectId: "recover",
        creatorId: "maya",
        creatorName: "Maya",
        title: "A place",
        brief: "A room",
        status: "funding",
        votes: 0,
        hasVoted: false,
        canManage: true,
        createdAt: 1,
        updatedAt: 1,
      }}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Review build authorization" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByRole("button", { name: "Refresh funding state" });
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh funding state" }),
  );
  const nextAction = jobStatus === "queued" ? "Cancel build" : "Settle build budget";
  expect(
    await screen.findByRole("button", { name: nextAction }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Use confirmed build state" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: nextAction })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: nextAction }));
  expect(
    screen.getByText(jobStatus === "queued" ? /Work already performed may be charged/ : /Settle actual generation charges/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(posted).toEqual([
      "/api/playground/projects/recover/funding/start",
      `/api/playground/projects/recover/funding/${jobStatus === "queued" ? "cancel" : "settle"}`,
    ]),
  );
});
