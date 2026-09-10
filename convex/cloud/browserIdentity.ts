import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import { credential, digest, fail } from '../scene/model';
import { maintainInTransaction, registerInTransaction } from './session';

/** Gateway-only operation: raw credentials are returned only to its cookie writer. */
export const ensure = internalMutation({
  args: { token: v.optional(v.string()), recoveryAgentId: v.optional(v.string()), recoveryToken: v.optional(v.string()), candidateToken: v.string(), candidateRecoveryToken: v.string(), name: v.string(), ipHash: v.string(), restore: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    credential(args.candidateToken); credential(args.candidateRecoveryToken);
    if (args.candidateToken === args.candidateRecoveryToken) fail('invalid', 'Use separate credentials.');
    if (args.token) credential(args.token);
    if (args.recoveryToken) credential(args.recoveryToken);
    const tokenHash = args.token ? await digest(args.token) : undefined;
    const current = tokenHash ? await ctx.db.query('cloudSessions').withIndex('by_token', q => q.eq('tokenHash', tokenHash)).unique() : null;
    const recovered = args.recoveryAgentId ? await ctx.db.query('cloudSessions').withIndex('by_agent', q => q.eq('agentId', args.recoveryAgentId!)).unique() : null;
    const recoveryValid = Boolean(recovered && !recovered.revoked && args.recoveryToken && recovered.recoveryTokenHash === await digest(args.recoveryToken));
    if (args.recoveryAgentId || args.recoveryToken || args.restore) {
      if (!recoveryValid || !recovered) fail('unauthorized', 'Recovery credential is invalid. Restore your saved identity; a new identity was not created.');
      if (!args.restore && current && current.agentId !== recovered.agentId) fail('conflict', 'Access and recovery cookies belong to different identities. Explicitly restore the intended identity.');
      // Preserve an existing access credential when it still belongs to this
      // identity, including expiry; rotate only if the browser lost access.
      const keepToken = current?.agentId === recovered.agentId;
      const accessToken = keepToken ? args.token! : args.candidateToken;
      const actor = await maintainInTransaction(ctx, { operation: keepToken ? 'renew' : 'rotate', agentId: recovered.agentId, recoveryToken: args.recoveryToken, ...(keepToken ? { token: args.token } : { newToken: accessToken }) });
      return { ...actor, accessToken, recoveryToken: args.recoveryToken!, recoverable: true };
    }
    if (args.token) {
      if (!current || current.revoked || current.expiresAt <= Date.now()) fail('unauthorized', 'This browser identity has expired or was rotated. Restore your saved recovery code; a new identity was not created.');
      const actor = await maintainInTransaction(ctx, { operation: 'renew', token: args.token, ...(!current.recoveryTokenHash ? { newRecoveryToken: args.candidateRecoveryToken } : {}) });
      return { ...actor, accessToken: args.token, ...(!current.recoveryTokenHash ? { recoveryToken: args.candidateRecoveryToken } : {}), recoverable: !current.recoveryTokenHash };
    }
    const actor = await registerInTransaction(ctx, { token: args.candidateToken, recoveryToken: args.candidateRecoveryToken, name: args.name, ipHash: args.ipHash });
    return { ...actor, accessToken: args.candidateToken, recoveryToken: args.candidateRecoveryToken, recoverable: true };
  },
});
