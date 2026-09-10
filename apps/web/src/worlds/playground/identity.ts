import { playgroundRequest } from "./api";
export type PlaygroundIdentity = {
  agentId: string;
  name: string;
  expiresAt: number;
  recoveryConfigured: boolean;
  recoverable: boolean;
};
let sessionRequest: Promise<unknown> | undefined;
const exportedIdentities = new Set<string>();
/** Deduplicate concurrent creation without retaining expired identity state. */
export function ensurePlaygroundSession(name: string) {
  sessionRequest ??= playgroundRequest("/api/session", {
    name: name.trim() || "Playground visitor",
  }).finally(() => {
    sessionRequest = undefined;
  });
  return sessionRequest;
}
export async function exportIdentityBackup(name: string) {
  await ensurePlaygroundSession(name);
  const identity = await playgroundRequest<PlaygroundIdentity | null>(
    "/api/playground/identity",
  );
  if (!identity?.recoverable)
    throw new Error(
      "Restore this identity with its existing recovery code before exporting a backup.",
    );
  const result = await playgroundRequest<{ recoveryCode: string }>(
    "/api/playground/identity/export",
    {},
  );
  if (typeof result.recoveryCode !== "string" || !result.recoveryCode)
    throw new Error("No recovery code was returned.");
  exportedIdentities.add(identity.agentId);
  return { identity, recoveryCode: result.recoveryCode };
}
export async function requireExportedIdentity() {
  const identity = await playgroundRequest<PlaygroundIdentity | null>(
    "/api/playground/identity",
  );
  if (!identity?.recoverable || !exportedIdentities.has(identity.agentId))
    throw new Error(
      "Reveal and save a recovery code for this identity before preparing checkout. Use Back up identity in Your identity & recovery.",
    );
  return identity;
}
