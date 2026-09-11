/** Verified USD list prices, 2026-09-11. Subscription amortization assumes full credit use. */
export const MESHY_PLAN_RATES = {
  'pro-monthly': { usdCents: 2000, credits: 1000 },
  'premium-monthly': { usdCents: 4000, credits: 3000 },
  'ultra-monthly': { usdCents: 10000, credits: 8000 },
  'studio-monthly': { usdCents: 7000, credits: 5500 },
} as const;
export type MeshyPlan = keyof typeof MESHY_PLAN_RATES;
export type MeshyRate = { usdCents: number; credits: number };
export type MeshyAllowance = { budgetCents: number; maxAssets: number; allowRigging: boolean };
export type MeshyStage = 'image-to-3d' | 'rigging';
export type MeshyResult = { status: 'succeeded' | 'failed'; modelUrl?: string; walkingUrl?: string; thumbnailUrl?: string };
export const MESHY_STAGE_CREDITS: Record<MeshyStage, number> = { 'image-to-3d': 30, rigging: 5 };
export function meshyCostCents(credits: number, rate: MeshyRate): number {
  if (!Number.isSafeInteger(credits) || credits < 0 || credits > 10000 || !Number.isSafeInteger(rate.usdCents) || rate.usdCents < 1 || rate.usdCents > 1_000_000 || !Number.isSafeInteger(rate.credits) || rate.credits < 1 || rate.credits > 1_000_000) throw new Error('Invalid Meshy credit rate.');
  return Math.ceil(credits * rate.usdCents / rate.credits);
}
export function parseMeshyAllowance(value: unknown): MeshyAllowance | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a Meshy allowance.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['budgetCents','maxAssets','allowRigging'].includes(key))) throw new Error('Unknown Meshy allowance option.');
  const budgetCents = input.budgetCents, maxAssets = input.maxAssets ?? 1, allowRigging = input.allowRigging ?? false;
  if (typeof budgetCents !== 'number' || !Number.isSafeInteger(budgetCents) || budgetCents < 1 || budgetCents > 1000 || typeof maxAssets !== 'number' || !Number.isSafeInteger(maxAssets) || maxAssets < 1 || maxAssets > 3 || typeof allowRigging !== 'boolean') throw new Error('Meshy requires a 1–1000 cent allowance, 1–3 assets and optional rigging.');
  return { budgetCents, maxAssets, allowRigging };
}
