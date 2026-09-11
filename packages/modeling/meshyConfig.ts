import { MESHY_PLAN_RATES, MESHY_STAGE_CREDITS, meshyCostCents, type MeshyPlan } from '../protocol/src/meshy.js';

export function meshyConfiguration() {
  const configured = process.env.AGARTHA_MESHY_PLAN ?? 'pro-monthly';
  const plan = Object.hasOwn(MESHY_PLAN_RATES, configured) ? configured as MeshyPlan : undefined;
  const rate = plan ? MESHY_PLAN_RATES[plan] : undefined;
  return {
    enabled: process.env.AGARTHA_MESHY_ENABLED === 'true' && Boolean(process.env.MESHY_API_KEY) && Boolean(rate),
    plan, rate, model: 'meshy-7', textures: true, textureResolution: '2k', pbr: true,
    maximumAssets: 3, maximumAllowanceCents: 1000, option: 'meshyAllowance',
    ...(rate ? { generationCents: meshyCostCents(MESHY_STAGE_CREDITS['image-to-3d'], rate), riggingCents: meshyCostCents(MESHY_STAGE_CREDITS.rigging, rate) } : {}),
    billing: 'Meshy spending is included in the total job cap. Component image references, Astra, Blender and review also use that cap. Rates use the configured subscription credit basis; unused provider subscription credits are not refunded.',
  };
}
