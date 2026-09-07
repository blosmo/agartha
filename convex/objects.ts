import { assertLegacyEnabled } from './legacyGate';
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { authenticateToken } from "./lib/auth";

const objectSampleArg = v.object({
  dx: v.number(),
  dy: v.number(),
  material: v.number(),
  state: v.number(),
  variant: v.number(),
  flags: v.number(),
});

const objectTemplateArg = v.object({
  id: v.string(),
  label: v.string(),
  width: v.number(),
  height: v.number(),
  samples: v.array(objectSampleArg),
});

export const list = query({
  args: { worldId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const worldId = args.worldId ?? "origin";
    const limit = Math.min(Math.max(args.limit ?? 24, 1), 100);
    const templates = await ctx.db
      .query("objectTemplates")
      .withIndex("by_world_updated", (q) => q.eq("worldId", worldId))
      .order("desc")
      .take(limit);
    return templates.map((template) => ({
      id: template.objectId,
      label: template.label,
      width: template.width,
      height: template.height,
      samples: template.samples,
    }));
  },
});

export const save = mutation({
  args: {
    worldId: v.string(),
    agentId: v.string(),
    token: v.optional(v.string()),
    production: v.optional(v.boolean()),
    template: objectTemplateArg,
  },
  handler: async (ctx, args) => {
    assertLegacyEnabled();
    const now = Date.now();
    const records = await ctx.db
      .query("serviceTokens")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.token?.slice(0, 8) ?? ""))
      .collect();
    const auth = await authenticateToken(args.token, records, {
      worldId: args.worldId,
      agentId: args.agentId,
      scope: "agent:write",
      now,
      production: args.production ?? false,
    });
    if (!auth.ok) throw new Error(auth.reason);

    const template = normalizeTemplate(args.template);
    const existing = await ctx.db
      .query("objectTemplates")
      .withIndex("by_object_id", (q) => q.eq("worldId", args.worldId).eq("objectId", template.id))
      .unique();

    if (existing === null) {
      await ctx.db.insert("objectTemplates", {
        worldId: args.worldId,
        objectId: template.id,
        label: template.label,
        width: template.width,
        height: template.height,
        samples: template.samples,
        authorAgentId: args.agentId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        label: template.label,
        width: template.width,
        height: template.height,
        samples: template.samples,
        authorAgentId: args.agentId,
        updatedAt: now,
      });
    }

    await ctx.db.insert("events", {
      worldId: args.worldId,
      eventId: `event-object-${now.toString(36)}`,
      agentId: args.agentId,
      kind: "object_template_saved",
      summary: `${args.agentId} saved object ${template.label}`,
      public: true,
      affectedChunks: [],
      affectedCells: [],
      createdAt: now,
    });

    return {
      accepted: true,
      objectId: template.id,
      summary: `object_template saved: ${template.label}`,
    };
  },
});

function normalizeTemplate(template: {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly samples: readonly {
    readonly dx: number;
    readonly dy: number;
    readonly material: number;
    readonly state: number;
    readonly variant: number;
    readonly flags: number;
  }[];
}) {
  const id = template.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "object";
  const label = template.label.trim() || "object";
  const width = Math.max(1, Math.min(96, Math.round(template.width)));
  const height = Math.max(1, Math.min(96, Math.round(template.height)));
  const samples = template.samples
    .filter(
      (sample) =>
        Number.isInteger(sample.dx) &&
        Number.isInteger(sample.dy) &&
        sample.dx >= 0 &&
        sample.dy >= 0 &&
        sample.dx < width &&
        sample.dy < height &&
        Number.isInteger(sample.material),
    )
    .slice(0, 4096)
    .map((sample) => ({
      dx: sample.dx,
      dy: sample.dy,
      material: sample.material,
      state: Number.isInteger(sample.state) ? sample.state : 0,
      variant: Number.isInteger(sample.variant) ? sample.variant : 0,
      flags: Number.isInteger(sample.flags) ? sample.flags : 0,
    }));

  return { id, label, width, height, samples };
}
