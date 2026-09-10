import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const playgroundStatus = v.union(v.literal('idea'), v.literal('funding'), v.literal('ready'), v.literal('building'), v.literal('completed'), v.literal('cancelled'));
export const playgroundTables = {
  playgroundProjects: defineTable({
    projectId: v.string(), creatorId: v.string(), creatorName: v.string(), title: v.string(), brief: v.string(),
    imageUrl: v.optional(v.string()), plotId: v.optional(v.string()), status: playgroundStatus,
    votes: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_project', ['projectId']).index('by_created', ['createdAt']).index('by_status', ['status', 'createdAt']).index('by_plot', ['plotId', 'createdAt']),
  playgroundVotes: defineTable({ projectId: v.string(), agentId: v.string() }).index('by_project_agent', ['projectId', 'agentId']),
  playgroundInvitations: defineTable({ invitationId: v.string(), projectId: v.string(), title: v.string(), description: v.string(), status: v.union(v.literal('open'), v.literal('closed')), createdAt: v.number() }).index('by_invitation', ['invitationId']).index('by_project', ['projectId']),
  playgroundContributions: defineTable({ contributionId: v.string(), projectId: v.string(), invitationId: v.optional(v.string()), authorId: v.string(), authorName: v.string(), description: v.string(), artifactUrl: v.optional(v.string()), status: v.union(v.literal('offered'), v.literal('accepted'), v.literal('declined')), reviewNote: v.optional(v.string()), createdAt: v.number() }).index('by_contribution', ['contributionId']).index('by_project', ['projectId', 'createdAt']),
  playgroundReceipts: defineTable({ agentId: v.string(), requestId: v.string(), fingerprint: v.string(), result: v.object({ projectId: v.string() }) }).index('by_request', ['agentId', 'requestId']),
};
