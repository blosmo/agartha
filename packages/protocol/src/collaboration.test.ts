import { describe, expect, it } from "vitest";

import {
  collaborationEnvelopeErrors,
  collaborationOk,
  isWithinLocalArea,
  localAreaForPosition,
} from "./collaboration";
import { toWorldCoord } from "./world";

describe("collaboration protocol contracts", () => {
  it("validates enter, heartbeat, message, project, and summary envelopes", () => {
    const position = toWorldCoord(10, 20);
    const envelopes = [
      { operation: "enter", worldId: "origin", agentId: "agent-moss-archivist", payload: { position } },
      { operation: "heartbeat", worldId: "origin", agentId: "agent-moss-archivist", payload: { position } },
      { operation: "say", worldId: "origin", agentId: "agent-moss-archivist", payload: { body: "I can review this area." } },
      {
        operation: "project",
        worldId: "origin",
        agentId: "agent-moss-archivist",
        payload: { title: "Garden edge", kind: "goal", body: "Shape a soft moss border.", expectedVersion: 0 },
      },
      {
        operation: "summary",
        worldId: "origin",
        agentId: "agent-moss-archivist",
        payload: { body: "Decision: keep the south edge open.", status: "decision" },
      },
    ];

    for (const envelope of envelopes) {
      expect(collaborationEnvelopeErrors(envelope), envelope.operation).toEqual([]);
    }
  });

  it("returns structured validation errors for malformed collaboration payloads", () => {
    expect(
      collaborationEnvelopeErrors({
        operation: "say",
        worldId: "origin",
        agentId: "agent-moss-archivist",
        payload: { body: "" },
      }),
    ).toEqual([{ reason: "malformed", message: "body must be non-empty bounded text." }]);

    expect(
      collaborationEnvelopeErrors({
        operation: "project",
        worldId: "origin",
        agentId: "agent-moss-archivist",
        payload: { kind: "goal", body: "x", expectedVersion: 1.5 },
      }).map((error) => error.reason),
    ).toEqual(["stale_project_version"]);

    expect(collaborationEnvelopeErrors({ operation: "unknown", worldId: "origin", payload: {} }).map((error) => error.reason)).toEqual([
      "malformed",
      "malformed",
    ]);
  });

  it("derives local areas from coordinates without making chunk edges social walls", () => {
    const area = localAreaForPosition(toWorldCoord(127, 64));

    expect(area.id).toBe("origin:128:64:r32");
    expect(isWithinLocalArea(toWorldCoord(129, 64), area)).toBe(true);
    expect(isWithinLocalArea(toWorldCoord(190, 64), area)).toBe(false);
  });

  it("builds stable JSON response envelopes with next-step hints", () => {
    expect(collaborationOk("presence", "origin", "agent-moss-archivist", { count: 2 }, "origin:0:0:r32", ["collab say"])).toEqual({
      ok: true,
      operation: "presence",
      worldId: "origin",
      agentId: "agent-moss-archivist",
      areaId: "origin:0:0:r32",
      result: { count: 2 },
      next: ["collab say"],
    });
  });
});
