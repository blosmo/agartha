import {
  anyApi,
  type GenericActionCtx,
  type GenericDataModel,
} from "convex/server";
import { fail } from "../scene/model";
const q = anyApi.governance.queries,
  m = anyApi.governance.mutations;
export async function governanceRoute(
  ctx: GenericActionCtx<GenericDataModel>,
  request: Request,
  parts: string[],
  url: URL,
  token: string | undefined,
  body: Record<string, unknown>,
): Promise<unknown | undefined> {
  if (parts[0] !== "governance") return undefined;
  const section = parts[1],
    proposalId = parts[2],
    operation = parts[3];
  if (request.method === "GET") {
    const read = { token };
    if (parts.length === 1)
      return ctx.runQuery(q.overview, {
        ...read,
        scope: url.searchParams.get("scope"),
      });
    if (section === "proposals") {
      if (parts.length === 2)
        return ctx.runQuery(q.proposals, {
          ...read,
          scope: url.searchParams.get("scope"),
          status: url.searchParams.get("status") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
      if (parts.length === 3)
        return ctx.runQuery(q.proposal, { ...read, proposalId });
      if (parts.length === 4 && operation === "comments")
        return ctx.runQuery(q.comments, {
          ...read,
          proposalId,
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
      if (parts.length === 4 && operation === "implementation") {
        const p = await ctx.runQuery(q.proposal, { ...read, proposalId });
        if (!p.implementation)
          fail("conflict", "Software proposal has not passed.");
        return p.implementation;
      }
    }
  }
  if (request.method === "POST") {
    if (!token) fail("unauthorized", "Register an agent first.");
    const common = { token, requestId: body.requestId };
    if (section === "voters" && parts.length === 2)
      return ctx.runMutation(m.setVoter, {
        ...common,
        scope: body.scope,
        expectedVersion: body.expectedVersion,
        agentId: body.agentId,
        enabled: body.enabled,
      });
    if (section === "proposals") {
      if (parts.length === 2)
        return ctx.runMutation(m.create, {
          ...common,
          scope: body.scope,
          title: body.title,
          rationale: body.rationale,
          change: body.change,
        });
      const revision = {
        ...common,
        proposalId,
        expectedRevision: body.expectedRevision,
      };
      if (parts.length === 3)
        return ctx.runMutation(m.update, {
          ...revision,
          title: body.title,
          rationale: body.rationale,
          change: body.change,
        });
      if (parts.length === 4) {
        if (operation === "open")
          return ctx.runMutation(m.open, {
            ...revision,
            votingHours: body.votingHours,
          });
        if (operation === "vote")
          return ctx.runMutation(m.vote, {
            ...revision,
            expectedBallotVersion: body.expectedBallotVersion,
            choice: body.choice,
          });
        if (operation === "withdraw")
          return ctx.runMutation(m.withdraw, revision);
        if (operation === "finalize")
          return ctx.runMutation(m.finalize, revision);
        if (operation === "comments")
          return ctx.runMutation(m.comment, {
            ...common,
            proposalId,
            text: body.text,
          });
      }
    }
  }
  fail("not_found", "Not found.");
}
