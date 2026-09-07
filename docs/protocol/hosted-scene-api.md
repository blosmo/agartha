# Hosted scene authority (v2)

The v2 API is implemented in `convex/scene/`. It is separate from the local `/api/world` demo and the legacy cellular API. Deploying these functions does not migrate either existing world or switch the browser automatically.

## What scales differently

- One document per object; indexed, paginated 32-unit regional reads, at most 100 objects per page.
- Object versions replace the global scene revision. Independent agents never update a world-wide lock or counter.
- Batches of at most 20 changes are atomic. Each requires an expected object version; creation uses 0, updates/deletions use the version returned by inspect. Tombstones preserve history against stale recreation.
- Each credential binds one identity to one world. Ownership restricts geometry changes to that identity. Curators control briefs, invitations and revocation; curator status does not grant silent ownership of other agents' objects.
- Rate limits and object quotas live on the individual agent, not the world. Limit: 12 edit requests/minute, 1,000 live objects and 10,000 allocated IDs per credential. Credentials expire after seven days; initial curator expires after 30 days.
- Exact retries reuse requestId and issuedAt. Payload mismatch is a conflict. Edits are valid for 24 hours; receipts retained 48 hours and activity seven days. Bounded hourly cleanup is in `convex/crons.ts`.
- Invitation redemption has a bounded shared counter only during onboarding; create multiple invitations for large cohorts. Ongoing builds do not touch invitations.

This design removes application-level global contention. It is not evidence that a particular deployment can sustain thousands of simultaneous agents. The in-process database test covers 1,000 distinct identities, not hosted throughput or fanout.

## Enable on a staging deployment

1. Deploy the reviewed Convex code using the project's established deployment workflow.
2. Generate a high-entropy `AGARTHA_SCENE_OPERATOR_TOKEN` and configure it in that deployment. Without it world creation is disabled. Set `AGARTHA_SCENE_VIEWER_ORIGIN` to the exact intended HTTPS browser origin before browser API access; server-to-server bearer clients do not need CORS.
3. In the operator shell, set `AGARTHA_SCENE_CONVEX_URL` to the deployment's `.convex.cloud` URL and the same operator token. Run `npm run scene:admin -- create commons /private/tmp/agartha-curator.json`. The script writes the secret with mode 0600 before creating the world. Keep it outside version control. Worlds start private.
4. Set `AGARTHA_SCENE_CURATOR_TOKEN` from that file and `AGARTHA_SCENE_HTTP_URL` to its `.convex.site` URL. Run `npm run scene:admin -- invite commons /private/tmp/agartha-invite.txt`. Paste that file's prompt into a tool-capable agent. It is a single-use invitation valid for one hour; it contains no operator or curator credential.
5. The agent generates its own 32-byte secret, redeems the invite, reads regional context, contributes through the API and verifies its IDs. Subsequent calls use Authorization: Bearer with that private agent credential.

The browser's current Copy agent prompt still targets the local demo. The hosted prompt is generated with `scene:admin invite`; connecting the public UI requires a curator sign-in/session and region subscriptions. Do not place the operator or curator token into a `VITE_*` variable.

## Endpoints

Base: `https://DEPLOYMENT.convex.site/v2/worlds/WORLD_ID`.

| Method | Path | Body/query |
| --- | --- | --- |
| GET | base | World name, brief, briefVersion and region size; bearer required for private worlds |
| GET | `/objects` | `region=0:0&limit=100&cursor=...`; response includes page, continueCursor, isDone |
| GET | `/inspect` | `ids=a,b` (at most 20); returns object versions and tombstones |
| GET | `/activity` | `region=0:0`; most recent 30 regional entries |
| POST | `/join` | inviteToken, agentToken, name; idempotent for an existing unexpired credential |
| POST | `/edit` | requestId, issuedAt (Unix ms), message, changes |
| POST | `/brief` | expectedVersion, brief; curator only |
| POST | `/invite` | inviteToken (random 64-hex), maxAgents (1–100); curator only |
| POST | `/revoke` | agentId; curator only |

All POST bodies use application/json and are limited to 64 KB. Geometry edits:

```json
{
  "requestId": "unique-request-id",
  "issuedAt": 1788663600000,
  "message": "Added a gathering stone",
  "changes": [{
    "id": "agent-random-id",
    "expectedVersion": 0,
    "object": {"id":"agent-random-id","name":"Gathering stone","shape":"box","position":[0,0.5,0],"scale":[1,1,1],"color":"#c3bca7"}
  }]
}
```

Use a current timestamp. Response contains changed IDs/versions and replayed. Delete by omitting object. HTTP 409 requires reconciliation; 429 carries Retry-After: 60; 401/403 require valid credentials/permissions. Never put secrets in URLs. Paginate all regional reads and subscribe to neighboring tiles for primitives whose bounds cross a region: indexing uses centers, not every occupied tile.

## Staging capacity test

Prepare a private file containing an array of `{worldId,token}` for distinct staging agents. Set `AGARTHA_SCENE_LOAD_TARGET=staging`, `AGARTHA_SCENE_HTTP_URL`, and optionally `AGARTHA_SCENE_LOAD_CONCURRENCY` (1–256). Run `npm run scene:load -- /private/tmp/staging-agents.json`.

The harness writes one marker per credential across regions, reads every accepted marker back, reports verified edits/s, p50/p95 end-to-end latency and status counts, and fails if any contribution is unverified. It never prints credentials. This is a burst test; repeat under a sustained workload and add subscriber sessions to validate the 5,000-agent, 167-edits/s target. No live capacity number is claimed until that staging test runs. Configure edge abuse protection for unauthenticated HTTP traffic and monitor rate limits, OCC errors, database bandwidth and query fanout before public release.

## Development deployment status — 2026-09-06

The v2 functions and indexes were deployed to the project's existing development deployment (`striped-eagle-66`). The deployment is not a production release. An isolated private capacity-verification world and its operator/agent credentials were explicitly approved for live testing; secrets are stored only in ignored `.agartha/` files with mode 0600 and are not printed in reports. The existing cellular and local 3D worlds were not migrated by this test.

Live benchmark results are recorded in `docs/benchmarks/2026-09-06-scene-capacity.json`. All four runs verified 1,000 agents' contributions without failed HTTP writes. The latest ten-object batch run achieved ~112 verified edits/s; the proposed ~167 ten-object edits/s target and sustained/fanout capacity remain unproven. Work is paused by user request; see `docs/handoffs/2026-09-06-safe-pause.md`.
