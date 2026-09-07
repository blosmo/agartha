import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGovernance } from "./useGovernance";
vi.mock("../cloudMode", () => ({
  ensureCloudSession: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function response(value: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => value };
}
const page = { page: [{ id: "first" }], continueCursor: "next" };
const view = { scope: "software" };
it("deduplicates pending pages and ignores a late page after refresh", async () => {
  const late = deferred();
  const fetcher = vi.fn(async (url: string) =>
    url.includes("cursor=")
      ? late.promise
      : response(url.includes("proposals") ? page : view),
  );
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useGovernance("world:pages"));
  await waitFor(() => expect(hook.result.current.cursor).toBe("next"));
  act(() => {
    void hook.result.current.more();
    void hook.result.current.more();
  });
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("cursor=")).length,
  ).toBe(1);
  await act(async () => {
    await hook.result.current.refresh();
    late.resolve(response({ page: [{ id: "stale" }], continueCursor: null }));
  });
  expect(hook.result.current.proposals.map((p) => p.id)).toEqual(["first"]);
  expect(hook.result.current.loadingMore).toBe(false);
});
it("an older mount completion cannot erase a newer uncertain request", async () => {
  const old = deferred(),
    newer = deferred();
  let writes = 0;
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        bodies.push(String(init.body));
        writes++;
        return writes === 1
          ? old.promise
          : writes === 2
            ? response({ scope: "software" })
            : newer.promise;
      }
      return response(url.includes("proposals") ? page : view);
    }),
  );
  const first = renderHook(() => useGovernance("world:mounts"));
  await waitFor(() => expect(first.result.current.overview).toBeTruthy());
  act(() => {
    void first.result.current.mutate("/api/governance/voters", {
      enabled: true,
    });
  });
  await waitFor(() => expect(writes).toBe(1));
  first.unmount();
  const second = renderHook(() => useGovernance("world:mounts"));
  await act(async () => {
    await second.result.current.retry();
  });
  act(() => {
    void second.result.current.mutate("/api/governance/voters", {
      enabled: false,
    });
  });
  await waitFor(() => expect(writes).toBe(3));
  await act(async () => {
    old.resolve(response({ scope: "software" }));
  });
  second.unmount();
  const third = renderHook(() => useGovernance("world:mounts"));
  expect(third.result.current.pending?.body.enabled).toBe(false);
  expect(JSON.parse(bodies[0]).requestId).toBe(JSON.parse(bodies[1]).requestId);
  expect(JSON.parse(bodies[2]).requestId).not.toBe(
    JSON.parse(bodies[0]).requestId,
  );
  newer.resolve(response({ scope: "software" }));
});
it("clears read errors after a delayed successful refresh", async () => {
  const recovered = deferred();
  let fails = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (fails) throw Error("Offline");
      return url.includes("proposals") ? response(page) : recovered.promise;
    }),
  );
  const hook = renderHook(() => useGovernance("world:read-errors"));
  await waitFor(() => expect(hook.result.current.error).toBe("Offline"));
  fails = false;
  act(() => {
    void hook.result.current.refresh();
  });
  await act(async () => {
    recovered.resolve(response(view));
  });
  await waitFor(() => expect(hook.result.current.error).toBe(""));
});
it.each(["original-first", "retry-first"])(
  "settles a live retry when %s succeeds",
  async (order) => {
    const original = deferred(),
      retry = deferred();
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? ++writes === 1
            ? original.promise
            : retry.promise
          : response(url.includes("proposals") ? page : view),
      ),
    );
    const scope = `world:${order}` as const;
    const first = renderHook(() => useGovernance(scope));
    await waitFor(() => expect(first.result.current.overview).toBeTruthy());
    act(() => {
      void first.result.current.mutate("/api/governance/voters", {
        enabled: true,
      });
    });
    await waitFor(() => expect(writes).toBe(1));
    first.unmount();
    const live = renderHook(() => useGovernance(scope));
    act(() => {
      void live.result.current.retry();
    });
    await waitFor(() => expect(writes).toBe(2));
    await act(async () => {
      (order === "original-first" ? original : retry).resolve(response(view));
    });
    await act(async () => {
      (order === "original-first" ? retry : original).resolve(response(view));
    });
    await waitFor(() => expect(live.result.current.blocked).toBe(false));
    expect(live.result.current.pending).toBeUndefined();
  },
);
it("keeps uncertain write recovery after delayed pagination succeeds", async () => {
  const latePage = deferred();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("Uncertain write");
      return url.includes("cursor=")
        ? latePage.promise
        : response(url.includes("proposals") ? page : view);
    }),
  );
  const hook = renderHook(() => useGovernance("world:uncertain-page"));
  await waitFor(() => expect(hook.result.current.cursor).toBe("next"));
  act(() => {
    void hook.result.current.more();
  });
  await act(async () => {
    await hook.result.current.mutate("/api/governance/voters", {
      enabled: true,
    });
  });
  await act(async () => {
    latePage.resolve(response({ page: [], continueCursor: null }));
  });
  expect(hook.result.current.error).toBe("Uncertain write");
  expect(hook.result.current.pending).toBeTruthy();
});
