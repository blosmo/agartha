import {defineTable} from 'convex/server';
import {v} from 'convex/values';
import {objectValue} from '../scene/model';
const savedRow=v.object({rowId:v.id('sceneObjects'),objectId:v.string(),owner:v.string(),author:v.optional(v.string()),version:v.number(),region:v.string(),object:objectValue});
export const starterTables={
  starterReceipts:defineTable({worldId:v.string(),catalogId:v.string(),payloadHash:v.string(),before:v.array(savedRow),beforeBrief:v.string(),beforeSnapshot:v.any(),postVersion:v.string(),postRowsHash:v.string(),createdAt:v.number(),rolledBackVersion:v.optional(v.string())}).index('by_catalog',['worldId','catalogId']),
};
