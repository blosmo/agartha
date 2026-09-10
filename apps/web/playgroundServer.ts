import type { IncomingMessage, ServerResponse } from "node:http";
import { PLAYGROUND_CAPABILITIES } from "../../packages/protocol/src/playground";
import { PlaygroundStore } from "./playgroundStore";
import { WorldError } from "./src/worlds/world";
const COOKIE = "agartha_playground_session";
export function playgroundHandler(store: PlaygroundStore) {
  const attempts = new Map<string, { at: number; count: number }>();
  return async (req: IncomingMessage, res: ServerResponse, session = false) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    try {
      const host = req.headers.host ?? "";
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))
        throw new WorldError("Local access only.", 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw new WorldError("Same-origin access only.", 403);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new WorldError("Same-origin access only.", 403);
      if (!["GET", "POST"].includes(req.method ?? ""))
        throw new WorldError("Method not allowed.", 405);
      const url = new URL(req.url ?? "/", `http://${host}`),
        parts = url.pathname.split("/").filter(Boolean);
      let input: Record<string, unknown> = {};
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw new WorldError("Use application/json.", 415);
        let raw = "";
        for await (const chunk of req) {
          raw += chunk.toString();
          if (Buffer.byteLength(raw) > 16384)
            throw new WorldError("Request too large.", 413);
        }
        try {
          input = JSON.parse(raw);
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw new Error();
        } catch {
          throw new WorldError("Expected a JSON object.");
        }
      }
      const bearer = req.headers.authorization?.match(
        /^Bearer ([A-Za-z0-9-]{1,200})$/,
      )?.[1];
      const cookie = req.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1);
      let viewer = await store.viewer(bearer ?? cookie);
      let result: unknown;
      if (session) {
        if (parts.length) throw new WorldError("Not found.", 404);
        if (req.method === "GET") result = viewer;
        else {
          const external = input.agentToken !== undefined;
          const existing = external ? await store.viewer(input.agentToken as string) : viewer;
          if (existing) result = existing;
          else {
            const key = req.socket.remoteAddress ?? "local", now = Date.now();
            for (const [k, v] of attempts) if (v.at < now - 60000) attempts.delete(k);
            const rate = attempts.get(key) ?? { at: now, count: 0 };
            if (++rate.count > 10) throw new WorldError("Too many session registrations.", 429);
            attempts.set(key, rate);
            const created = await store.session((input.name as string | undefined) ?? "Visitor", input.agentToken as string | undefined);
            if (!external) res.setHeader("Set-Cookie", `${COOKIE}=${created.agentToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
            result = external ? { agentId: created.agentId, name: created.name } : created;
          }
        }
      } else if (!parts.length && req.method === "GET")
        result = { ...PLAYGROUND_CAPABILITIES, viewer };
      else if (parts[0] === "allowances") {
        if (req.method === "GET" && parts.length === 1) result = { allowances: [], hasMore: false, nextCursor: null };
        else throw new WorldError("Agent allowances require the hosted billing service.", 501);
      } else if (parts[0] === "credit-pricing" && req.method === "GET") {
        result = { purchasesEnabled: false, paymentMode: "test", topUpCents: [] };
      } else if (parts[0] === "pass") {
        if (req.method !== "GET" || parts.length !== 1)
          throw new WorldError(
            "Build budgets and funding require the hosted service.",
            501,
          );
        result = {
          offer: {
            offerId: "local-unavailable",
            feeCents: 0,
            generationCents: 0,
            totalCents: 0,
            livemode: false,
            available: false,
            unavailableReason:
              "Build budgets and managed generation require the hosted service. Free local collaboration is available.",
          },
          pass: null,
          wallet: null,
        };
      } else if (parts[0] === "projects") {
        const id = parts[1];
        if (req.method === "GET") {
          if (parts.length === 1)
            result = await store.list(viewer, {
              cursor: url.searchParams.get("cursor"),
              status: url.searchParams.get("status"),
              plotId: url.searchParams.get("plotId"),
            });
          else if (parts.length === 2) result = await store.get(id, viewer);
          else if (parts.length === 3 && parts[2] === "funding") {
            await store.get(id, viewer);
            result = null;
          } else if (parts.length === 3 && parts[2] === "contributions")
            result = await store.contributions(
              id,
              url.searchParams.get("cursor"),
            );
          else throw new WorldError("Not found.", 404);
        } else {
          if (!viewer)
            throw new WorldError(
              "Create a free session before contributing.",
              401,
            );
          let action = "";
          if (parts.length === 1) action = "create";
          else if (parts.length === 3)
            action =
              (
                {
                  vote: "vote",
                  update: "update",
                  invitations: "invite",
                  contributions: "contribute",
                } as Record<string, string>
              )[parts[2]] ?? "";
          else if (parts.length === 4 && parts[2] === "invitations")
            action = "invitation";
          else if (
            parts.length === 5 &&
            parts[2] === "contributions" &&
            parts[4] === "review"
          )
            action = "review";
          if (!action)
            throw new WorldError("This operation is unavailable locally.", 501);
          result = await store.mutate(viewer, action, input, id, parts[3]);
        }
      } else throw new WorldError("Not found.", 404);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof WorldError ? error.status : 400;
      res.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Unable to access playground.",
        }),
      );
    }
  };
}
