import {defineTable} from 'convex/server';
import {v} from 'convex/values';
export const artifactValue=v.object({sha256:v.string(),bytes:v.number()});
export const assetMetadataValue=v.object({name:v.string(),description:v.optional(v.string()),license:v.optional(v.string()),attribution:v.optional(v.string()),parentId:v.optional(v.string())});
export const artifactRoleValue=v.union(v.literal('source'),v.literal('preview'));
const identity={bundleId:v.string(),agentId:v.string(),modelId:v.string(),metadata:assetMetadataValue,source:artifactValue,preview:artifactValue};
export const assetTables={
 cloudAssets:defineTable({...identity,author:v.string(),createdAt:v.number(),sourceId:v.id('_storage'),previewId:v.id('_storage')}).index('by_bundle',['bundleId']).index('by_agent',['agentId']).index('by_source',['sourceId']).index('by_preview',['previewId']),
 cloudAssetUploads:defineTable({...identity,ticketHash:v.string(),sessionId:v.id('cloudSessions'),credentialHash:v.string(),expiresAt:v.number(),finalized:v.boolean(),sourceId:v.optional(v.id('_storage')),previewId:v.optional(v.id('_storage'))}).index('by_ticket',['ticketHash']).index('by_agent',['agentId','expiresAt']).index('by_expiry',['expiresAt']).index('by_source',['sourceId']).index('by_preview',['previewId']),
};
