import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { managedEnabled, managedCredential } from '../packages/modeling/http';
afterEach(() => vi.unstubAllEnvs());
it('keeps public discovery disabled while allowing only the configured verification identity', () => {
  const token = 'a'.repeat(64);
  vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'false');
  vi.stubEnv('VERCEL_OIDC_TOKEN', 'fixture');
  vi.stubEnv('AGARTHA_MANAGED_MODELING_OPERATOR_AGENT_ID', `agent-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`);
  expect(managedEnabled()).toBe(false);
  expect(managedEnabled('b'.repeat(64))).toBe(false);
  expect(managedEnabled(token)).toBe(true);
});

it('uses the Vercel runtime OIDC header without exposing or persisting it', () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', ''); vi.stubEnv('VERCEL_OIDC_TOKEN', ''); vi.stubEnv('VERCEL', '1');
  const request = { headers: { 'x-vercel-oidc-token': 'runtime-fixture' } } as any;
  expect(managedCredential(request)).toBe('runtime-fixture');
  vi.stubEnv('VERCEL', '0');
  expect(managedCredential(request)).toBe('');
});

it('reports reference capabilities to the configured bearer identity only', async () => {
  const { default: handler } = await import('../api/blender');
  const token = 'a'.repeat(64);
  vi.stubEnv('AGARTHA_REFERENCE_MODELING_ENABLED', 'false');
  vi.stubEnv('AGARTHA_REFERENCE_MODELING_OPERATOR_AGENT_ID', `agent-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`);
  for (const [authorization, expected] of [[undefined, false], [`Bearer ${'b'.repeat(64)}`, false], [`Bearer ${token}`, true]] as const) {
    const response = { setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: 'GET', query: { path: 'capabilities' }, headers: { authorization } } as any, response as any);
    expect(JSON.parse(response.end.mock.calls[0][0]).managed.references.enabled).toBe(expected);
  }
});

it('reports the activated managed workflow and its reference default', async () => {
  const { default: handler } = await import('../api/blender');
  vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_VERSION', '3');
  vi.stubEnv('AGARTHA_REFERENCE_MODELING_ENABLED', 'true');
  const response = { setHeader: vi.fn(), end: vi.fn() };
  await handler({ method: 'GET', query: { path: 'capabilities' }, headers: {} } as any, response as any);
  expect(JSON.parse(response.end.mock.calls[0][0]).managed).toMatchObject({ workflowVersion: 3, defaultReferenceMode: 'generate', minimumBudgetCents: 100, maximumBudgetCents: 2000 });
});

it('reports operator-only v3 without changing anonymous discovery', async () => {
  const { default: handler } = await import('../api/blender');
  const token = 'a'.repeat(64);
  vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_VERSION', '');
  vi.stubEnv('AGARTHA_MANAGED_WORKFLOW_OPERATOR_AGENT_ID', `agent-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`);
  vi.stubEnv('AGARTHA_REFERENCE_MODELING_ENABLED', 'true');
  for (const [authorization, expected] of [[undefined, false], [`Bearer ${'b'.repeat(64)}`, false], [`Bearer ${token}`, true]] as const) {
    const response = { setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: 'GET', query: { path: 'capabilities' }, headers: { authorization } } as any, response as any);
    const managed = JSON.parse(response.end.mock.calls[0][0]).managed;
    expect(managed.workflowVersion === 3).toBe(expected);
    expect(managed.defaultReferenceMode).toBe(expected ? 'generate' : 'none');
  }
});
