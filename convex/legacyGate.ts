import {ConvexError} from 'convex/values';
export function legacyProductionPolicy() {
  return process.env.CONVEX_DEPLOYMENT?.startsWith('prod:') === true || process.env.NODE_ENV === 'production';
}
/** Archived APIs require an explicit development deployment and server opt-in. */
export function assertLegacyEnabled(){
  if (process.env.AGARTHA_LEGACY_DEV_ENABLED !== 'true' || !process.env.CONVEX_DEPLOYMENT?.startsWith('dev:') || legacyProductionPolicy() || (process.env.AGARTHA_CLOUD_ONLY !== undefined && process.env.AGARTHA_CLOUD_ONLY !== 'false'))
    throw new ConvexError({code:'legacy_disabled',message:'The archived cellular API is disabled on this deployment.'});
}
