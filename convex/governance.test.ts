import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { expect, it } from "vitest";
import schema from "./schema";
import { createWorld } from "../apps/web/src/worlds/world";
const modules = import.meta.glob("./**/*.{ts,js}"),
  m = anyApi.governance.mutations,
  q = anyApi.governance.queries;
async function setup() {
  const t = convexTest({ schema, modules });
  const token = "a".repeat(64);
  await t.mutation(anyApi.cloud.write.bootstrapPlot, { world: createWorld() });
  const a = await t.mutation(anyApi.cloud.session.register, {
    token,
    name: "Owner",
    ipHash: "ip",
  });
  await t.mutation(anyApi.cloud.proposals.assignInitialOwner, {
    id: "the-commons",
    agentId: a.agentId,
    expectedVersion: 1,
  });
  return { t, token, a };
}
it("freezes voting, replays exact requests, and atomically enacts world rules after the deadline", async () => {
  const { t, token } = await setup();
  const args = {
    token,
    scope: "world:the-commons",
    requestId: "create",
    title: "Smaller objects",
    rationale: "Leave room",
    change: { kind: "world_rules", rules: { maxObjectScale: 10 } },
  };
  const p = await t.mutation(m.create, args);
  expect(await t.mutation(m.create, args)).toEqual(p);
  await expect(
    t.mutation(m.create, { ...args, title: "Different" }),
  ).rejects.toThrow("Request");
  const opened = await t.mutation(m.open, {
    token,
    proposalId: p.id,
    expectedRevision: 1,
    requestId: "open",
    votingHours: 1,
  });
  expect(opened.eligibleVoters).toHaveLength(1);
  await expect(
    t.mutation(m.update, {
      token,
      proposalId: p.id,
      expectedRevision: 1,
      requestId: "edit",
      title: "Changed",
    }),
  ).rejects.toThrow();
  await t.mutation(m.vote, {
    token,
    proposalId: p.id,
    expectedRevision: 2,
    expectedBallotVersion: 0,
    choice: "yes",
    requestId: "vote",
  });
  await expect(
    t.mutation(m.finalize, {
      token,
      proposalId: p.id,
      expectedRevision: 2,
      requestId: "early",
    }),
  ).rejects.toThrow("deadline");
  await t.run(async (ctx) => {
    const row = await ctx.db.query("governanceProposals").first();
    await ctx.db.patch(row!._id, { closesAt: Date.now() - 1 });
  });
  const done = await t.mutation(m.finalize, {
    token,
    proposalId: p.id,
    expectedRevision: 2,
    requestId: "finish",
  });
  expect(done.status).toBe("active");
  expect(
    (await t.query(q.overview, { scope: args.scope })).rules.maxObjectScale,
  ).toBe(10);
});
async function draft(
  t: ReturnType<typeof convexTest>,
  token: string,
  id: string,
  scope = "world:the-commons",
) {
  return t.mutation(m.create, {
    token,
    scope,
    requestId: `create-${id}`,
    title: "A rule",
    rationale: "Useful",
    change:
      scope === "software"
        ? {
            kind: "software",
            rule: "Improve search",
            implementation: "Build search",
            acceptanceCriteria: ["Find a room"],
          }
        : { kind: "world_rules", rules: { charter: id } },
  });
}
async function opening(
  t: ReturnType<typeof convexTest>,
  token: string,
  id: string,
) {
  const p = await draft(t, token, id);
  return t.mutation(m.open, {
    token,
    proposalId: p.id,
    expectedRevision: 1,
    requestId: `open-${id}`,
    votingHours: 1,
  });
}
async function due(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    for (const p of await ctx.db.query("governanceProposals").collect())
      if (p.status === "open")
        await ctx.db.patch(p._id, { closesAt: Date.now() - 1 });
  });
}
it("keeps electorate frozen and voting separate from world ownership, with ballot versions and revoked membership checks", async () => {
  const { t, token, a } = await setup();
  const other = "b".repeat(64),
    b = await t.mutation(anyApi.cloud.session.register, {
      token: other,
      name: "Guest",
      ipHash: "guest",
    });
  const p = await opening(t, token, "frozen");
  await expect(
    t.mutation(m.setVoter, {
      scope: p.scope,
      token: other,
      expectedVersion: 0,
      agentId: b.agentId,
      enabled: true,
      requestId: "spoof",
    }),
  ).rejects.toThrow("owners");
  await t.mutation(m.setVoter, {
    scope: p.scope,
    token,
    expectedVersion: 0,
    agentId: b.agentId,
    enabled: true,
    requestId: "add",
  });
  await expect(
    t.mutation(m.vote, {
      token: other,
      proposalId: p.id,
      expectedRevision: 2,
      expectedBallotVersion: 0,
      choice: "yes",
      requestId: "ineligible",
    }),
  ).rejects.toThrow("electorate");
  const ballot = {
    token,
    proposalId: p.id,
    expectedRevision: 2,
    expectedBallotVersion: 0,
    choice: "no",
    requestId: "first",
  };
  await t.mutation(m.vote, ballot);
  await expect(
    t.mutation(m.vote, { ...ballot, requestId: "stale" }),
  ).rejects.toThrow("Ballot version");
  const changed = await t.mutation(m.vote, {
    ...ballot,
    expectedBallotVersion: 1,
    choice: "yes",
    requestId: "changed",
  });
  expect(changed.ballots).toHaveLength(1);
  expect(changed.ballots[0].version).toBe(2);
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("sceneAgents")
      .withIndex("by_agent", (q) =>
        q.eq("worldId", "public-the-commons").eq("agentId", a.agentId),
      )
      .unique();
    await ctx.db.patch(member!._id, { revoked: true });
  });
  await expect(
    t.mutation(m.comment, {
      token,
      proposalId: p.id,
      requestId: "revoked",
      text: "No",
    }),
  ).rejects.toThrow("revoked");
  expect(
    (await t.query(q.proposal, { proposalId: p.id })).ballots[0].choice,
  ).toBe("yes");
});
it("closes conflicting and archived world proposals without starving cron", async () => {
  const { t, token } = await setup();
  const one = await opening(t, token, "first"),
    two = await opening(t, token, "second");
  for (const p of [one, two])
    await t.mutation(m.vote, {
      token,
      proposalId: p.id,
      expectedRevision: 2,
      expectedBallotVersion: 0,
      choice: "yes",
      requestId: `yes-${p.id}`,
    });
  await due(t);
  expect(await t.mutation(m.finalizeDue, {})).toEqual({ finalized: 2 });
  expect((await t.query(q.proposal, { proposalId: one.id })).status).toBe(
    "active",
  );
  expect((await t.query(q.proposal, { proposalId: two.id })).status).toBe(
    "superseded",
  );
  const three = await opening(t, token, "third");
  await t.run(async (ctx) => {
    const room = await ctx.db.query("sceneWorlds").first();
    await ctx.db.patch(room!._id, { archivedAt: Date.now() });
  });
  await due(t);
  await t.mutation(m.finalizeDue, {});
  expect((await t.query(q.proposal, { proposalId: three.id })).status).toBe(
    "rejected",
  );
});
it("requires operator roster configuration and produces only pending software implementation packets", async () => {
  const { t, token, a } = await setup();
  const p = await draft(t, token, "software", "software");
  await expect(
    t.mutation(m.open, {
      token,
      proposalId: p.id,
      expectedRevision: 1,
      requestId: "not-ready",
    }),
  ).rejects.toThrow("Configure");
  const { vi } = await import("vitest");
  vi.stubEnv(
    "AGARTHA_SCENE_OPERATOR_TOKEN",
    "operator-test-token-at-least-thirty-two-characters",
  );
  try {
    await expect(
      t.mutation(anyApi.governance.admin.setSoftwareVoters, {
        operatorToken: "wrong",
        expectedVersion: 0,
        agentIds: [a.agentId],
      }),
    ).rejects.toThrow("operator");
    await t.mutation(anyApi.governance.admin.setSoftwareVoters, {
      operatorToken: "operator-test-token-at-least-thirty-two-characters",
      expectedVersion: 0,
      agentIds: [a.agentId],
    });
    await t.mutation(m.open, {
      token,
      proposalId: p.id,
      expectedRevision: 1,
      requestId: "open-software",
    });
    await t.mutation(m.vote, {
      token,
      proposalId: p.id,
      expectedRevision: 2,
      expectedBallotVersion: 0,
      choice: "yes",
      requestId: "yes-software",
    });
    await due(t);
    await t.mutation(m.finalizeDue, {});
    const done = await t.query(q.proposal, { proposalId: p.id });
    expect(done.status).toBe("implementation_pending");
    expect(done.implementation.repository).toBe(
      "https://github.com/blosmo/agartha",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
it("paginates discussion, binds receipts across scopes, and blocks expired credentials", async () => {
  const { t, token } = await setup();
  const p = await draft(t, token, "discussion");
  for (let i = 0; i < 11; i++)
    await t.mutation(m.comment, {
      token,
      proposalId: p.id,
      requestId: `comment-${i}`,
      text: `Comment ${i}`,
    });
  const first = await t.query(q.comments, { proposalId: p.id });
  expect(first.page).toHaveLength(10);
  expect(first.isDone).toBe(false);
  const second = await t.query(q.comments, {
    proposalId: p.id,
    cursor: first.continueCursor,
  });
  expect(second.page).toHaveLength(1);
  await expect(
    t.mutation(m.create, {
      token,
      scope: "software",
      requestId: "comment-0",
      title: "Other",
      rationale: "Other",
      change: {},
    }),
  ).rejects.toThrow("Request");
  await t.run(async (ctx) => {
    const actor = await ctx.db.query("cloudSessions").first();
    await ctx.db.patch(actor!._id, { expiresAt: Date.now() - 1 });
  });
  await expect(
    t.mutation(m.comment, {
      token,
      proposalId: p.id,
      requestId: "expired",
      text: "No",
    }),
  ).rejects.toThrow("expired");
});
it("rejects no-op world proposals before opening and rejects abstention-only outcomes", async () => {
  const { t, token } = await setup();
  await expect(
    t.mutation(m.create, {
      token,
      scope: "world:the-commons",
      requestId: "noop",
      title: "No change",
      rationale: "No change",
      change: { kind: "world_rules", rules: { maxObjectScale: 60 } },
    }),
  ).rejects.toThrow("change current");
  const p = await opening(t, token, "abstain");
  await t.mutation(m.vote, {
    token,
    proposalId: p.id,
    expectedRevision: 2,
    expectedBallotVersion: 0,
    requestId: "abstain",
    choice: "abstain",
  });
  await due(t);
  await t.mutation(m.finalizeDue, {});
  expect((await t.query(q.proposal, { proposalId: p.id })).status).toBe(
    "rejected",
  );
});
it("enforces scope rate limits while successful replay consumes no further quota", async () => {
  const { t, token } = await setup();
  const p = await draft(t, token, "rate");
  const first = {
    token,
    proposalId: p.id,
    requestId: "replay-comment",
    text: "First",
  };
  await t.mutation(m.comment, first);
  for (let i = 0; i < 10; i++)
    await t.mutation(m.comment, { ...first, requestId: `rate-${i}` });
  expect(await t.mutation(m.comment, first)).toMatchObject({ text: "First" });
  await expect(
    t.mutation(m.comment, { ...first, requestId: "too-many" }),
  ).rejects.toThrow("limit");
});
it("rejects roster conflicts and last-voter removal and keeps added voters from becoming owners", async () => {
  const { t, token, a } = await setup();
  const b = await t.mutation(anyApi.cloud.session.register, {
    token: "c".repeat(64),
    name: "Voter",
    ipHash: "voter",
  });
  const args = {
    token,
    scope: "world:the-commons",
    expectedVersion: 0,
    agentId: a.agentId,
    enabled: false,
    requestId: "last",
  };
  await expect(t.mutation(m.setVoter, args)).rejects.toThrow("1–64");
  await t.mutation(m.setVoter, {
    ...args,
    agentId: b.agentId,
    enabled: true,
    requestId: "add",
  });
  await expect(
    t.mutation(m.setVoter, { ...args, requestId: "stale-roster" }),
  ).rejects.toThrow("version");
  const overview = await t.query(q.overview, {
    scope: args.scope,
    token: "c".repeat(64),
  });
  expect(overview.permissions.eligibleToVote).toBe(true);
  expect(overview.permissions.canManageVoters).toBe(false);
});
it("rejects a tied ballot and a vote below the frozen quorum", async () => {
  for (const tie of [false, true]) {
    const { t, token } = await setup();
    const others = [];
    for (let i = 0; i < 3; i++) {
      const other = String(i + 1).repeat(64),
        agent = await t.mutation(anyApi.cloud.session.register, {
          token: other,
          name: `Voter ${i}`,
          ipHash: `voter-${i}`,
        });
      await t.mutation(m.setVoter, {
        token,
        scope: "world:the-commons",
        expectedVersion: i,
        agentId: agent.agentId,
        enabled: true,
        requestId: `roster-${i}`,
      });
      others.push(other);
    }
    const p = await opening(t, token, `quorum-${tie}`);
    await t.mutation(m.vote, {
      token,
      proposalId: p.id,
      expectedRevision: 2,
      expectedBallotVersion: 0,
      choice: "yes",
      requestId: "yes",
    });
    if (tie)
      await t.mutation(m.vote, {
        token: others[0],
        proposalId: p.id,
        expectedRevision: 2,
        expectedBallotVersion: 0,
        choice: "no",
        requestId: "no",
      });
    await due(t);
    await t.mutation(m.finalizeDue, {});
    const done = await t.query(q.proposal, { proposalId: p.id });
    expect(done.status).toBe("rejected");
    expect(done.tally.quorum).toBe(2);
  }
});
it("freezes the v1 policy at opening and preserves the settled tally independently of later data changes", async () => {
  const { t, token } = await setup();
  const p = await opening(t, token, "policy");
  expect(p.votingPolicy).toEqual({
    version: 1,
    quorum: 1,
    approval: "majority",
  });
  expect(p.finalTally).toBeNull();
  await t.mutation(m.vote, {
    token,
    proposalId: p.id,
    expectedRevision: 2,
    expectedBallotVersion: 0,
    choice: "yes",
    requestId: "policy-yes",
  });
  await due(t);
  await t.mutation(m.finalizeDue, {});
  const done = await t.query(q.proposal, { proposalId: p.id });
  expect(done.finalTally).toEqual(done.tally);
  await t.run(async (ctx) => {
    const ballot = await ctx.db.query("governanceBallots").first();
    await ctx.db.patch(ballot!._id, { choice: "no" });
  });
  const history = await t.query(q.proposal, { proposalId: p.id });
  expect(history.tally).toEqual(done.finalTally);
  expect(history.status).toBe("active");
});
it("uses the persisted quorum rather than recalculating it during settlement", async () => {
  const { t, token } = await setup();
  const p = await opening(t, token, "saved-quorum");
  await t.mutation(m.vote, {
    token,
    proposalId: p.id,
    expectedRevision: 2,
    expectedBallotVersion: 0,
    choice: "yes",
    requestId: "saved-quorum-yes",
  });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("governanceProposals").first();
    await ctx.db.patch(row!._id, {
      votingPolicy: { version: 1, quorum: 2, approval: "majority" },
    });
  });
  expect((await t.query(q.proposal, { proposalId: p.id })).tally.quorum).toBe(
    2,
  );
  await due(t);
  await t.mutation(m.finalizeDue, {});
  expect((await t.query(q.proposal, { proposalId: p.id })).status).toBe(
    "rejected",
  );
});
