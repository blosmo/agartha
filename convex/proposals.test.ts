import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { expect, it } from "vitest";
import schema from "./schema";
const modules = import.meta.glob("./**/*.{ts,js}"),
  api = anyApi.cloud.proposals,
  id = "plot-2-2",
  owner = "1".repeat(64),
  builder = "2".repeat(64),
  editor = "3".repeat(64);
const object = (id: string) => ({
  id,
  name: id,
  shape: "box" as const,
  position: [0, 1, 0],
  scale: [1, 1, 1],
  color: "#aabbcc",
});
async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const actors = [];
  for (const [token, name] of [
    [owner, "Owner"],
    [builder, "Builder"],
    [editor, "Editor"],
  ])
    actors.push(
      await t.mutation(anyApi.cloud.session.register, {
        token,
        name,
        ipHash: name,
      }),
    );
  await t.mutation(anyApi.cloud.write.createPlot, {
    token: owner,
    x: 2,
    z: 2,
    name: "Room",
  });
  return { t, actors };
}
it("accepts the exact shared revision once and credits its actual contributor", async () => {
  const { t, actors } = await setup();
  let p = await t.mutation(api.create, {
    id,
    token: builder,
    requestId: "create",
    title: "Build",
    editors: [actors[2].agentId],
  });
  p = await t.mutation(api.edit, {
    id,
    token: editor,
    proposalId: p.proposalId,
    requestId: "edit",
    expectedRevision: p.revision,
    changes: [{ id: "stone", expectedVersion: 0, object: object("stone") }],
  });
  expect(p.changes[0].contributorId).toBe(actors[2].agentId);
  p = await t.mutation(api.transition, {
    id,
    token: builder,
    proposalId: p.proposalId,
    requestId: "submit",
    expectedRevision: p.revision,
    action: "submit",
  });
  const args = {
    id,
    token: owner,
    proposalId: p.proposalId,
    requestId: "accept",
    expectedRevision: p.revision,
    action: "accept",
  };
  const accepted = await t.mutation(api.transition, args);
  expect(accepted.status).toBe("accepted");
  expect(await t.mutation(api.transition, args)).toEqual(accepted);
  const row = await t.run((ctx) => ctx.db.query("sceneObjects").first());
  expect(row?.owner).toBe(actors[2].agentId);
  await expect(
    t.mutation(api.transition, { ...args, message: "Different" }),
  ).rejects.toThrow("Request ID");
});
it("enforces owner roles, revision conflicts and editor removal", async () => {
  const { t, actors } = await setup();
  const p = await t.mutation(api.create, {
    id,
    token: builder,
    requestId: "create",
    title: "Build",
    editors: [actors[2].agentId],
  });
  await expect(
    t.mutation(api.setOwner, {
      id,
      token: builder,
      requestId: "steal",
      expectedVersion: 1,
      agentId: actors[1].agentId,
      owner: true,
    }),
  ).rejects.toThrow("owner");
  await expect(
    t.mutation(api.setOwner, {
      id,
      token: owner,
      requestId: "remove",
      expectedVersion: 1,
      agentId: actors[0].agentId,
      owner: false,
    }),
  ).rejects.toThrow("last");
  await t.mutation(api.edit, {
    id,
    token: builder,
    proposalId: p.proposalId,
    requestId: "remove-editor",
    expectedRevision: 1,
    editors: [],
  });
  await expect(
    t.mutation(api.edit, {
      id,
      token: editor,
      proposalId: p.proposalId,
      requestId: "edit",
      expectedRevision: 2,
      title: "No",
    }),
  ).rejects.toThrow("editor");
  await expect(
    t.mutation(api.edit, {
      id,
      token: builder,
      proposalId: p.proposalId,
      requestId: "stale",
      expectedRevision: 1,
      title: "No",
    }),
  ).rejects.toThrow("revision");
});
it("accepts disjoint proposals, preserves original ownership, and rolls back stale batches", async () => {
  const { t, actors } = await setup();
  async function submitted(requestId: string, changes: unknown[]) {
    let p = await t.mutation(api.create, {
      id,
      token: builder,
      requestId,
      title: requestId,
      changes,
    });
    return t.mutation(api.transition, {
      id,
      token: builder,
      proposalId: p.proposalId,
      requestId: `s-${requestId}`,
      expectedRevision: p.revision,
      action: "submit",
    });
  }
  const a = await submitted("a", [
      { id: "a", expectedVersion: 0, object: object("a") },
    ]),
    b = await submitted("b", [
      { id: "b", expectedVersion: 0, object: object("b") },
    ]);
  for (const p of [a, b])
    await t.mutation(api.transition, {
      id,
      token: owner,
      proposalId: p.proposalId,
      requestId: `accept-${p.title}`,
      expectedRevision: p.revision,
      action: "accept",
    });
  const stale = await submitted("stale", [
    { id: "new", expectedVersion: 0, object: object("new") },
    { id: "a", expectedVersion: 0, object: object("a") },
  ]);
  await expect(
    t.mutation(api.transition, {
      id,
      token: owner,
      proposalId: stale.proposalId,
      requestId: "accept-stale",
      expectedRevision: stale.revision,
      action: "accept",
    }),
  ).rejects.toThrow("changed");
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("sceneObjects")
        .withIndex("by_object", (q) =>
          q.eq("worldId", "public-plot-2-2").eq("objectId", "new"),
        )
        .unique(),
    ),
  ).toBeNull();
  let p = await t.mutation(api.create, {
    id,
    token: editor,
    requestId: "modify",
    title: "modify",
    changes: [
      {
        id: "a",
        expectedVersion: 1,
        object: { ...object("a"), color: "#ffffff" },
      },
    ],
  });
  p = await t.mutation(api.transition, {
    id,
    token: editor,
    proposalId: p.proposalId,
    requestId: "s-modify",
    expectedRevision: p.revision,
    action: "submit",
  });
  await t.mutation(api.transition, {
    id,
    token: owner,
    proposalId: p.proposalId,
    requestId: "accept-modify",
    expectedRevision: p.revision,
    action: "accept",
  });
  expect(
    (
      await t.run((ctx) =>
        ctx.db
          .query("sceneObjects")
          .withIndex("by_object", (q) =>
            q.eq("worldId", "public-plot-2-2").eq("objectId", "a"),
          )
          .unique(),
      )
    )?.owner,
  ).toBe(actors[1].agentId);
});
it("charges contributor quota and retains owner review after edits", async () => {
  const { t, actors } = await setup();
  let p = await t.mutation(api.create, {
    id,
    token: builder,
    requestId: "create",
    title: "Build",
    changes: [{ id: "a", expectedVersion: 0, object: object("a") }],
  });
  p = await t.mutation(api.transition, {
    id,
    token: builder,
    proposalId: p.proposalId,
    requestId: "submit",
    expectedRevision: p.revision,
    action: "submit",
  });
  p = await t.mutation(api.transition, {
    id,
    token: owner,
    proposalId: p.proposalId,
    requestId: "review",
    expectedRevision: p.revision,
    action: "request_changes",
    message: "Change the color",
  });
  p = await t.mutation(api.edit, {
    id,
    token: builder,
    proposalId: p.proposalId,
    requestId: "edit",
    expectedRevision: p.revision,
    title: "Revised",
  });
  expect(p.review.message).toBe("Change the color");
  p = await t.mutation(api.transition, {
    id,
    token: builder,
    proposalId: p.proposalId,
    requestId: "resubmit",
    expectedRevision: p.revision,
    action: "submit",
  });
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("sceneAgents")
      .withIndex("by_agent", (q) =>
        q.eq("worldId", "public-plot-2-2").eq("agentId", actors[1].agentId),
      )
      .unique();
    await ctx.db.patch(member!._id, { liveObjects: 1000 });
  });
  await expect(
    t.mutation(api.transition, {
      id,
      token: owner,
      proposalId: p.proposalId,
      requestId: "accept",
      expectedRevision: p.revision,
      action: "accept",
    }),
  ).rejects.toThrow("quota");
  expect(
    (await t.query(api.get, { id, proposalId: p.proposalId })).status,
  ).toBe("submitted");
});
it("prevents the derived scene revoke route from bypassing owner protection", async () => {
  const { t, actors } = await setup();
  const member = await t.mutation(anyApi.cloud.session.member, {
    id,
    token: owner,
  });
  await expect(
    t.mutation(anyApi.scene.authority.revoke, {
      worldId: member.worldId,
      token: member.token,
      agentId: actors[0].agentId,
    }),
  ).rejects.toThrow("owner");
});
it("rejects inactive contributor sessions at acceptance and rolls back objects", async () => {
  const { t, actors } = await setup();
  let p = await t.mutation(api.create, {
    id,
    token: builder,
    requestId: "create",
    title: "Build",
    changes: [{ id: "a", expectedVersion: 0, object: object("a") }],
  });
  p = await t.mutation(api.transition, {
    id,
    token: builder,
    proposalId: p.proposalId,
    requestId: "submit",
    expectedRevision: p.revision,
    action: "submit",
  });
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query("cloudSessions")
      .filter((q) => q.eq(q.field("agentId"), actors[1].agentId))
      .unique();
    await ctx.db.patch(s!._id, { revoked: true });
  });
  await expect(
    t.mutation(api.transition, {
      id,
      token: owner,
      proposalId: p.proposalId,
      requestId: "accept",
      expectedRevision: p.revision,
      action: "accept",
    }),
  ).rejects.toThrow("inactive");
  expect(await t.run((ctx) => ctx.db.query("sceneObjects").first())).toBeNull();
});
it("bounds feed pages and authenticates readers without requiring membership", async () => {
  const { t } = await setup();
  const p = await t.mutation(api.create, {
    id,
    token: builder,
    requestId: "create",
    title: "Build",
  });
  expect((await t.query(api.list, { id })).page[0].proposalId).toBe(
    p.proposalId,
  );
  const first = await t.query(api.feed, { id });
  expect(first.events[0].type).toBe("created");
  expect(
    (await t.query(api.feed, { id, after: first.nextSequence })).events,
  ).toEqual([]);
  await expect(
    t.query(api.get, { id, token: "invalid", proposalId: p.proposalId }),
  ).rejects.toThrow("credential");
  await t.run(async (ctx) => {
    const room = await ctx.db.query("sceneWorlds").first();
    await ctx.db.patch(room!._id, { archivedAt: Date.now() });
  });
  await expect(t.query(api.list, { id })).rejects.toThrow("archived");
});
it("allows internal initial owner assignment only on an ownerless seed room", async () => {
  const { t, actors } = await setup();
  await expect(
    t.mutation(api.assignInitialOwner, {
      id,
      agentId: actors[1].agentId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("owner");
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("sceneAgents")
      .withIndex("by_agent", (q) =>
        q.eq("worldId", "public-plot-2-2").eq("agentId", actors[0].agentId),
      )
      .unique();
    await ctx.db.patch(row!._id, { canCurate: false });
  });
  const result = await t.mutation(api.assignInitialOwner, {
    id,
    agentId: actors[1].agentId,
    expectedVersion: 1,
  });
  expect(result.version).toBe(2);
  expect((await t.query(api.owners, { id })).owners[0].agentId).toBe(
    actors[1].agentId,
  );
});
it("allows adding registered owners and prevents stale owner writes", async () => {
  const { t, actors } = await setup();
  await t.mutation(api.setOwner, {
    id,
    token: owner,
    requestId: "add-owner",
    expectedVersion: 1,
    agentId: actors[1].agentId,
    owner: true,
  });
  await expect(
    t.mutation(api.setOwner, {
      id,
      token: owner,
      requestId: "stale-owner",
      expectedVersion: 1,
      agentId: actors[0].agentId,
      owner: false,
    }),
  ).rejects.toThrow("version");
  await t.mutation(api.setOwner, {
    id,
    token: builder,
    requestId: "remove-old",
    expectedVersion: 2,
    agentId: actors[0].agentId,
    owner: false,
  });
  expect((await t.query(api.owners, { id })).owners).toEqual([
    { agentId: actors[1].agentId, name: "Builder" },
  ]);
});
it("rejects promotion of a revoked identity with existing room membership", async () => {
  const { t, actors } = await setup();
  await t.mutation(anyApi.cloud.session.member, { id, token: builder });
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query("cloudSessions")
      .withIndex("by_agent", (q) => q.eq("agentId", actors[1].agentId))
      .unique();
    await ctx.db.patch(s!._id, { revoked: true });
  });
  await expect(
    t.mutation(api.setOwner, {
      id,
      token: owner,
      requestId: "promote-revoked",
      expectedVersion: 1,
      agentId: actors[1].agentId,
      owner: true,
    }),
  ).rejects.toThrow("registered");
});
it("caps total open proposals at twenty regardless of their draft/submitted mix", async () => {
  const { t, actors } = await setup();
  await t.run(async (ctx) => {
    for (let n = 0; n < 19; n++)
      await ctx.db.insert("sceneProposals", {
        worldId: "public-plot-2-2",
        proposalId: `seed-${n}`,
        proposerId: actors[1].agentId,
        proposerName: "Builder",
        title: "Draft",
        editors: [],
        revision: 1,
        status: n < 15 ? "draft" : "submitted",
        changes: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  const last = await t.mutation(api.create, {
    id,
    token: builder,
    requestId: "twentieth",
    title: "Last open proposal",
  });
  await expect(
    t.mutation(api.create, {
      id,
      token: builder,
      requestId: "twenty-first",
      title: "Over limit",
    }),
  ).rejects.toThrow("twenty open");
  await t.mutation(api.transition, {
    id,
    token: builder,
    proposalId: last.proposalId,
    requestId: "withdraw-last",
    expectedRevision: last.revision,
    action: "withdraw",
  });
  expect(
    (
      await t.mutation(api.create, {
        id,
        token: builder,
        requestId: "replacement",
        title: "Replacement",
      })
    ).status,
  ).toBe("draft");
});
