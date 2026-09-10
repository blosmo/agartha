import {internalMutation,internalQuery,type MutationCtx,type QueryCtx} from '../_generated/server';
import {v} from 'convex/values';
import {session,limit} from './common';
import {digest,fail} from '../scene/model';
import {ASSET_TEMPLATE_ID,normalizeAssetTemplate,templateIdentity,normalizeTemplateParameters,type AssetTemplateDefinition} from '../../packages/protocol/src/assetTemplates';
import type {Doc} from '../_generated/dataModel';
const licenses=['CC0-1.0','CC-BY-4.0','MIT'];
function summary(row:Doc<'cloudAssetTemplates'>){return {id:row.templateId,name:row.definition.name,description:row.definition.description,parameterNames:Object.keys(row.definition.parameters),license:row.license,attribution:row.attribution,parentId:row.parentId,author:row.author,createdAt:row.createdAt};}
export async function templateById(ctx:QueryCtx|MutationCtx,id:string){if(!ASSET_TEMPLATE_ID.test(id))fail('invalid','Invalid template ID.');const row=await ctx.db.query('cloudAssetTemplates').withIndex('by_template',q=>q.eq('templateId',id)).unique();if(!row)fail('not_found','Template is not published.');return row;}
export const get=internalQuery({args:{id:v.string()},handler:async(ctx,{id})=>{const row=await templateById(ctx,id);return {...summary(row),parameters:row.definition.parameters,definition:row.definition,review:row.review};}});
export const list=internalQuery({args:{cursor:v.optional(v.string()),q:v.optional(v.string())},handler:async(ctx,{cursor,q})=>{
 if(cursor&&!ASSET_TEMPLATE_ID.test(cursor)||q!==undefined&&q.length>100)fail('invalid','Invalid template search.');
 const rows=await ctx.db.query('cloudAssetTemplates').withIndex('by_template',query=>query.gt('templateId',cursor??'')).take(11),query=(q??'').trim().toLowerCase();
 return {entries:rows.slice(0,10).filter(row=>!query||`${row.definition.name} ${row.definition.description}`.toLowerCase().includes(query)).map(summary),cursor:rows.length>10?rows[9].templateId:null};
}});
export const publish=internalMutation({args:{token:v.string(),definition:v.any(),license:v.string(),attribution:v.string(),review:v.string(),parentId:v.optional(v.string())},handler:async(ctx,args)=>{
 const actor=await session(ctx,args.token);if(!actor)fail('unauthorized','Register before sharing procedural templates.');
 let definition:AssetTemplateDefinition;try{definition=normalizeAssetTemplate(args.definition);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid template.');}
 const license=args.license,attribution=args.attribution.trim().normalize('NFC'),review=args.review.trim();
 if(!licenses.includes(license)||attribution.length>500||license!=='CC0-1.0'&&!attribution||!review||review.length>1500)fail('invalid','Declare the template license, attribution and actual visual review.');
 if(args.parentId){const parent=await templateById(ctx,args.parentId);if(parent.license!=='CC0-1.0'&&(parent.license!==license||!attribution.includes(parent.attribution)))fail('invalid','Preserve the parent template license and attribution.');}
 const templateId='template-'+await digest(templateIdentity({definition,license,attribution,parentId:args.parentId??null}));
 const existing=await ctx.db.query('cloudAssetTemplates').withIndex('by_template',q=>q.eq('templateId',templateId)).unique();if(existing)return {...summary(existing),definition:existing.definition};
 await limit(ctx,`template:${actor.agentId}`,6,60000);
 if((await ctx.db.query('cloudAssetTemplates').withIndex('by_agent',q=>q.eq('agentId',actor.agentId)).take(64)).length>=64)fail('quota','Template library quota reached.');
 const id=await ctx.db.insert('cloudAssetTemplates',{templateId,agentId:actor.agentId,author:actor.name,createdAt:Date.now(),definition,license,attribution,review,...(args.parentId?{parentId:args.parentId}:{})});
 const row=(await ctx.db.get(id))!;return {...summary(row),definition};
}});
export async function validateTemplateInstance(ctx:QueryCtx|MutationCtx,id:string,parameters:unknown){
 const row=await templateById(ctx,id);try{return normalizeTemplateParameters(row.definition,parameters);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid template parameters.');}
}
