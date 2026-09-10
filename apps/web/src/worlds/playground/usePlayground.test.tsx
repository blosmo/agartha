import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePlayground } from "./usePlayground";
import type { PlaygroundDetail } from "../../../../../packages/protocol/src/playground";
const detail = (id: string): PlaygroundDetail => ({
  project: {
    projectId: id,
    creatorId: "maker",
    creatorName: "Maya",
    title: id,
    brief: "A place",
    status: "idea",
    votes: 0,
    hasVoted: false,
    canManage: false,
    createdAt: 1,
    updatedAt: 1,
  },
  invitations: [],
  contributions: [],
  contributionCursor: null,
  viewer: null,
});
const response = (value: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => value,
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("explores without creating a session and ignores a stale selected project response", async () => {
  let resolveFirst!: (value: unknown) => void;
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/first")
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : response(
          url.endsWith("/second")
            ? detail("second")
            : { page: [], continueCursor: null },
        ),
  );
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(usePlayground);
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    void result.current.open("first");
  });
  await act(async () => {
    await result.current.open("second");
  });
  expect(result.current.detail?.project.projectId).toBe("second");
  await act(async () => {
    resolveFirst(response(detail("first")));
  });
  expect(result.current.detail?.project.projectId).toBe("second");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/session")).toBe(
    false,
  );
});
it("retries an uncertain write using the original request identity and body", async () => {
  let attempts = 0;
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "/api/session") return response({});
      if (init.method === "POST") {
        bodies.push(String(init.body));
        if (++attempts === 1) throw new Error("Lost response");
        return response(detail("created"));
      }
      return response({ page: [], continueCursor: null });
    }),
  );
  const { result } = renderHook(usePlayground);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.mutate(
      "/api/playground/projects",
      { title: "Original", brief: "A place" },
      "Maya",
    );
  });
  expect(result.current.pending).toBeDefined();
  await act(async () => {
    await result.current.mutate(
      "/api/playground/projects",
      { title: "Different" },
      "Maya",
    );
  });
  expect(bodies).toHaveLength(1);
  await act(async () => {
    await result.current.retry("Maya");
  });
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  expect(result.current.pending).toBeUndefined();
  expect(result.current.detail?.project.projectId).toBe("created");
});
it("does not reopen a project when its vote finishes after navigating away", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "/api/session") return response({});
      if (init.method === "POST")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return response(
        url.endsWith("/a")
          ? detail("a")
          : url.endsWith("/b")
            ? detail("b")
            : { page: [], continueCursor: null },
      );
    }),
  );
  const { result } = renderHook(usePlayground);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.open("a");
  });
  let mutation!: Promise<boolean>;
  act(() => {
    mutation = result.current.mutate(
      "/api/playground/projects/a/vote",
      { voted: true },
      "Maya",
    );
  });
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => {
    await result.current.open("b");
  });
  await act(async () => {
    finish(response(detail("a")));
    await mutation;
  });
  expect(result.current.detail?.project.projectId).toBe("b");
});
