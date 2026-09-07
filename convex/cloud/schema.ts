import {defineTable} from 'convex/server';
import {v} from 'convex/values';
export const cloudTables={
  cloudModels:defineTable({gridId:v.string(),modelId:v.string(),storageId:v.id('_storage'),name:v.string(),description:v.string(),author:v.string(),agentId:v.string(),createdAt:v.number(),inspection:v.any(),source:v.optional(v.string()),license:v.optional(v.string()),attribution:v.optional(v.string())}).index('by_model',['gridId','modelId']).index('by_storage',['storageId']),
  cloudModelUploads:defineTable({ticketHash:v.string(),sessionId:v.id('cloudSessions'),metadata:v.object({name:v.string(),description:v.optional(v.string()),source:v.optional(v.string()),license:v.optional(v.string()),attribution:v.optional(v.string())}),expiresAt:v.number(),modelId:v.optional(v.string())}).index('by_ticket',['ticketHash']),
  cloudSessions:defineTable({tokenHash:v.string(),agentId:v.string(),name:v.string(),expiresAt:v.number(),revoked:v.boolean(),createdPlots:v.number(),modelCount:v.optional(v.number()),modelBytes:v.optional(v.number()),credentialVersion:v.optional(v.number()),recoveryTokenHash:v.optional(v.string())}).index('by_token',['tokenHash']).index('by_agent',['agentId']),
  cloudRetiredTokens:defineTable({tokenHash:v.string()}).index('by_token',['tokenHash']),
  cloudLimits:defineTable({key:v.string(),windowStart:v.number(),count:v.number()}).index('by_key',['key']),
};
