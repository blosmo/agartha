import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { GovernancePanel } from "./GovernancePanel";
vi.mock("../cloudMode", () => ({
  ensureCloudSession: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const overview = {
  scope: "world:0,0",
  label: "World",
  rules: { charter: "Be kind", allowedShapes: ["box"], maxObjectScale: 5 },
  rulesVersion: 0,
  voterVersion: 0,
  voters: [],
  voting: { rosterReady: true },
  permissions: {
    agentId: "a",
    canPropose: true,
    eligibleToVote: false,
    canManageVoters: true,
  },
};
function response(value: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => value };
}
function fixture() {
  const fetcher = vi.fn(async (input: unknown, _init?: RequestInit) =>
    response(
      String(input).includes("/proposals")
        ? { page: [], isDone: true, continueCursor: null }
        : overview,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("explains local support without registering or fetching", () => {
  const fetcher = fixture();
  render(<GovernancePanel roomId="0,0" cloud={false} onClose={() => {}} />);
  expect(screen.getByText(/Rules and voting are available in the online world/i)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
it("shows rules and separate voting eligibility and switches scope", async () => {
  const fetcher = fixture();
  render(<GovernancePanel roomId="0,0" cloud onClose={() => {}} />);
  expect(await screen.findByText("Be kind")).toBeTruthy();
  expect(screen.getByText(/not on this voter roster/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Agartha software" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("scope=software"),
      ),
    ).toBe(true),
  );
});
it("retains the exact request identity after an uncertain mutation", async () => {
  const fetcher = fixture();
  render(<GovernancePanel roomId="retry-room" cloud onClose={() => {}} />);
  await screen.findByText("Be kind");
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "A new charter" },
  });
  fireEvent.change(screen.getByLabelText("Rationale"), {
    target: { value: "A reason" },
  });
  fireEvent.change(screen.getByLabelText("Charter"), {
    target: { value: "Welcome" },
  });
  fetcher.mockImplementation(async (_input, init?: RequestInit) => {
    if (init?.method === "POST") throw new Error("Offline");
    return response(overview);
  });
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await screen.findByRole("button", { name: "Retry request" });
  fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(
        (call) => (call[1] as RequestInit)?.method === "POST",
      ),
    ).toHaveLength(2),
  );
  const writes = fetcher.mock.calls.filter(
    (call) => (call[1] as RequestInit)?.method === "POST",
  );
  expect(writes[0][0]).toBe(writes[1][0]);
  expect(writes[1][1]).toMatchObject({method:writes[0][1]?.method,headers:writes[0][1]?.headers,body:writes[0][1]?.body});
  expect(writes[1][1]?.signal).not.toBe(writes[0][1]?.signal);
});
it("does not display a late response from the previous scope", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("world%3A")
        ? new Promise((r) => {
            resolve = r;
          })
        : Promise.resolve(
            response(
              url.includes("/proposals")
                ? { page: [], isDone: true }
                : { ...overview, rules: null, label: "Software" },
            ),
          ),
    ),
  );
  render(<GovernancePanel roomId="0,0" cloud onClose={() => {}} />);
  await waitFor(() => expect(resolve).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Agartha software" }));
  await screen.findByText(/Software changes await implementation/i);
  resolve(response(overview));
  expect(screen.queryByText("Be kind")).toBeNull();
});
const proposal = {
  id: "p1",
  scope: "world:0,0",
  revision: 3,
  status: "open",
  title: "Welcome rule",
  rationale: "Welcome everyone",
  change: { kind: "world_rules", rules: { charter: "Welcome" } },
  ballots: [{ agentId: "a", choice: "no", version: 2 }],
  tally: { yes: 0, no: 1, abstain: 0, total: 1, quorum: 1 },
  permissions: { canOpen: true, canVote: true },
  closesAt: null,
  implementation: null,
};
function lifecycle() {
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") return response(proposal);
    if (String(url).endsWith("/comments"))
      return response({
        page: [{ id: "c1", author: { name: "Guest" }, text: "Good idea" }],
        continueCursor: null,
      });
    if (String(url).endsWith("/p1")) return response(proposal);
    return response(
      String(url).includes("/proposals")
        ? { page: [proposal], continueCursor: null }
        : overview,
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("opens voting, casts a versioned ballot and displays discussion", async () => {
  const fetcher = lifecycle();
  render(<GovernancePanel roomId="0,0" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  await screen.findByText(/Good idea/);
  fireEvent.click(screen.getByRole("button", { name: "Open voting" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/open") &&
          JSON.parse(String(init?.body)).expectedRevision === 3,
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "yes" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "yes" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/vote") &&
          JSON.parse(String(init?.body)).expectedBallotVersion === 2,
      ),
    ).toBe(true),
  );
});
it("posts comments and manages voters without supplying caller identity", async () => {
  const fetcher = lifecycle();
  render(<GovernancePanel roomId="0,0" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  await screen.findByText(/Good idea/);
  await act(async () => {}); // Flush the proposal-change reset before typing.
  fireEvent.change(screen.getByLabelText("Comment"), {
    target: { value: "My comment" },
  });
  expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).value).toBe("My comment");
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/comments") && init?.method === "POST",
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Add voter" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("Registered agent ID"), {
    target: { value: "new-agent" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add voter" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/voters") &&
          JSON.parse(String(init?.body)).agentId === "new-agent",
      ),
    ).toBe(true),
  );
});
it("refreshes stale versions on conflict and makes the next attempt available", async () => {
  const fetcher = lifecycle();
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url, init) =>
    init?.method === "POST"
      ? response({ error: "Stale revision" }, 409)
      : original(url, init),
  );
  render(<GovernancePanel roomId="0,0" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  await screen.findByText(/Good idea/);
  fireEvent.click(screen.getByRole("button", { name: "yes" }));
  await screen.findByText("Stale revision");
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith("/p1")).length,
    ).toBeGreaterThan(1),
  );
  expect(screen.queryByRole("button", { name: "Retry request" })).toBeNull();
});
it("labels passed software as pending implementation", async () => {
  const passed = {
    ...proposal,
    status: "implementation_pending",
    permissions: {},
    change: {
      kind: "software",
      rule: "A rule",
      implementation: "Add a feature",
      acceptanceCriteria: ["Works"],
    },
    implementation: {
      rule: "A rule",
      implementation: "Add a feature",
      acceptanceCriteria: ["Works"],
      repository: "Agartha",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      response(
        url.endsWith("/comments")
          ? { page: [] }
          : url.endsWith("/p1")
            ? passed
            : url.includes("/proposals")
              ? { page: [passed] }
              : { ...overview, rules: null },
      ),
    ),
  );
  render(<GovernancePanel roomId="0,0" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  expect(await screen.findByText("Implementation packet")).toBeTruthy();
  expect(
    screen.getByText("Awaiting implementation. This change is not deployed."),
  ).toBeTruthy();
});
it("edits draft content against its revision, including clearing a charter", async () => {
  const draft = {
    ...proposal,
    status: "draft",
    permissions: { canEdit: true },
  };
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) =>
    response(
      init?.method === "POST"
        ? draft
        : String(url).endsWith("/comments")
          ? { page: [] }
          : String(url).endsWith("/p1")
            ? draft
            : String(url).includes("/proposals")
              ? { page: [draft] }
              : overview,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<GovernancePanel roomId="edit-room" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  fireEvent.change(screen.getByLabelText("Charter"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([, init]) =>
          init?.method === "POST" &&
          JSON.parse(String(init.body)).change.rules.charter === "" &&
          JSON.parse(String(init.body)).expectedRevision === 3,
      ),
    ).toBe(true),
  );
});
it("keeps the editing revision after a newer proposal refresh", async () => {
  let current = {
    ...proposal,
    status: "draft",
    permissions: { canEdit: true },
  };
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST")
      return response({ error: "Stale revision" }, 409);
    if (String(url).endsWith("/p1"))
      return current.revision === 4
        ? new Promise((r) => {
            finish = r;
          })
        : response(current);
    return response(
      String(url).endsWith("/comments")
        ? { page: [] }
        : String(url).includes("/proposals")
          ? { page: [current] }
          : overview,
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(<GovernancePanel roomId="draft-conflict" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  current = { ...current, revision: 4 };
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(finish).toBeTruthy());
  finish(response(current));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([, init]) =>
          init?.method === "POST" &&
          JSON.parse(String(init.body)).expectedRevision === 3,
      ),
    ).toBe(true),
  );
});
it("resets successful creation and comment drafts, including after retry", async () => {
  let failComment = true;
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      if (String(url).endsWith("/comments")) {
        if (failComment) throw Error("Offline comment");
        return response({ id: "c2", proposalId: "p1" });
      }
      return response(proposal);
    }
    return response(
      String(url).endsWith("/comments")
        ? { page: [] }
        : String(url).endsWith("/p1")
          ? proposal
          : String(url).includes("/proposals")
            ? { page: [proposal] }
            : overview,
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(<GovernancePanel roomId="form-resets" cloud onClose={() => {}} />);
  await screen.findByText("Be kind");
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "New draft" },
  });
  fireEvent.change(screen.getByLabelText("Rationale"), {
    target: { value: "Reason" },
  });
  fireEvent.change(screen.getByLabelText("Charter"), {
    target: { value: "Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(""),
  );
  await screen.findByLabelText("Comment");
  fireEvent.change(screen.getByLabelText("Comment"), {
    target: { value: "Discuss" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  await screen.findByRole("button", { name: "Retry request" });
  expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).value).toBe(
    "Discuss",
  );
  failComment = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Comment") as HTMLTextAreaElement).value,
    ).toBe(""),
  );
});
it("does not carry discussion drafts into another proposal", async () => {
  const fetcher = vi.fn(async (url: unknown) =>
    response(
      String(url).endsWith("/comments")
        ? { page: [] }
        : String(url).endsWith("/p2")
          ? { ...proposal, id: "p2", title: "Second" }
          : String(url).endsWith("/p1")
            ? proposal
            : String(url).includes("/proposals")
              ? { page: [proposal, { ...proposal, id: "p2", title: "Second" }] }
              : overview,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<GovernancePanel roomId="comment-switch" cloud onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome rule/ }));
  await screen.findByLabelText("Comment");
  fireEvent.change(screen.getByLabelText("Comment"), {
    target: { value: "First only" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Second/ }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Comment") as HTMLTextAreaElement).value,
    ).toBe(""),
  );
});

it('moves focus to the selected proposal so its action controls are discoverable',async()=>{
 lifecycle();
 render(<GovernancePanel roomId="the-commons" cloud onClose={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:/Welcome rule/}));
 const detail=await screen.findByRole('region',{name:'Proposal detail'});
 await waitFor(()=>expect(detail).toHaveFocus());
});
