import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMeshyAllowance, MESHY_PLAN_RATES, meshyCostCents } from '../packages/protocol/src/meshy';
import { parseStudioAction, studioRequest } from '../packages/modeling/studio';
import { meshyConfiguration } from '../packages/modeling/meshyConfig';
import { referenceRequest } from '../packages/modeling/references';

const context = { enabled: true, budgetRemainingCents: 100, maxAssets: 1, allowRigging: true, generationCents: 60, riggingCents: 10 };
const action = { action: 'prepare_generated_asset', code: JSON.stringify({ name: 'Visitor', brief: 'One clothed humanoid in an A-pose', rigging: true }), objectName: '', views: [], summary: 'Missing visitor', critique: '' };
afterEach(() => vi.unstubAllEnvs());
describe('Meshy configuration and Astra actions', () => {
  it('uses regular monthly plan credits and rounds each operation upward', () => {
    expect(Object.values(MESHY_PLAN_RATES).map(rate => [meshyCostCents(30, rate), meshyCostCents(5, rate)])).toEqual([[60,10],[40,7],[38,7],[39,7]]);
    expect(parseMeshyAllowance({ budgetCents: 100 })).toEqual({ budgetCents: 100, maxAssets: 1, allowRigging: false });
    for (const value of [{ budgetCents: 1001 }, { budgetCents: 100, maxAssets: 4 }, { budgetCents: 10, rate: 0 }, { budgetCents: 10, allowRigging: 'true' }]) expect(() => parseMeshyAllowance(value)).toThrow();
  });
  it('requires both explicit enablement and a valid server rate plus key', () => {
    vi.stubEnv('AGARTHA_MESHY_ENABLED', 'true'); vi.stubEnv('MESHY_API_KEY', 'fixture'); vi.stubEnv('AGARTHA_MESHY_PLAN', 'premium-monthly');
    expect(meshyConfiguration()).toMatchObject({ enabled: true, generationCents: 40, riggingCents: 7, textures: true });
    vi.stubEnv('AGARTHA_MESHY_PLAN', 'unknown'); expect(meshyConfiguration().enabled).toBe(false);
    vi.stubEnv('AGARTHA_MESHY_PLAN', 'pro-monthly'); vi.stubEnv('MESHY_API_KEY', ''); expect(meshyConfiguration().enabled).toBe(false);
  });
  it('only exposes generation tools for an enabled allowance', () => {
    for (const enabled of [true, false]) {
      const result = studioRequest({ brief: 'Garden', history: 'Begin', images: [], remainingCents: 500, meshy: { ...context, enabled } });
      const names: readonly string[] = result.body.tools[0].parameters.properties.action.enum;
      expect(names.includes('prepare_generated_asset')).toBe(enabled);
      expect(names.includes('generate_asset')).toBe(enabled);
      expect(JSON.stringify(result.body.input).includes('When Meshy is enabled')).toBe(enabled);
    }
  });
  it('normalizes placement and rejects unsupported generation or transform options', () => {
    expect(JSON.parse(parseStudioAction(action).code)).toMatchObject({ name: 'Visitor', rigging: true, heightMeters: 1.7 });
    for (const fields of [{ rigging: 'true' }, { heightMeters: 10 }, { scale: [0,1,1] }, { provider: 'other' }]) expect(() => parseStudioAction({ ...action, code: JSON.stringify({ ...JSON.parse(action.code), ...fields }) })).toThrow();
    expect(() => parseStudioAction({ ...action, action: 'generate_asset', code: '', objectName: '' })).toThrow();
  });
  it('uses a single component image and retains the independent review budget', () => {
    const result = referenceRequest({ jobId: 'job', executorId: 'worker', operationId: 'component-ref', kind: 'asset-reference', brief: 'One visitor in an A-pose', remainingCents: 500 });
    expect(result.body.prompt).toContain('single clean reference image');
    expect(result.body.prompt).not.toContain('2 by 2 grid');
    expect(() => referenceRequest({ jobId: 'job', executorId: 'worker', operationId: 'component-ref', kind: 'asset-reference', brief: 'Visitor', remainingCents: 100 })).toThrow();
  });
});
