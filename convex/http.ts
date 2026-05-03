import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => json({ ok: true, authority: "convex" })),
});

http.route({
  path: "/observe",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request);
    const agentId = new URL(request.url).searchParams.get("agentId") ?? "agent-moss-archivist";
    try {
      const body = await ctx.runQuery(api.actions.observe, { agentId, worldId: "origin", token, production: isProductionLike() });
      return json(body);
    } catch (error) {
      return json({ reason: "unauthenticated", message: redactedError(error) }, 401);
    }
  }),
});

http.route({
  path: "/quote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const envelope = await request.json();
    return json(await ctx.runMutation(api.actions.quote, { envelope, token: bearerToken(request), production: isProductionLike() }));
  }),
});

http.route({
  path: "/act",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request);
    const envelope = await request.json();
    const body = await ctx.runMutation(api.actions.act, { envelope, token, production: isProductionLike() });
    return json(body, body.accepted ? 200 : statusForReason(body.reason));
  }),
});

http.route({
  pathPrefix: "/chunks/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const match = new URL(request.url).pathname.match(/\/chunks\/(-?\d+)\/(-?\d+)$/);
    if (!match) return json({ reason: "malformed", message: "Expected /chunks/<x>/<y>." }, 400);
    return json(await ctx.runQuery(api.chunks.snapshot, { worldId: "origin", chunk: { x: Number(match[1]), y: Number(match[2]) } }));
  }),
});

http.route({
  path: "/events",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "20");
    return json(await ctx.runQuery(api.events.recent, { worldId: "origin", limit }));
  }),
});

http.route({
  path: "/admin/energy/refill",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request);
    const body = await request.json();
    try {
      return json(
        await ctx.runMutation(api.admin.refillEnergy, {
          token,
          agentId: String(body.agentId),
          amount: typeof body.amount === "number" ? body.amount : undefined,
          production: isProductionLike(),
          adminEnabled: process.env.AGARTHA_CONVEX_ADMIN_ENABLED === "true",
        }),
      );
    } catch (error) {
      return json({ reason: "permission_denied", message: redactedError(error) }, 403);
    }
  }),
});

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.AGARTHA_CORS_ORIGIN ?? "http://127.0.0.1:5173",
      Vary: "Origin",
    },
  });
}

function statusForReason(reason: string | undefined): number {
  switch (reason) {
    case "unauthenticated":
      return 401;
    case "permission_denied":
      return 403;
    case "stale_chunk_version":
      return 409;
    default:
      return 400;
  }
}

function isProductionLike() {
  return process.env.CONVEX_DEPLOYMENT?.startsWith("prod:") ?? false;
}

function redactedError(error: unknown) {
  return error instanceof Error ? error.message.replace(/token-[a-z-]+/gi, "[redacted]") : "request rejected";
}

export default http;
