import { describe, expect, it } from "vitest";

import type { ActionResult, AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL, toWorldCoord, type MaterialId } from "@agartha/protocol/world";

import { AgentClient, type AgentTransport } from "../agentClient";
import { runFirebreakBuilderTurn } from "./firebreakBuilder";
import { runMossArchivistTurn } from "./mossArchivist";
import { runStreamGardenerTurn } from "./streamGardener";

class BehaviorTransport implements AgentTransport {
  readonly paths: string[] = [];

  async request<TResponse>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly token: string; readonly body?: unknown },
  ): Promise<TResponse> {
    this.paths.push(path);
    if (path === "/quote") {
      return { quoteId: "quote-0001", cost: 2 } as TResponse;
    }
    return accepted(path) as TResponse;
  }
}

describe("scripted behaviors", () => {
  it("moss archivist paints, registers a symbol, and leaves a note", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-moss-archivist", "token-moss", transport);
    const turns = await runMossArchivistTurn(client, perception({ energy: 40 }));

    expect(turns.map((turn) => turn.actionType)).toEqual([
      "place_material",
      "register_symbol",
      "submit_note",
    ]);
    expect(transport.paths).toContain("/quote");
  });

  it("firebreak builder places stone when fire threatens plant cells", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-firebreak-builder", "token-firebreak", transport);
    const turns = await runFirebreakBuilderTurn(
      client,
      perception({
        energy: 40,
        cells: [
          cell(65, 64, MATERIAL.Fire),
          cell(66, 64, MATERIAL.Plant),
        ],
      }),
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].actionType).toBe("place_material");
  });

  it("stream gardener waits when energy is low instead of forcing dynamic placement", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-stream-gardener", "token-gardener", transport);
    const turns = await runStreamGardenerTurn(
      client,
      perception({ energy: 3, cells: [cell(64, 64, MATERIAL.Water)] }),
    );

    expect(turns).toHaveLength(1);
    expect(turns[0].actionType).toBe("submit_note");
    expect(transport.paths).toEqual(["/act"]);
  });
});

function perception({
  energy,
  cells = [],
}: {
  energy: number;
  cells?: ReturnType<typeof cell>[];
}): AgentPerception {
  return {
    worldId: "origin",
    agentId: "agent-moss-archivist",
    position: toWorldCoord(64, 64),
    memorySummary: "seeded",
    visibleCells: cells,
    nearbySymbols: [],
    recentEvents: [],
    availableActions: ["place_material", "register_symbol", "submit_note"],
    worldEnergy: {
      current: energy,
      cap: 50,
      regeneratesEveryTicks: 2,
      nextRegenerationTick: 2,
    },
  };
}

function cell(x: number, y: number, material: MaterialId) {
  return {
    coord: toWorldCoord(x, y),
    material,
    state: 0,
    variant: 0,
    flags: 0,
  };
}

function accepted(path: string): ActionResult {
  return {
    accepted: true,
    eventId: "event-0001",
    cost: path === "/act" ? 1 : 0,
    energyRemaining: 39,
    affectedCells: [],
    affectedChunks: [],
    summary: "accepted",
  };
}
