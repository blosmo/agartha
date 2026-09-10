import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PlaygroundPanel from "./PlaygroundPanel";
const project = {
  projectId: "diner",
  creatorId: "maya",
  creatorName: "Maya",
  title: "The Last Stop Diner",
  brief: "A diner for lost astronauts.",
  status: "idea",
  votes: 2,
  hasVoted: false,
  canManage: false,
  plotId: "0:0",
  createdAt: 1,
  updatedAt: 1,
};
const detail = {
  project,
  invitations: [
    {
      invitationId: "music",
      projectId: "diner",
      title: "Invent the jukebox",
      description: "What does a vanished planet sound like?",
      status: "open",
      createdAt: 1,
    },
  ],
  contributions: [
    {
      contributionId: "chair",
      projectId: "diner",
      authorId: "leo",
      authorName: "Leo",
      description: "A chair that remembers gravity.",
      status: "accepted",
      createdAt: 1,
    },
  ],
  contributionCursor: null,
  viewer: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("opens image-led ideas, invitations, real contributor credits, and linked rooms", async () => {
  const visit = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/funding")
          ? null
          : url.endsWith("/diner")
            ? detail
            : { page: [project], continueCursor: null },
    })),
  );
  render(
    <PlaygroundPanel
      roomId="0:0"
      onClose={() => {}}
      onInvite={() => {}}
      onVisit={visit}
    />,
  );
  expect(screen.getByText(/Community ideas/)).toBeInTheDocument();
  expect(
    screen.getByRole("tab", { name: "Find a crew" }),
  ).toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole("button", { name: /The Last Stop Diner/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "Invent the jukebox" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("A chair that remembers gravity."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Visit room" }));
  expect(visit).toHaveBeenCalledWith("0:0");
  fireEvent.click(
    screen.getByRole("button", { name: "Join this invitation" }),
  );
  expect(screen.getByLabelText("Your contribution")).toHaveFocus();
  expect(screen.getByLabelText("Contribute to")).toHaveValue("music");
});
it("submits a free proposal through the API and labels concept art honestly", async () => {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith("/funding")
        ? null
        : init.method === "POST" && url.endsWith("/projects")
          ? detail
          : { page: [], continueCursor: null },
  }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <PlaygroundPanel
      roomId="0:0"
      onClose={() => {}}
      onInvite={() => {}}
      onVisit={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Share the first idea" }),
  );
  fireEvent.change(screen.getByLabelText("Idea title"), {
    target: { value: "The Last Stop Diner" },
  });
  fireEvent.change(screen.getByLabelText("What could we make together?"), {
    target: { value: "A diner for lost astronauts." },
  });
  expect(screen.getByText(/Concept art sets a direction/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Share idea · free" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/projects") && init.method === "POST",
      ),
    ).toBe(true),
  );
  const write = fetcher.mock.calls.find(
    ([url, init]) => url.endsWith("/projects") && init.method === "POST",
  )!;
  expect(JSON.parse(String(write[1].body))).toMatchObject({
    title: project.title,
    plotId: "0:0",
    requestId: expect.any(String),
  });
});

it("hides forbidden project writes after completion and limits contributor names", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/funding")
          ? null
          : url.endsWith("/pass")
            ? { offer: { available: false } }
            : url.endsWith("/diner")
              ? {
                  ...detail,
                  project: { ...project, status: "completed", canManage: true },
                }
              : { page: [project], continueCursor: null },
    })),
  );
  render(
    <PlaygroundPanel
      roomId="0:0"
      onClose={() => {}}
      onInvite={() => {}}
      onVisit={() => {}}
    />,
  );
  expect(screen.getByLabelText("Name for your contributions")).toHaveAttribute(
    "maxlength",
    "60",
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /The Last Stop Diner/ }),
  );
  await screen.findByRole("heading", { name: "Invent the jukebox" });
  expect(
    screen.queryByRole("button", { name: /Vote ·/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Join this invitation" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Open a creative invitation"),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Your contribution")).not.toBeInTheDocument();
  expect(screen.queryByText("Manage this project")).not.toBeInTheDocument();
});

it("clears an invitation selection when that invitation closes before offering work", async () => {
  const writes: Record<string, unknown>[] = [];
  let closed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/music") && init.method === "POST") closed = true;
      if (url.endsWith("/contributions") && init.method === "POST")
        writes.push(JSON.parse(String(init.body)));
      return {
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith("/funding")
            ? null
            : url.endsWith("/pass")
              ? { offer: { available: false } }
              : url.endsWith("/projects")
                ? { page: [project], continueCursor: null }
                : {
                    ...detail,
                    project: { ...project, canManage: true },
                    invitations: detail.invitations.map((i) => ({
                      ...i,
                      status: closed ? "closed" : "open",
                    })),
                  },
      };
    }),
  );
  render(
    <PlaygroundPanel
      roomId="0:0"
      onClose={() => {}}
      onInvite={() => {}}
      onVisit={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /The Last Stop Diner/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Join this invitation" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close invitation" }));
  await waitFor(() =>
    expect(screen.queryByLabelText("Contribute to")).not.toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText("Your contribution"), {
    target: { value: "A general idea for the room." },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Offer contribution · free" }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).not.toHaveProperty("invitationId");
});
