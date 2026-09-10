import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const browserAccessCookie = '__Host-agartha_session';
export const browserRecoveryCookie = '__Host-agartha_recovery';
export type BrowserIdentity = { agentId: string; name: string; expiresAt: number; recoveryConfigured: boolean; recoverable: boolean };
export class BrowserIdentityError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function browserSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin) return origin === `https://${req.headers.host}`;
  return req.headers['sec-fetch-site'] === 'same-origin';
}
function cookie(req: IncomingMessage, name: string) {
  return req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function parseRecovery(value: string): { agentId: string; recoveryToken: string } {
  const match = /^agartha-v1\.(agent-[a-f0-9]{24})\.([a-f0-9]{64})$/.exec(value);
  if (!match) throw new BrowserIdentityError('Invalid recovery code. No identity was changed.', 400);
  return { agentId: match[1], recoveryToken: match[2] };
}
function addCookies(res: ServerResponse, values: string[]) {
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []), ...values]);
}
/** Call only for cookie-backed browser requests, never external bearer registration. */
export async function resolveBrowserIdentity(req: IncomingMessage, res: ServerResponse, options: {
  base: URL; key: string; allowCreate?: boolean; name?: string; restoreCode?: string; exportRecovery?: boolean;
}): Promise<{ token: string; identity: BrowserIdentity; recoveryCode?: string } | null> {
  const token = cookie(req, browserAccessCookie);
  const recoveryCode = options.restoreCode ?? cookie(req, browserRecoveryCookie);
  if (!token && !recoveryCode && !options.allowCreate && !options.exportRecovery) return null;
  if (!browserSameOrigin(req)) throw new BrowserIdentityError('Same-origin browser request required.', 403);
  if (!token && !recoveryCode && !options.allowCreate) return null;
  const recovery = recoveryCode ? parseRecovery(recoveryCode) : null;
  const ip = String(req.headers['x-vercel-forwarded-for'] ?? req.headers['x-forwarded-for'] ?? 'unknown');
  const response = await fetch(new URL('/cloud/session/browser', options.base), {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'x-agartha-gateway-key': options.key, 'x-agartha-client': createHash('sha256').update(`${options.key}:${ip}`).digest('hex') },
    body: JSON.stringify({ ...(token ? { token } : {}), ...(recovery ? { recoveryAgentId: recovery.agentId, recoveryToken: recovery.recoveryToken } : {}), candidateToken: randomBytes(32).toString('hex'), candidateRecoveryToken: randomBytes(32).toString('hex'), name: options.name ?? 'Visitor', ...(options.restoreCode ? { restore: true } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok) throw new BrowserIdentityError(typeof data.error === 'string' ? data.error : 'Identity could not be recovered. No new identity was created.', response.status);
  if (!/^[a-f0-9]{64}$/.test(data.accessToken) || !/^agent-[a-f0-9]{24}$/.test(data.agentId)) throw new BrowserIdentityError('Invalid identity service response.', 502);
  const identity: BrowserIdentity = { agentId: data.agentId, name: data.name, expiresAt: data.expiresAt, recoveryConfigured: Boolean(data.recoveryConfigured), recoverable: Boolean(data.recoverable) };
  const exported = data.recoveryToken ? `agartha-v1.${data.agentId}.${data.recoveryToken}` : undefined;
  if (options.exportRecovery && !exported) throw new BrowserIdentityError('This identity already has a separate recovery credential. Restore with that credential before exporting a browser backup.', 409);
  const cookies = [`${browserAccessCookie}=${data.accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`];
  if (exported) cookies.push(`${browserRecoveryCookie}=${exported}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`);
  addCookies(res, cookies);
  res.setHeader('Cache-Control', 'no-store');
  return { token: data.accessToken, identity, ...(options.exportRecovery && exported ? { recoveryCode: exported } : {}) };
}
