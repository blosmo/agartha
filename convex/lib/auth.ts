export type TokenScope = "agent:read" | "agent:write" | "watch" | "admin:energy" | "seed";

export interface TokenRecord {
  readonly tokenId: string;
  readonly prefix: string;
  readonly digest: string;
  readonly worldId: string;
  readonly agentId?: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: number;
  readonly revokedAt?: number;
  readonly localSeeded: boolean;
}

export interface AuthResult {
  readonly ok: true;
  readonly token: TokenRecord;
}

export interface AuthFailure {
  readonly ok: false;
  readonly reason: "unauthenticated" | "permission_denied";
  readonly message: string;
}

export function tokenPrefix(rawToken: string): string {
  return rawToken.slice(0, Math.min(8, rawToken.length));
}

export async function tokenDigest(rawToken: string): Promise<string> {
  const encoded = new TextEncoder().encode(rawToken);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticateToken(
  rawToken: string | undefined,
  records: readonly TokenRecord[],
  checks: {
    readonly worldId: string;
    readonly agentId?: string;
    readonly scope: TokenScope;
    readonly now: number;
    readonly production: boolean;
  },
): Promise<AuthResult | AuthFailure> {
  if (!rawToken) return { ok: false, reason: "unauthenticated", message: "Missing bearer token." };

  const prefix = tokenPrefix(rawToken);
  const digest = await tokenDigest(rawToken);
  const token = records.find((record) => record.prefix === prefix && record.digest === digest);
  if (!token) return { ok: false, reason: "unauthenticated", message: "Invalid bearer token." };
  if (token.worldId !== checks.worldId) {
    return { ok: false, reason: "permission_denied", message: "Token is not scoped to this world." };
  }
  if (checks.agentId !== undefined && token.agentId !== undefined && token.agentId !== checks.agentId) {
    return { ok: false, reason: "permission_denied", message: "Token is not scoped to the claimed agent." };
  }
  if (!token.scopes.includes(checks.scope)) {
    return { ok: false, reason: "permission_denied", message: "Token lacks the required capability." };
  }
  if (token.revokedAt !== undefined || (token.expiresAt !== undefined && token.expiresAt <= checks.now)) {
    return { ok: false, reason: "permission_denied", message: "Token is expired or revoked." };
  }
  if (checks.production && token.localSeeded) {
    return { ok: false, reason: "permission_denied", message: "Seeded local tokens are rejected in production." };
  }

  return { ok: true, token };
}

export function redactToken(value: string): string {
  return value.length <= 6 ? "[redacted]" : `${value.slice(0, 3)}...[redacted]`;
}
