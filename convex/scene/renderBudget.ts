import type {MutationCtx} from '../_generated/server';
import {sceneCost,assertRoomRenderBudget,ROOM_RENDER_LIMITS} from '../../packages/protocol/src/geometry/sceneBudget';
import type {SceneObject} from './model';
import {fail} from './model';
import {modelById} from '../cloud/models';
export async function recordMeshCost(ctx:MutationCtx,gridId:string,id:string,definition:{kind:string;geometry?:{indices:number[]}}){
 if(definition.kind!=='mesh'||!definition.geometry)return;
 const existing=await ctx.db.query('sceneMeshCosts').withIndex('by_mesh',q=>q.eq('gridId',gridId).eq('meshId',id)).unique();
 if(!existing)await ctx.db.insert('sceneMeshCosts',{gridId,meshId:id,triangles:definition.geometry.indices.length/3});
}
export async function validateRenderBudget(ctx:MutationCtx,worldId:string,changes:readonly {id:string;object?:SceneObject}[]){
 const world=await ctx.db.query('sceneWorlds').withIndex('by_world',q=>q.eq('worldId',worldId)).unique();if(!world?.gridId)return;
 const rows=await ctx.db.query('sceneObjects').withIndex('by_region',q=>q.eq('worldId',worldId).eq('region','0:0').eq('deleted',false)).take(ROOM_RENDER_LIMITS.objects+1);
 if(rows.length>ROOM_RENDER_LIMITS.objects){
  if(changes.every(change=>!change.object))return;
  fail('quota','This room exceeds its object budget. Remove excess objects before adding work.');
 }
 const previous=rows.flatMap(row=>row.object?[row.object]:[]),next=new Map(previous.map(object=>[object.id,object]));for(const change of changes){if(change.object)next.set(change.id,change.object);else next.delete(change.id);}
 const objects=[...next.values()],meshIds=[...new Set([...previous,...objects].flatMap(object=>object.meshId?[object.meshId]:[]))],modelIds=[...new Set([...previous,...objects].flatMap(object=>object.modelId?[object.modelId]:[]))];
 const geometry=new Map<string,{triangles:number;draws?:number}>();
 for(const id of meshIds){let cost=await ctx.db.query('sceneMeshCosts').withIndex('by_mesh',q=>q.eq('gridId',world.gridId!).eq('meshId',id)).unique();if(!cost){const entry=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',world.gridId!).eq('libraryId',id)).unique();if(!entry||entry.definition.kind!=='mesh')fail('invalid','Mesh is unavailable.');await recordMeshCost(ctx,world.gridId,id,entry.definition);geometry.set(id,{triangles:entry.definition.geometry.indices.length/3});}else geometry.set(id,{triangles:cost.triangles});}
 for(const id of modelIds){const model=await modelById(ctx,id,world.gridId);geometry.set(id,{triangles:model.inspection.triangles,draws:model.inspection.draws});}
 try{assertRoomRenderBudget(sceneCost(objects,geometry),sceneCost(previous,geometry));}catch(error){fail('quota',error instanceof Error?error.message:'Room rendering budget exceeded.');}
}
