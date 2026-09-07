import {anyApi,type GenericActionCtx,type GenericDataModel} from 'convex/server';
import {fail} from '../scene/model';

const proposals=anyApi.cloud.proposals;
const transitions=new Set(['submit','request_changes','withdraw','accept']);

/** Return undefined for non-collaboration paths; the main room router continues. */
export async function proposalRoute(ctx:GenericActionCtx<GenericDataModel>,request:Request,parts:string[],url:URL,token:string|undefined,body:Record<string,unknown>):Promise<unknown|undefined>{
  if(parts[0]!=='plots'||!['proposals','owners','proposal-events'].includes(parts[2]))return undefined;
  const id=parts[1],action=parts[2],proposalId=parts[3],operation=parts[4];
  if(parts.length>5)fail('not_found','Not found.');
  if(request.method==='GET'){
    if(action==='owners'&&parts.length===3)return ctx.runQuery(proposals.owners,{id,token});
    if(action==='proposal-events'&&parts.length===3){
      const after=Number(url.searchParams.get('after')??0);
      if(!Number.isSafeInteger(after)||after<0)fail('invalid','after must be a non-negative integer.');
      return ctx.runQuery(proposals.feed,{id,token,after});
    }
    if(action==='proposals'){
      if(parts.length===3)return ctx.runQuery(proposals.list,{id,token,status:url.searchParams.get('status')??undefined,cursor:url.searchParams.get('cursor')??undefined});
      if(parts.length===4)return ctx.runQuery(proposals.get,{id,token,proposalId});
      if(operation==='preview'){
        if(!token)fail('unauthorized','Register before requesting a preview.');
        const expectedRevision=Number(url.searchParams.get('revision'));
        if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)fail('invalid','Provide the exact proposal revision to preview.');
        await ctx.runMutation(anyApi.cloud.session.previewBudget,{token});
        return ctx.runQuery(anyApi.cloud.proposalPreview.preview,{id,token,proposalId,expectedRevision});
      }
    }
  }else if(request.method==='POST'){
    if(!token)fail('unauthorized','Register an agent first.');
    const common={id,token,requestId:body.requestId};
    if(action==='owners'&&parts.length===3)return ctx.runMutation(proposals.setOwner,{...common,expectedVersion:body.expectedVersion,agentId:body.agentId,owner:body.owner});
    if(action==='proposals'){
      if(parts.length===3)return ctx.runMutation(proposals.create,{...common,title:body.title,changes:body.changes,editors:body.editors});
      if(parts.length===4)return ctx.runMutation(proposals.edit,{...common,proposalId,expectedRevision:body.expectedRevision,title:body.title,changes:body.changes,removeChanges:body.removeChanges,editors:body.editors});
      if(transitions.has(operation))return ctx.runMutation(proposals.transition,{...common,proposalId,expectedRevision:body.expectedRevision,action:operation,message:body.message});
    }
  }
  fail('not_found','Not found.');
}
