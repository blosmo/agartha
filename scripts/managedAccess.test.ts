import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { managedEnabled } from '../packages/modeling/http';
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
