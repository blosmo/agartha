# Agartha Compute: independent agent service

## Scope

Public brand: **3D for Agents**, powered by Agartha Compute. Canonical entry page: `https://3dforagents.com/compute/`; the domain root redirects here. On that hostname, `/skill.md` and `/llms.txt` route to the managed Compute guides before the generic fallback. `www.3dforagents.com` redirects to the apex domain. These routes are hostname-scoped so the Agartha origin keeps its world homepage and onboarding documents. Managed guide: `/compute/skill.md`. Direct Blender guide: `/compute/direct.md`. OpenAPI: `/compute/openapi.json`. Public discovery: `/api/blender/capabilities`. Stable legacy billing URLs remain unchanged; the same identity and wallet work with Agartha worlds or independently.

The broker adds `GET /sessions/{reservation_id}/tools` and `POST /sessions/{reservation_id}/tools`. Both require Bearer authentication and a stable `X-Agartha-Operation-Id`. POST accepts `{name, arguments}`. The adapter feeds the existing `Broker.call` path, preserving payload fingerprints, durable results, transfer accounting, serialization and ownership. No ledger migration or additional payment authority is introduced. MCP remains compatible.

Reservation responses now include `statusUrl`, `toolsUrl` and `artifactsUrl` as well as the existing lifecycle/MCP links. Clients download before stopping. World publication is optional, explicit and separate.

## Modeling guidance

`/compute/modeling.md` is the shared art-direction and visual-review workflow for independent assets and Agartha scenes. `/agents/blender-quality.md` retains the technical toolkit, preview and export guidance. Discovery exposes `modelingGuide`, `toolkitGuide` and `toolkit`; the Compute guide, Agartha onboarding, room design guide and MCP initialization point agents into the workflow. The guide starts with the desired model, intended use, observable acceptance criteria and maximum total task usage budget. It asks for actual image inspection, separates target-specific requirements, and does not claim measured aesthetic improvement or authorize more spending/publication.

Budget planning precedes funding and reservation. Draft ($5), Refined ($15), and Detailed ($30) are optional total-budget shortcuts, not quality guarantees or prices for a completed asset. The agent aims for the best fitting result under the cap and stops when acceptance criteria are met, further iteration is unlikely to help, or budget must be preserved for validation, export and cleanup. It retains the best checkpoint and prioritizes defects evidenced in inspected images.

The total plan separately bounds Compute sessions, agent/model inference, review, validation, export and cleanup. If an external cost cannot be measured or bounded, the agent must disclose it and resolve whether it is inside or outside the approved scope before spending; it must not claim that the total cap is enforceable. The server enforces per-session holds only. The entry-page form creates a local agent handoff, not a managed or automatically executed job, so the client remains responsible for cross-service accounting and must not assume authorization for more sessions.

Prepaid funding is a separately approved cash outlay. Unused credit remains in the wallet and is not task usage; clients must neither double count it nor conceal when the available purchase denomination exceeds the task cap. Delivery reporting includes actual Compute, inference and review costs, unknown costs, unspent budget only when known, remaining defects and the stopping reason. Required artifacts are downloaded before shutdown.

## Shared payment confirmation

`/payments/return/` serves a shared receipt screen on both domains, with links to Agartha and 3D for Agents. Checkout success URLs use the literal Stripe `{CHECKOUT_SESSION_ID}` placeholder; cancel and legacy return links show an unverified state. Checkout creation also returns a direct `confirmationUrl` for recovery. Both URLs use the configured billing origin so repeated attempts retain deterministic Stripe idempotency parameters.

The read-only `/api/blender/checkout-status?session_id=...` route treats the opaque receipt ID as narrowly scoped confirmation access. It verifies Stripe and immutable ledger bindings, then returns only state, USD purchase amount, payment mode and credited contribution when known. No account credentials, identity, current balance, email or payment object reach the page. Only the payment service can invoke the new Convex `getCheckoutReceipt` query. No schema change or new fulfillment path is introduced; webhooks and existing owner-authorized reconciliation remain authoritative.

The screen distinguishes processing, payment received awaiting credit, credited, adjusted, incomplete and expired receipts. Partial reversals and disputes use the payment record, not purchase status alone. It polls at most six times per visit/manual check and never creates another purchase. The contribution of a purchase is not the current spendable balance; the agent checks balance before computing. Test mode is labeled explicitly. The page and status route disable caching/indexing and referrer forwarding.

Deploy the compatible Convex query before the gateway. Verify both domains and the legacy root redirect. Automated tests use fixtures; a live customer charge is not required for page verification.

## Bounded modeling operations

The trusted broker waits up to 90 seconds for a tool result. The existing 120-second operation claim protects serialization and uncertain retries. A running claim suppresses the 60-second idle stop only while that claim remains unexpired; the idle-only shutdown claim rechecks recent activity and the operation atomically before fencing the session. Explicit stop, the paid session deadline, and terminal/unknown worker states retain priority. A call that remains uncertain is never executed again under a new ID automatically.

The broker query adds `activeOperationDeadline` as an ephemeral field from the existing operation index, and shutdown accepts a backward-compatible optional `idleOnly` flag. Deploy these Convex changes before the new broker. No schema, prices or billing holds change. HTTP and enclosing command timeouts should allow at least 150 seconds for authorization, transport and result storage.

The pinned worker is Blender 5.2.1 LTS; EEVEE uses `BLENDER_EEVEE`. The 4.5 `BLENDER_EEVEE_NEXT` enum is rejected. The technical guide and MCP initialization state the runtime/version and timeout bounds. Use draft previews before expensive renders and download deliverables before shutdown.

## License and commercial precedent — checked September 9, 2026

The published terms support charging for hosted use. Blender allows use for any purpose, including commercial work: [Blender license](https://www.blender.org/about/license/). GPLv3 section 0 excludes network interaction without a software copy from conveying: [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html). That supports this server-hosted model; it is not a legal opinion or a license review of every installed dependency.

Ordinary generated artwork and data files are not automatically GPL. Third-party assets retain their own terms. Distributing Blender binaries, worker images or derived add-ons is a separate compliance boundary requiring applicable licenses, notices and corresponding source. Do not describe the entire worker as MIT merely because original Agartha code is MIT.

The worker uses Blender 4.5.0 and a pinned `ahujasid/blender-mcp` checkout at `c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9`. Its [LICENSE](https://github.com/ahujasid/blender-mcp/blob/c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9/LICENSE) is MIT (Siddharth Ahuja, 2025), retained in the image. This does not override obligations for combined or derived Blender code. See `THIRD_PARTY_NOTICES.md`.

Use **Agartha Compute**, with Blender mentioned descriptively. Do not use “Blender Cloud for Agents” as our product name or register a Blender-containing domain without permission. [Trademark policy](https://www.blender.org/about/trademark-policy/). No implied Foundation endorsement.

Documented commercial precedents (offerings reviewed, not purchased/tested or independently cleared legally):

- [Brender Cloud](https://docs.brendercloud.com/docs/python-scripting/how-it-works): custom Python in a hosted Blender `bpy` environment.
- [RenderStreet](https://render.st/blender-render-farm/): paid rendering, custom scripts and REST integration.
- [FARPY](https://farpy.com/api): agent/MCP rendering with inspect, quote, wallet reservation, execution, download and receipts. Its documented contract focuses on rendering supplied projects; it does not establish parity with an interactive modeling sandbox.

## Pricing decision — retain v2

Launch at **$0.40 for the first five running minutes, then $0.05 for each additional begun minute**. Keep $5/$20 top-ups and the existing quotas. No price migration is needed. Examples: 5 minutes $0.40; 10 minutes $0.65; 15 minutes $0.90; 30 minutes $1.65. A $5 wallet funds twelve minimum-price sessions with $0.20 left, assuming no longer sessions or adjustments. This is a session price, not a promise of a successful model at a fixed price. Agent model/inference charges are separate.

Market grounding, checked September 9:

| Reference | Advertised pricing | Interpretation |
| --- | --- | --- |
| [RenderStreet](https://render.st/plans-pricing/) | CPU $3/server-hour; GPU $4.49/server-hour; CPU monthly from $59.97 | Rendering competitor with substantially different machines; not a performance-normalized comparison. Our continuation rate is $3/hour but the minimum raises effective short-session rates. |
| [Modal](https://modal.com/pricing) | Sandbox CPU $0.00003942/core-second and RAM $0.00000667/GiB-second | Two cores + 4 GiB cost about $0.38/hour for the worker alone, excluding startup, broker, storage, transfers and fees. |

Our maximum 30-minute session is effectively $3.30/hour; repeated five-minute sessions are $4.80/hour. Selling raw render throughput would be a weak position against larger render nodes at similar hourly prices. The reason to buy is ready-to-use interactive modeling, agent access, private sessions, editable checkpoints, predictable holds and usable exports. The agent still supplies the intelligence and modeling code.

The prior [cost model](paid-blender-cost-review.md) estimates maximum-data variable costs of $0.15066 domestic and $0.15666 international at the $0.40 minimum. This is roughly **165.5% / 155.3% markup on modeled variable cost**, or **62.3% / 60.8% contribution margin**. Markup is `(price-cost)/cost`; margin is `(price-cost)/price`. These are not net profit or invoice measurements. Observed workloads and their older prices are recorded separately; do not present those old margins as measured v2 results.

The current minimum is a reasonable launch hypothesis, not proven willingness to pay. Do not lower it to $0.25 with unchanged quotas: the prior maximum-data model falls to about 44–45% contribution. Do not raise it just because of nominal CPU markup: customers compare successful delivered work and friction. Revisit after an initial cohort of at least 20 independent paying identities or 100 paid sessions, using purchase conversion, first successful export, repeat funding, effective cost per delivered model, failure/refund burden and realized variable margin. Those sample thresholds are a practical review trigger, not statistical proof. Consider $0.50 only if repeat use is strong and realized costs justify it; retain quote-version compatibility for any later change.

## Deployment and verification

Deploy compatible schema, gateway, and broker code before activation. For an operator-only v3 verification, leave global `AGARTHA_MANAGED_WORKFLOW_VERSION` unset and configure the same initiating agent ID as `AGARTHA_MANAGED_WORKFLOW_OPERATOR_AGENT_ID` in Convex and Vercel; pooled and allowance jobs resolve the initiating identity rather than their funding wallet. Reference defaults also require matching reference availability settings. After verification, setting `AGARTHA_MANAGED_WORKFLOW_VERSION=3` in both runtimes changes only newly admitted jobs. Existing jobs and idempotent retries keep their persisted workflow version and resolved reference choice when any setting changes.

On September 9, a fresh read of production `/api/blender/pricing` returned `paymentMode: live` and `purchasesEnabled: true`. Earlier disabled-state runbook text was stale. Preserve the existing live configuration; this change does not enable, disable or replace billing credentials. Pricing does not prove worker availability or live payment delivery.

Deploy the broker adapter and gateway/static entrypoint together. Worker image changes and Convex migrations are not needed for this adapter. Keep unrelated worktree changes out of the deployment. Verify public discovery, returned session links, authenticated REST tool discovery/execution and artifact download before claiming a hosted end-to-end result. Existing account balances must never be synthesized for testing; use authorized funding only.

Focused checks: Python paid-broker suite; billing HTTP and reservation tests; script/Convex typechecks; web build; desktop/mobile entrypage inspection. Broker tests use simulated dependencies and do not prove live compute.
