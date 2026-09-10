import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBrowserIdentity } from './browserIdentity';
const token = 'a'.repeat(64), recovery = 'b'.repeat(64), agentId = `agent-${'c'.repeat(24)}`;
const options = { base: new URL('https://backend.example'), key: 'gateway' };
function request(headers = {}) { return { headers: { host: 'agartha.example', origin: 'https://agartha.example', ...headers } } as IncomingMessage; }
function response() { const headers = new Map(); return { headers, res: { getHeader: (k: string) => headers.get(k), setHeader: (k: string, v: unknown) => headers.set(k, v) } as unknown as ServerResponse }; }
afterEach(() => vi.unstubAllGlobals());
describe('browser identity gateway', () => {
  it('stores separate protected cookies and exposes recovery only after explicit export', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ agentId, name: 'Visitor', expiresAt: 123, recoveryConfigured: true, recoverable: true, accessToken: token, recoveryToken: recovery })));
    const { res, headers } = response();
    const result = await resolveBrowserIdentity(request(), res, { ...options, allowCreate: true });
    expect(result?.identity).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('recoveryCode');
    expect(headers.get('Set-Cookie')).toEqual([expect.stringContaining('Max-Age=2592000'), expect.stringContaining('Max-Age=31536000')]);
    for (const value of headers.get('Set-Cookie')) expect(value).toContain('HttpOnly; Secure; SameSite=Lax; Path=/');
    const exported = await resolveBrowserIdentity(request({ cookie: `__Host-agartha_session=${token}; __Host-agartha_recovery=agartha-v1.${agentId}.${recovery}` }), res, { ...options, exportRecovery: true });
    expect(exported?.recoveryCode).toBe(`agartha-v1.${agentId}.${recovery}`);
  });
  it('blocks cross-origin recovery export and does not create on passive reads', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { res } = response();
    await expect(resolveBrowserIdentity(request({ origin: 'https://attacker.example' }), res, { ...options, exportRecovery: true })).rejects.toThrow('Same-origin');
    expect(await resolveBrowserIdentity(request(), res, options)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not replace cookies after failed recovery', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Invalid recovery' }, { status: 401 })));
    const { res, headers } = response();
    await expect(resolveBrowserIdentity(request(), res, { ...options, restoreCode: `agartha-v1.${agentId}.${recovery}` })).rejects.toThrow('Invalid recovery');
    expect(headers.has('Set-Cookie')).toBe(false);
  });
});
