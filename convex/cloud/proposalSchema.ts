import { defineTable } from "convex/server";
import { v } from "convex/values";
import { objectValue } from "../scene/model";
export const statusValue = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("accepted"),
  v.literal("withdrawn"),
);
export const attributedChange = v.object({
  id: v.string(),
  expectedVersion: v.number(),
  object: v.optional(objectValue),
  contributorId: v.string(),
  contributorName: v.string(),
});
export const proposalTables = {
  sceneProposals: defineTable({
    worldId: v.string(),
    proposalId: v.string(),
    proposerId: v.string(),
    proposerName: v.string(),
    title: v.string(),
    editors: v.array(v.string()),
    revision: v.number(),
    status: statusValue,
    changes: v.array(attributedChange),
    createdAt: v.number(),
    updatedAt: v.number(),
    review: v.optional(
      v.object({
        agentId: v.string(),
        name: v.string(),
        message: v.string(),
        revision: v.number(),
        createdAt: v.number(),
      }),
    ),
    accepted: v.optional(
      v.object({
        agentId: v.string(),
        name: v.string(),
        revision: v.number(),
        changed: v.array(v.object({ id: v.string(), version: v.number() })),
        createdAt: v.number(),
      }),
    ),
  })
    .index("by_proposal", ["worldId", "proposalId"])
    .index("by_room", ["worldId"])
    .index("by_status", ["worldId", "status"])
    .index("by_proposer_status", ["worldId", "proposerId", "status"]),
  sceneProposalReceipts: defineTable({
    worldId: v.string(),
    agentId: v.string(),
    requestId: v.string(),
    payloadHash: v.string(),
    result: v.any(),
  }).index("by_request", ["worldId", "agentId", "requestId"]),
  sceneProposalEvents: defineTable({
    worldId: v.string(),
    sequence: v.number(),
    proposalId: v.optional(v.string()),
    revision: v.optional(v.number()),
    type: v.string(),
    agentId: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_sequence", ["worldId", "sequence"]),
};
