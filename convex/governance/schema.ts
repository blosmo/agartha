import { defineTable } from "convex/server";
import { v } from "convex/values";
export const statusValue = v.union(
  ...(
    [
      "draft",
      "open",
      "active",
      "implementation_pending",
      "rejected",
      "superseded",
      "withdrawn",
    ] as const
  ).map((s) => v.literal(s)),
);
export const choiceValue = v.union(
  v.literal("yes"),
  v.literal("no"),
  v.literal("abstain"),
);
const voter = v.object({ agentId: v.string(), name: v.string() });
const rules = v.object({
  charter: v.string(),
  allowedShapes: v.array(v.string()),
  maxObjectScale: v.number(),
});
export const governanceTables = {
  governanceScopes: defineTable({
    scope: v.string(),
    rules: v.union(rules, v.null()),
    rulesVersion: v.number(),
    voterVersion: v.number(),
    voters: v.array(voter),
  }).index("by_scope", ["scope"]),
  governanceProposals: defineTable({
    proposalId: v.string(),
    scope: v.string(),
    revision: v.number(),
    status: statusValue,
    title: v.string(),
    rationale: v.string(),
    change: v.any(),
    author: voter,
    createdAt: v.number(),
    updatedAt: v.number(),
    openedAt: v.union(v.number(), v.null()),
    closesAt: v.union(v.number(), v.null()),
    baseRulesVersion: v.number(),
    eligibleVoters: v.array(voter),
    votingPolicy: v.optional(
      v.union(
        v.object({
          version: v.literal(1),
          quorum: v.number(),
          approval: v.literal("majority"),
        }),
        v.null(),
      ),
    ),
    finalTally: v.optional(
      v.union(
        v.object({
          yes: v.number(),
          no: v.number(),
          abstain: v.number(),
          total: v.number(),
          quorum: v.number(),
          voterCount: v.number(),
          passed: v.boolean(),
        }),
        v.null(),
      ),
    ),
    outcomeReason: v.union(v.string(), v.null()),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_scope", ["scope"])
    .index("by_status", ["scope", "status"])
    .index("by_author_status", ["scope", "author.agentId", "status"])
    .index("by_due", ["status", "closesAt"]),
  governanceBallots: defineTable({
    proposalId: v.string(),
    agentId: v.string(),
    name: v.string(),
    choice: choiceValue,
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_voter", ["proposalId", "agentId"]),
  governanceComments: defineTable({
    proposalId: v.string(),
    author: voter,
    text: v.string(),
    createdAt: v.number(),
  }).index("by_proposal", ["proposalId"]),
  governanceReceipts: defineTable({
    agentId: v.string(),
    requestId: v.string(),
    payloadHash: v.string(),
    result: v.any(),
  }).index("by_request", ["agentId", "requestId"]),
};
