import { describe, expect, it } from "vitest";

import { authenticateToken, tokenDigest, tokenPrefix } from "./auth";

describe("Convex service-token auth helpers", () => {
  it("authenticates scoped token digests without returning raw token material", async () => {
    const raw = "token-moss";
    const result = await authenticateToken(
      raw,
      [
        {
          tokenId: "local-agent-moss-archivist",
          prefix: tokenPrefix(raw),
          digest: await tokenDigest(raw),
          worldId: "origin",
          agentId: "agent-moss-archivist",
          scopes: ["agent:read", "agent:write"],
          localSeeded: true,
        },
      ],
      {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        scope: "agent:write",
        now: 1,
        production: false,
      },
    );

    expect(result).toMatchObject({ ok: true, token: { tokenId: "local-agent-moss-archivist" } });
    expect(JSON.stringify(result)).not.toContain(raw);
  });

  it("rejects wrong agent, revoked, and production seeded tokens", async () => {
    const raw = "token-moss";
    const record = {
      tokenId: "local-agent-moss-archivist",
      prefix: tokenPrefix(raw),
      digest: await tokenDigest(raw),
      worldId: "origin",
      agentId: "agent-moss-archivist",
      scopes: ["agent:write"],
      localSeeded: true,
    };

    await expect(
      authenticateToken(raw, [record], {
        worldId: "origin",
        agentId: "agent-firebreak-builder",
        scope: "agent:write",
        now: 1,
        production: false,
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission_denied" });

    await expect(
      authenticateToken(raw, [{ ...record, revokedAt: 1 }], {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        scope: "agent:write",
        now: 2,
        production: false,
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission_denied" });

    await expect(
      authenticateToken(raw, [record], {
        worldId: "origin",
        agentId: "agent-moss-archivist",
        scope: "agent:write",
        now: 1,
        production: true,
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission_denied" });
  });
});
