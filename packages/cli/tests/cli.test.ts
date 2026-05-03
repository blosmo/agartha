import { describe, expect, it } from "vitest";

import { runCli } from "../src/index";

describe("agartha CLI", () => {
  it("observes with bearer auth and JSON output", async () => {
    const calls: Request[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return jsonResponse({
        agentId: "agent-moss-archivist",
        availableActions: ["place_material"],
        memorySummary: "",
        nearbySymbols: [],
        position: { chunk: { x: 0, y: 0 }, cell: { x: 64, y: 64 } },
        recentEvents: [],
        visibleCells: [],
        worldEnergy: { cap: 50, current: 40, nextRegenerationTick: 2, regeneratesEveryTicks: 2 },
        worldId: "origin",
      });
    };
    const io = captureIo();

    const code = await runCli(["observe", "--agent", "agent-moss-archivist"], {}, io);

    expect(code).toBe(0);
    expect(calls[0].url).toBe("http://127.0.0.1:8787/observe");
    expect(calls[0].headers.get("authorization")).toBe("Bearer token-moss");
    expect(JSON.parse(io.stdoutText())).toMatchObject({ agentId: "agent-moss-archivist" });
  });

  it("targets Convex HTTP Actions when configured", async () => {
    const calls: Request[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return jsonResponse({
        agentId: "agent-moss-archivist",
        availableActions: ["place_material"],
        memorySummary: "",
        nearbySymbols: [],
        position: { chunk: { x: 0, y: 0 }, cell: { x: 64, y: 64 } },
        recentEvents: [],
        visibleCells: [],
        worldEnergy: { cap: 50, current: 40, nextRegenerationTick: 2, regeneratesEveryTicks: 2 },
        worldId: "origin",
      });
    };
    const io = captureIo();

    const code = await runCli(
      ["observe", "--agent", "agent-moss-archivist"],
      { AGARTHA_BACKEND: "convex", AGARTHA_CONVEX_HTTP_URL: "https://demo.convex.site" },
      io,
    );

    expect(code).toBe(0);
    expect(calls[0].url).toBe("https://demo.convex.site/observe?agentId=agent-moss-archivist");
    expect(calls[0].headers.get("authorization")).toBe("Bearer token-moss");
  });

  it("fails closed when Convex mode is selected without a Convex HTTP URL", async () => {
    const io = captureIo();

    const code = await runCli(["observe", "--agent", "agent-moss-archivist"], { AGARTHA_BACKEND: "convex" }, io);

    expect(code).toBe(2);
    expect(JSON.parse(io.stderrText())).toMatchObject({
      ok: false,
      reason: "cli_error",
    });
  });

  it("posts place-material actions with absolute coordinate conversion", async () => {
    let body: unknown;
    globalThis.fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({
        accepted: true,
        affectedCells: [],
        affectedChunks: ["0:0"],
        cost: 2,
        energyRemaining: 38,
        eventId: "event-0001",
        summary: "accepted",
      });
    };
    const io = captureIo();

    const code = await runCli(
      ["act", "place-material", "--agent", "agent-moss-archivist", "--x", "65", "--y", "65", "--material", "paint"],
      {},
      io,
    );

    expect(code).toBe(0);
    expect(body).toMatchObject({
      actionType: "place_material",
      agentId: "agent-moss-archivist",
      payload: {
        material: 1,
        target: { cell: { x: 65, y: 65 }, chunk: { x: 0, y: 0 } },
      },
      worldId: "origin",
    });
  });

  it("preserves structured API errors", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ message: "request rejected", reason: "stale_chunk_version" }, { status: 409 });
    const io = captureIo();

    const code = await runCli(
      ["act", "place-material", "--agent", "agent-moss-archivist", "--x", "65", "--y", "65", "--material", "paint"],
      {},
      io,
    );

    expect(code).toBe(4);
    expect(JSON.parse(io.stderrText())).toMatchObject({
      ok: false,
      reason: "stale_chunk_version",
      status: 409,
    });
  });

  it("reads chunk snapshots and event history", async () => {
    const calls: Request[] = [];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      if (request.url.endsWith("/events?limit=1")) {
        return jsonResponse([{ id: "event-0001", tick: 0, summary: "placed paint" }]);
      }
      return jsonResponse({
        cells: [],
        chunk: { x: 0, y: 0 },
        version: 2,
        worldId: "origin",
      });
    };

    const chunkIo = captureIo();
    expect(await runCli(["chunk", "--agent", "agent-moss-archivist", "--chunk", "0:0"], {}, chunkIo)).toBe(0);
    expect(JSON.parse(chunkIo.stdoutText())).toMatchObject({ chunk: { x: 0, y: 0 }, version: 2 });

    const eventsIo = captureIo();
    expect(await runCli(["events", "--agent", "agent-moss-archivist", "--limit", "1"], {}, eventsIo)).toBe(0);
    expect(JSON.parse(eventsIo.stdoutText())).toEqual([{ id: "event-0001", tick: 0, summary: "placed paint" }]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:8787/chunks/0/0",
      "http://127.0.0.1:8787/events?limit=1",
    ]);
  });

  it("refills agent energy through the admin endpoint", async () => {
    const calls: Request[] = [];
    let body: unknown;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      body = JSON.parse(String(init?.body));
      return jsonResponse({
        agentId: "agent-moss-archivist",
        worldEnergy: { cap: 50, current: 50, nextRegenerationTick: 2, regeneratesEveryTicks: 2 },
      });
    };
    const io = captureIo();

    const code = await runCli(
      ["admin", "refill-energy", "--agent", "agent-moss-archivist", "--amount", "9", "--admin-token", "secret"],
      {},
      io,
    );

    expect(code).toBe(0);
    expect(calls[0].url).toBe("http://127.0.0.1:8787/admin/energy/refill");
    expect(calls[0].headers.get("authorization")).toBe("Bearer secret");
    expect(body).toEqual({ agentId: "agent-moss-archivist", amount: 9 });
    expect(JSON.parse(io.stdoutText())).toMatchObject({
      agentId: "agent-moss-archivist",
      worldEnergy: { current: 50 },
    });
  });

  it("watches patches as line-delimited JSON", async () => {
    const originalWebSocket = globalThis.WebSocket;
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const io = captureIo();

    try {
      const run = runCli(["watch", "--agent", "agent-moss-archivist", "--chunk", "0:0", "--once"], {}, io);
      const socket = FakeWebSocket.instances[0];
      socket.emit("open", {});
      expect(JSON.parse(socket.sent ?? "{}")).toEqual({
        chunk: { x: 0, y: 0 },
        radiusChunks: 0,
        token: "token-moss",
      });
      socket.emit("message", { data: JSON.stringify({ type: "snapshot", snapshot: { version: 2 } }) });

      expect(await run).toBe(0);
      expect(JSON.parse(io.stdoutText())).toEqual({ type: "snapshot", snapshot: { version: 2 } });
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("watches Convex mode through the polling fallback without WebSocket", async () => {
    const originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error test simulates Node runtimes without WebSocket.
    globalThis.WebSocket = undefined;
    globalThis.fetch = async () => jsonResponse([{ id: "event-1", summary: "painted" }]);
    const io = captureIo();

    try {
      const code = await runCli(
        ["watch", "--agent", "agent-moss-archivist", "--chunk", "0:0", "--once"],
        { AGARTHA_BACKEND: "convex", AGARTHA_CONVEX_HTTP_URL: "https://demo.convex.site" },
        io,
      );

      expect(code).toBe(0);
      expect(JSON.parse(io.stdoutText())).toEqual({
        type: "events",
        events: [{ id: "event-1", summary: "painted" }],
      });
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("rejects missing tokens for unknown agents", async () => {
    const io = captureIo();

    const code = await runCli(["observe", "--agent", "agent-unknown-builder"], {}, io);

    expect(code).toBe(2);
    expect(JSON.parse(io.stderrText())).toMatchObject({
      ok: false,
      reason: "cli_error",
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly listeners = new Map<string, Array<(event: { readonly data?: string }) => void>>();
  sent?: string;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { readonly data?: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string) {
    this.sent = data;
  }

  close() {
    this.emit("close", {});
  }

  emit(type: string, event: { readonly data?: string }) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function captureIo() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write: (chunk: string) => ((stdout += chunk), true) },
    stderr: { write: (chunk: string) => ((stderr += chunk), true) },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  };
}
