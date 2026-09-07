import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { fail } from "../scene/model";
import { activeVoter, ensureScope, scopeView } from "./helpers";
export const setSoftwareVoters = mutation({
  args: {
    operatorToken: v.string(),
    expectedVersion: v.number(),
    agentIds: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const configured = process.env.AGARTHA_SCENE_OPERATOR_TOKEN;
    if (!configured || configured.length < 32 || a.operatorToken !== configured)
      fail("unauthorized", "Invalid operator credential.");
    if (
      !a.agentIds.length ||
      a.agentIds.length > 64 ||
      new Set(a.agentIds).size !== a.agentIds.length
    )
      fail("invalid", "Provide 1–64 unique voters.");
    const state = await ensureScope(ctx, "software");
    if (state.voterVersion !== a.expectedVersion)
      fail("conflict", "Voter version changed.");
    const voters = await Promise.all(
      a.agentIds.map((id) => activeVoter(ctx, id)),
    );
    await ctx.db.patch(state._id, {
      voters,
      voterVersion: state.voterVersion + 1,
    });
    return scopeView(ctx, "software");
  },
});
