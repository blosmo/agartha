import { describe, expect, it } from "vitest";

import type { ActionResult, AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL, toWorldCoord, type MaterialId } from "@agartha/protocol/world";

import { AgentClient, type AgentTransport } from "../agentClient";
import { runFirebreakBuilderTurn } from "./firebreakBuilder";
import { runHermesCartographerTurn } from "./hermesCartographer";
import { runHermesStewardTurn } from "./hermesSteward";
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
    if (path === "/collaboration") {
      const body = init.body as { operation: string };
      return { ok: true, operation: body.operation, worldId: "origin", agentId: "agent", areaId: "origin:64:64:r32", result: {}, next: [] } as TResponse;
    }
    return accepted(path) as TResponse;
  }
}

describe("scripted behaviors", () => {
  it("moss archivist paints, registers a symbol, and leaves a note", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-moss-archivist", "token-moss", transport);
    const turns = await runMossArchivistTurn(client, perception({ energy: 40 }));

    expect(turns.map((turn) => turn.actionType)).toEqual(["collab_enter", "collab_say", "collab_say", "paint_cells", "register_symbol", "submit_note"]);
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

    expect(turns.map((turn) => turn.actionType)).toContain("place_material");
    expect(turns.map((turn) => turn.actionType)).toContain("collab_summary");
  });

  it("stream gardener waits when energy is low instead of forcing dynamic placement", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-stream-gardener", "token-gardener", transport);
    const turns = await runStreamGardenerTurn(
      client,
      perception({ energy: 3, cells: [cell(64, 64, MATERIAL.Water)] }),
    );

    expect(turns.map((turn) => turn.actionType)).toEqual(["collab_enter", "collab_say", "collab_say", "submit_note"]);
    expect(transport.paths).toEqual(["/collaboration", "/collaboration", "/collaboration", "/act"]);
  });

  it("Hermes cartographer communicates a map plan and paints guide marks", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-hermes-cartographer", "token-hermes-cartographer", transport);
    const turns = await runHermesCartographerTurn(client, perception({ energy: 40 }));

    expect(turns.map((turn) => turn.actionType)).toEqual(["collab_enter", "collab_say", "collab_say", "collab_project", "paint_cells", "collab_summary"]);
    expect(transport.paths).toContain("/quote");
  });

  it("Hermes steward records a review and reinforces a buffer when fire and plants are present", async () => {
    const transport = new BehaviorTransport();
    const client = new AgentClient("agent-hermes-steward", "token-hermes-steward", transport);
    const turns = await runHermesStewardTurn(
      client,
      perception({
        energy: 40,
        cells: [
          cell(65, 64, MATERIAL.Fire),
          cell(66, 64, MATERIAL.Plant),
        ],
      }),
    );

    expect(turns.map((turn) => turn.actionType)).toEqual(["collab_enter", "collab_say", "collab_say", "place_material", "collab_summary"]);
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
