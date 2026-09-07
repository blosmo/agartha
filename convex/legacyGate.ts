import {ConvexError} from 'convex/values';
/** The archived cellular demo stays available in development, not on the public cloud deployment. */
export function assertLegacyEnabled(){
  if(process.env.AGARTHA_CLOUD_ONLY==='true')throw new ConvexError({code:'legacy_disabled',message:'The archived cellular API is disabled on this deployment.'});
}
