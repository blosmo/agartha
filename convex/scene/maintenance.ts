import { internalMutation } from '../_generated/server';
import { anyApi } from 'convex/server';

/** Bounded retention batches; recent mutation receipts never share this read range. */
export const cleanup = internalMutation({args:{},handler:async(ctx)=>{
  const now=Date.now();
  const receipts=await ctx.db.query('sceneReceipts').withIndex('by_time',q=>q.lt('createdAt',now-2*86400000)).take(500);
  const events=await ctx.db.query('sceneActivity').withIndex('by_time',q=>q.lt('createdAt',now-7*86400000)).take(500);
  for(const row of [...receipts,...events])await ctx.db.delete(row._id);
  if(receipts.length===500||events.length===500)await ctx.scheduler.runAfter(1000,anyApi.scene.maintenance.cleanup,{});
}});
