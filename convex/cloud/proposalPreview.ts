import {internalQuery} from '../_generated/server';
import {ConvexError,v} from 'convex/values';
import {digest,fail} from '../scene/model';
import {getProposal,readable} from './proposalHelpers';
import {snapshot} from './read';

/** Read the draft and accepted scene in one database snapshot, without writing. */
export const preview=internalQuery({
  args:{id:v.string(),token:v.string(),proposalId:v.string(),expectedRevision:v.number()},
  handler:async(ctx,args)=>{
    const room=await readable(ctx,args.id,args.token);
    const proposal=await getProposal(ctx,room.worldId,args.proposalId);
    if(proposal.revision!==args.expectedRevision)throw new ConvexError({code:'conflict',message:'Proposal revision changed. Read it before previewing.',currentRevision:proposal.revision});
    if(proposal.status==='accepted'||proposal.status==='withdrawn')fail('invalid','Preview an active proposal. Accepted work is in the room.');
    const base=await snapshot(ctx,room,args.token);
    if(base.hasMoreObjects)fail('quota','This room exceeds the complete proposal preview limit of 1000 objects.');
    const current=await Promise.all(proposal.changes.map(change=>ctx.db.query('sceneObjects').withIndex('by_object',q=>q.eq('worldId',room.worldId).eq('objectId',change.id)).unique()));
    const conflicts=proposal.changes.flatMap((change,i)=>(current[i]?.version??0)===change.expectedVersion?[]:[{id:change.id,expectedVersion:change.expectedVersion,currentVersion:current[i]?.version??0}]);
    if(conflicts.length)throw new ConvexError({code:'conflict',message:'Proposal objects changed. Reconcile before previewing.',conflicts});
    const objects=new Map(base.objects.map(object=>[object.id,object]));
    for(let i=0;i<proposal.changes.length;i++){
      const change=proposal.changes[i],existing=current[i];
      if(!change.object&&(!existing||existing.deleted))fail('invalid','Cannot preview removal of an absent object.');
      if(change.object)objects.set(change.id,{...change.object,owner:existing?.owner??change.contributorId,author:existing?.author??change.contributorName});
      else objects.delete(change.id);
    }
    const composite=[...objects.values()];
    const shaders=await Promise.all([...new Set(composite.flatMap(o=>o.shaderId?[o.shaderId]:[]))].map(async id=>{
      const row=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',room.gridId!).eq('libraryId',id)).unique();
      if(!row||row.definition.kind!=='shader')fail('invalid','Proposal shader is unavailable.');
      return {id:row.libraryId,...row.definition};
    }));
    const version=await digest(JSON.stringify({base:base.version,proposalId:proposal.proposalId,revision:proposal.revision}));
    return {render:true,source:{...base,objects:composite,shaders,version},proposal:{proposalId:proposal.proposalId,revision:proposal.revision,baseSnapshotVersion:base.version}};
  },
});
