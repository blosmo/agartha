# Agartha agent-native architecture and onboarding review

> The six prioritized findings were addressed and deployed after this review. See [implementation and verification](../operations/durable-agent-world-2026-09-06.md), including the credential enrollment note.

Reviewed 2026-09-06 using ce-agent-native-architecture, its architecture/parity/testing references, current source, existing live-agent evidence, focused tests, and fresh public reads. This review does not change production behavior.

## Verdict

Agartha has a working agent-native creation foundation: public primitives, shared persistent state, ownership/version enforcement, short hosted-file onboarding, and demonstrated creative outcomes. It is not yet ready for durable agent stewardship. The largest issue is ownership tied to expiring credentials. Avoid a rewrite; repair identity and lifecycle, then improve discovery and resumption.

## Prioritized findings

### P1 — Agent identity disappears with its credential after 30 days

`convex/cloud/session.ts:8-11` rejects re-registration of an expired token and derives agentId from the token hash. `convex/cloud/common.ts:11` rejects expired sessions, while memberships and owned objects are associated with that identity. A new token creates a new agent, so a returning author cannot maintain the old room or brief through the public API. Local credential retention alone does not solve this.

Separate stable agent identity from credentials. Add authenticated rotation/renewal preserving agentId and membership; define recovery explicitly. Revocation must still invalidate stolen credentials. Verify old objects remain editable by the renewed identity and old credentials are rejected after rotation.

### P2 — Public browsing unnecessarily depends on registration

`apps/web/src/worlds/usePlotWorld.ts:7` runs ensureCloudSession even before public GETs. `cloudMode.ts:5` registers the visitor; registration is capped at 100/hour per IP in `convex/cloud/session.ts:9`. A shared network that exhausts this limit cannot open the browser grid even though its reads are public. Expired cookies also cause public snapshots to reject authentication in `convex/cloud/read.ts:10` rather than treating the viewer as anonymous.

Allow anonymous human reads without session creation. Create credentials only for actions that need them. Handle invalid visitor cookies without blocking public world access; preserve strict Bearer failure for authenticated write intent.

### P2 — First-contact discovery fetches the entire nearby geometry

`convex/cloud/read.ts:29` embeds full bounded snapshots for every nearby room. The onboarding entry instructs newcomers to fetch this response before choosing a room. Fresh measurement of `/api/plots?x=4&z=-1`: 107,650 bytes, four rooms, 331 objects. The existing `/api/plots/plot-4--1/neighbors` response was only 381 bytes and already exposes cardinal room metadata, but the entry guide does not direct agents there.

Prefer the existing lightweight neighbors endpoint for initial orientation; add a summary view for nine-cell discovery when needed. Keep detailed room reads explicit. Viewer transport and agent orientation need different payload sizes. Preserve full geometry for rendering rather than globally reducing snapshot limits.

### P2 — Room lifecycle is incomplete

`convex/cloud/write.ts:8-17` supports creating rooms, and `convex/cloud/http.ts:64-74` supports brief/object edits. There is no public room rename/archive/restore flow. A creator can remove their own objects but cannot correct the room name or retire an abandoned room. Emptying a room also must not silently delete another agent's contributions.

Add creator-owned rename and reversible archive/restore with clear collaborator handling. Immutable library versions are intentional: do not add destructive mutation of referenced assets simply to satisfy a mechanical CRUD checklist. A future unlist operation can hide a version from discovery while preserving references.

### P2 — Retry metadata does not reflect actual quota windows

`convex/cloud/http.ts:7` always supplies Retry-After: 60 for 429 responses. Registration and room creation use hour-long windows (`session.ts:9`, `write.ts:12`), so repeated minute-spaced retries may continue failing for nearly an hour. The onboarding tells agents to honor Retry-After, making inaccurate server guidance especially costly.

Return the remaining window duration from the quota layer and propagate it into Retry-After. Keep permanent quotas distinguishable from temporary rate limits. Test both minute and hour windows.

### P3 — Prepared responses expose a misleading legacy revision

`convex/cloud/http.ts:59,63` hardcodes baseRevision: 0. The new API guide warns agents not to use it, but a fresh client may reasonably mistake it for the current revision. Remove the field with an explicit contract transition or replace it with a clearly named preparation/snapshot version. Concurrency should remain per-object.

## Onboarding and capability assessment

| Principle | Assessment |
| --- | --- |
| Human/agent parity | Core outcomes covered: browse/read rooms, inspect a rendered scene, share/invite using public URLs. Exact camera pose is a presentation concern, not an automatic requirement for a new agent endpoint. |
| Primitive granularity | Good: raw object edits remain available beside builder/asset shortcuts. |
| Composability | Demonstrated: different room briefs yielded a conservatory, clock workshop and bindery without new workflow code. |
| Shared workspace | Good: public agents and browser use the same Convex world. Browser refresh is polling, not instantaneous reactive streaming. |
| Dynamic context | Current room URL is included in the invitation, and live room/tool reads exist. Lightweight discovery should improve. |
| Progressive disclosure | Good: short invitation → skill.md → focused API/design/library references, with llms.txt discovery. |
| Outcome testing | Fresh-agent success is demonstrated, including the 102-object Lantern Bindery from only the invitation. This is not a cross-model reliability benchmark. |
| Capability discovery | Builder catalog exists; lifecycle/session capabilities remain primarily documented as prose. Add structured capability metadata only when real clients need it. |
| Improvement over time | Partial: hosted guidance can be refined and room state persists. No private durable agent context or work-in-progress record exists. |
| Completion/resume | The external agent reports completion to its user. Agartha has no first-class run/checkpoint/completion records. This becomes a product gap when showing room progress or supporting handoff; do not invent a hosted execution engine solely to add complete_task. |
| Native mobile storage/runtime | Not applicable: this is a web viewer with externally hosted agents, not a native agent runtime. |
| Self-modification | Not required by the product. Agents author room data, not server code. |

## Recommended next implementation

1. Stable identity and credential renewal/rotation, with ownership-preservation tests.
2. Anonymous viewer reads and accurate rate-limit guidance.
3. Lightweight agent discovery and creator room rename/archive/restore.
4. If ongoing room maintenance is a product goal, add private creator context, explicit checkpoint/progress/completion records, and readback for a returning agent. Keep private notes separate from public room descriptions.

## Verification and limits

Fresh targeted run: six tests passed in `convex/cloud.test.ts` and `scripts/agentDocs.test.ts`. Public payload sizes above were measured directly during this review. Ownership expiry and lifecycle findings come from current source; this review did not expire production credentials or delete rooms. Earlier real-agent builds demonstrate initial onboarding/creation only, not 30-day recovery. No production settings, credentials or room contents were changed.
