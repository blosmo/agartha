import { describe, expect, it } from "vitest";

import { contextForArea, presentAgentsForArea, staleProjectResponse, validateCollaborationEnvelope } from "./collaboration";

describe("Convex collaboration helpers", () => {
  it("validates shared envelopes and returns structured errors", () => {
    expect(
      validateCollaborationEnvelope({
        operation: "say",
        worldId: "origin",
        agentId: "agent-moss-archivist",
        payload: { body: "I can review this area." },
      }),
    ).toMatchObject({ ok: true });

    expect(validateCollaborationEnvelope({ operation: "say", worldId: "origin", agentId: "agent-moss-archivist", payload: { body: "" } })).toMatchObject({
      ok: false,
      response: { ok: false, error: { reason: "malformed" } },
    });
  });

  it("keeps local presence radius-based instead of chunk-boundary based", () => {
    const area = { id: "origin:128:64:r32", center: { x: 128, y: 64 }, radius: 32 };
    const sessions = [
      {
        agentId: "agent-moss-archivist",
        areaId: "origin:128:64:r32",
        position: { chunk: { x: 0, y: 0 }, cell: { x: 127, y: 64 } },
        enteredAt: 0,
        lastSeenAt: 10,
        live: true,
      },
      {
        agentId: "agent-firebreak-builder",
        areaId: "origin:160:64:r32",
        position: { chunk: { x: 1, y: 0 }, cell: { x: 1, y: 64 } },
        enteredAt: 0,
        lastSeenAt: 10,
        live: true,
      },
      {
        agentId: "agent-stream-gardener",
        areaId: "origin:224:64:r32",
        position: { chunk: { x: 1, y: 0 }, cell: { x: 80, y: 64 } },
        enteredAt: 0,
        lastSeenAt: 10,
        live: true,
      },
    ];

    expect(presentAgentsForArea(sessions, area, 20).map((agent) => agent.agentId)).toEqual([
      "agent-moss-archivist",
      "agent-firebreak-builder",
    ]);
  });

  it("builds context with recent messages, projects, summaries, and stale update errors", () => {
    const context = contextForArea({
      position: { chunk: { x: 0, y: 0 }, cell: { x: 64, y: 64 } },
      now: 100,
      sessions: [],
      messages: [{ id: "message-0001", worldId: "origin", areaId: "origin:64:64:r32", authorAgentId: "agent", body: "hello", createdAt: 1 }],
      projects: [{ id: "project-0001", worldId: "origin", areaId: "origin:64:64:r32", title: "Build", version: 1, entries: [], updatedAt: 2 }],
      summaries: [{ id: "summary-0001", worldId: "origin", areaId: "origin:64:64:r32", body: "Decision", provenance: {} }],
    });

    expect(context.recentMessages).toHaveLength(1);
    expect(context.projects[0]?.title).toBe("Build");
    expect(context.durableSummaries[0]?.body).toBe("Decision");
    expect(
      staleProjectResponse(
        { operation: "project", worldId: "origin", agentId: "agent", payload: {} },
        "origin:64:64:r32",
      ),
    ).toMatchObject({ ok: false, error: { reason: "stale_project_version", retryable: true } });
  });
});
