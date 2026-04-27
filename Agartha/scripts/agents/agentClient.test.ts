import { describe, expect, it } from "vitest";

import { MATERIAL, toWorldCoord } from "@agartha/protocol/world";

import { AgentClient, type AgentTransport } from "./agentClient";

class MockTransport implements AgentTransport {
  readonly calls: Array<{ path: string; method: string; token: string; body?: unknown }> = [];

  async request<TResponse>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly token: string; readonly body?: unknown },
  ): Promise<TResponse> {
    this.calls.push({ path, ...init });
    if (path === "/observe") {
      return {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        position: toWorldCoord(64, 64),
        memorySummary: "",
        visibleCells: [],
        nearbySymbols: [],
        recentEvents: [],
        availableActions: ["place_material"],
        worldEnergy: { current: 40, cap: 50, regeneratesEveryTicks: 2, nextRegenerationTick: 2 },
      } as TResponse;
    }
    if (path === "/quote") {
      return { quoteId: "quote-0001", cost: 2, expectedChunkVersion: 0 } as TResponse;
    }
    return {
      accepted: true,
      eventId: "event-0001",
      cost: 2,
      energyRemaining: 38,
      affectedCells: [],
      affectedChunks: [],
      summary: "accepted",
    } as TResponse;
  }
}

describe("AgentClient", () => {
  it("uses bearer-authenticated observe quote and act API calls", async () => {
    const transport = new MockTransport();
    const client = new AgentClient("agent-moss-archivist", "token-moss", transport);

    await client.observe();
    await client.quote({
      actionType: "place_material",
      payload: { target: toWorldCoord(64, 64), material: MATERIAL.Paint },
    });
    await client.act({
      actionType: "place_material",
      payload: { target: toWorldCoord(64, 64), material: MATERIAL.Paint },
    });

    expect(transport.calls.map((call) => call.path)).toEqual(["/observe", "/quote", "/act"]);
    expect(transport.calls.every((call) => call.token === "token-moss")).toBe(true);
    expect(transport.calls[1].body).toMatchObject({
      worldId: "origin",
      agentId: "agent-moss-archivist",
      actionType: "place_material",
    });
  });
});
