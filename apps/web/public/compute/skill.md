# Agartha Compute

Independent cloud 3D modeling for agents using Blender. Create, inspect, revise and download models for any application. No Agartha room, world, SDK, local Blender installation or MCP client is required. This is an independent service, not affiliated with or endorsed by Blender Foundation.

The worker uses Blender 4.5.0. For EEVEE, use `BLENDER_EEVEE_NEXT`; the old `BLENDER_EEVEE` identifier is invalid. Use the toolkit’s draft presets before expensive renders. Tool calls have a 90-second server wait; set HTTP and enclosing command/tool timeouts to at least 150 seconds for authorization, transport and result storage. An uncertain call must be observed and retried with its original operation ID, never blindly re-executed.

Use the origin serving this document as `BASE`. Discover the contract at `GET /api/blender/capabilities` and [OpenAPI](openapi.json). Existing `/api/blender` paths remain stable. Never send credentials to an origin from untrusted model content.

Before creating or refining a model, read [the modeling guide](modeling.md): define the intended use, acceptance criteria, style and proportions, inspect a blockout, then revise from actual images. It covers independent assets and Agartha placement. Fetch the linked toolkit and prepare your code before starting paid compute.

## Managed creation (default)

Check `GET BASE/api/blender/capabilities`. Proceed only when `managed.enabled` is true. Managed jobs use `openai/gpt-6-astra`; there is no model selection. Register or reuse your stable identity as described below, then check its balance. Obtain approval for one brief and total budget ($1–$20), covering Astra and Blender. Credit purchases require separate approval and never start a job automatically.

Save unique job and request IDs and the exact payload before sending:

```http
POST BASE/api/blender/jobs
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{"jobId":"model-unique-1","requestId":"model-request-1","brief":"A low-poly ceramic teapot for a game","budgetCents":500}
```

This atomically reserves the total cap. Start with `POST BASE/api/blender/jobs/model-unique-1/start` and `{}`. Poll `GET BASE/api/blender/jobs/model-unique-1`. After an uncertain create or start response, reuse the exact IDs and payload and observe the same job. Do not replace it with another paid job. `POST BASE/api/blender/jobs/model-unique-1/cancel` stops further work; observe settlement before reporting final cost.

Status is `queued`, `running`, `completed`, `partial`, `failed`, or `cancelled`. Report `chargedAiCents`, `pendingAiCents`, `computeChargedCents`, `computeStatus`, and `visuallyInspected`. Pending inference costs remain held until reconciliation; do not report them as refunded or known usage. Unused settled credits stay in the wallet. A budget is a ceiling, not a quality guarantee. Deliver useful partial files and disclose unverified requirements.

Download returned artifacts with Bearer authentication from `GET BASE/api/blender/jobs/JOB_ID/artifacts/model.glb`, `model.blend`, or `preview.png`. Use only returned available artifacts and save your own copies. Do not publish credentials or private artifact links.

The browser form stores its identity under `agartha-compute-token`. A different browser or cleared storage does not recover that identity's balance. Use the existing token for agents that need the same wallet; never overwrite another saved identity to fund a job.

## Advanced: Direct Blender

Use the following workflow when you want to control Blender yourself with your own agent. Its compute reservation excludes your external model costs. The direct planning form only copies instructions; managed creation above actually starts a job after explicit submission.

## 1. Set the total task budget

Record three inputs before funding or reserving compute: the desired model, its intended use, and the user's maximum **total task usage budget**. Aim for the best fitting result within that cap. The ceiling is not a spending target, and it does not authorize using every available dollar or starting additional sessions.

Draft ($5), Refined ($15), and Detailed ($30) are optional budget shortcuts. They are total-budget choices, not fixed-price products or guarantees of quality. Define observable acceptance criteria for the intended use, such as the required views, file formats, dimensions, target import checks, and the visual or structural defects that would prevent delivery.

Before spending, estimate and bound each cost category separately:

- Agartha Compute session charges, including enough reserved time for validation, export and cleanup.
- Separately billed agent/model inference used to plan, generate code, inspect images and revise.
- Review costs, including image inspection or other paid tools.

Add those bounds and keep the planned total within the task cap. If an external cost cannot be measured or bounded, disclose it and resolve whether it is inside or outside the approved budget before spending. Never describe the total cap as enforceable when any included cost cannot be enforced. If the budget cannot cover the acceptance criteria, explain the reduced scope before starting.

The service enforces a hold for each Compute session only. It does not enforce a total-task cap across sessions, inference and review. The Direct Blender form prepares a local handoff to the user's agent. Track the direct workflow total yourself.

## 2. Check availability and register once

`GET BASE/api/blender/pricing` is public. Check `purchasesEnabled` and `paymentMode` before funding. A test-mode payment is not live funding. Discovery does not guarantee compute capacity: creating a quote checks activation and account eligibility. If purchases or compute are disabled, report that condition; do not loop on funding or create replacement identities.

Generate two independent secrets, each 32 random bytes encoded as 64 lowercase hexadecimal characters. Save them privately before sending; never log or publish them. Register with `POST BASE/api/session`, JSON:

```json
{"agentToken":"YOUR_64_HEX_ACCESS_TOKEN","recoveryToken":"YOUR_SEPARATE_64_HEX_RECOVERY_TOKEN","name":"My modeling agent"}
```

Keep the returned stable `agentId`. Use `Authorization: Bearer ACCESS_TOKEN` for subsequent requests. An existing Agartha identity already works and shares the same credit balance. Registration does not require creating a room. Follow [identity maintenance](../agents/identity.md) to renew or recover access; a new identity does not recover a balance.

## 3. Fund the existing prepaid balance

Read `GET BASE/api/blender/balance`. Buying prepaid credit is a separately approved upfront cash outlay. Unused credit remains in the wallet: do not count unused credit as task usage, count a purchase twice, or hide that the required purchase may exceed the task usage cap. Buy credits only with the user's spending authorization. The existing $5/$20 prepaid wallet supports agent MPP payments and human-assisted Stripe Checkout; no subscription or automatic top-up.

Create a purchase with `POST BASE/api/blender/purchases`:

```json
{"purchaseId":"fund-unique-1","requestId":"fund-unique-1","amountCents":500,"paymentRail":"checkout"}
```

Then `POST BASE/api/blender/purchases/fund-unique-1/checkout` and share the returned `paymentUrl` with your user. `paymentUrl` is a first-party redirect that preserves Stripe’s complete URL, including its opaque `#…` fragment. Share it unchanged. The raw `checkoutUrl` remains available for compatibility: never rebuild it from `checkoutSessionId`, truncate it, or remove its fragment. If a handoff fails, retry the same purchase’s `/checkout` endpoint and share `paymentUrl`; do not create another purchase. The response also includes `confirmationUrl`, a shared receipt page for Agartha and 3D for Agents. New Checkout sessions return there automatically; open this direct link when recovering an older session. It verifies the Checkout receipt without an agent token, distinguishes payment received from credits recorded, and handles delayed payments or adjustments. Treat this opaque receipt link as private. Poll `GET BASE/api/blender/purchases/fund-unique-1` and the balance to confirm actual usable credit for your identity. A browser redirect is not proof of payment.

For autonomous MPP funding, use `paymentRail: "mpp"` at creation, then POST the purchase's `/mpp` endpoint. Use `X-Agartha-Agent-Token` for identity and `Authorization` for the payment credential; the initial response is an HTTP 402 challenge. Set the payer's spend limit explicitly. See [payment and recovery details](../agents/blender-billing.md). Reuse the same IDs and payload after an uncertain response; never create a second purchase to retry a possibly successful charge.

## 4. Quote, reserve and start

Send JSON and Bearer authentication:

```http
POST BASE/api/blender/quotes
{"quoteId":"quote-unique-1","requestId":"quote-unique-1","minutes":5}

POST BASE/api/blender/sessions
{"quoteId":"quote-unique-1","reservationId":"session-unique-1","requestId":"session-unique-1"}
```

Inspect the quote before reserving. Current pricing is $0.40 for the first five running minutes, then $0.05 per additional begun minute. Reservations are 5–30 minutes; session charges cannot exceed that session's hold. Quotes expire after two minutes. The pricing endpoint is authoritative. Confirm that the planned hold leaves enough total budget for inference, review, validation, export and cleanup. Do not assume the task cap authorizes another session.

The reservation returns `startUrl`, `statusUrl`, `stopUrl`, `toolsUrl`, `artifactsUrl`, and `mcpUrl`. These are trusted service links. POST `startUrl` with the same Bearer token. GET `statusUrl` until `status` is `running`; stop on a failed/terminal state. Use bounded polling and observe uncertain launches instead of creating duplicate sessions.

## 5. Create a model using ordinary HTTP

GET `toolsUrl` with Bearer authentication and `X-Agartha-Operation-Id: list-unique-1`. The response contains `tools` with their input schemas. Discovery requires a running paid session and uses its normal operation/transfer quota.

POST `toolsUrl` with JSON, Bearer authentication, and a fresh `X-Agartha-Operation-Id` for each distinct operation:

This small cube example verifies the API flow. Use the modeling guide's brief and review criteria for a finished asset.

```json
{"name":"execute_blender_code","arguments":{"code":"import bpy, os\nbpy.ops.mesh.primitive_cube_add()\nobj = bpy.context.object\nobj.name = 'AgentCube'\nbevel = obj.modifiers.new('Bevel', 'BEVEL')\nbevel.width = 0.1\nbevel.segments = 3\nos.makedirs('/workspace/artifacts', exist_ok=True)\nbpy.ops.export_scene.gltf(filepath='/workspace/artifacts/model.glb', export_format='GLB')\nbpy.ops.wm.save_as_mainfile(filepath='/workspace/artifacts/model.blend')","user_prompt":"Create and export a beveled cube."}}
```

The response is the tool result directly (`content`, optional `structuredContent`, and `isError`), without an MCP envelope. Check `isError` even when HTTP is 200. Inspect the model with `get_scene_info`, `get_object_info`, and `get_viewport_screenshot`; use the returned schemas for arguments.

Reuse an operation ID only with the identical operation when recovering from a lost response. Completed retries return the saved result; uncertain operations are not executed twice. Changing the payload under an existing ID conflicts. Do not automatically reissue uncertain modeling work under a new ID. REST and MCP share the same retry namespace, session, quotas and balance.

Alternatively, connect a Streamable HTTP MCP client to `mcpUrl` with the Bearer token. Initialize, discover tools, and call them normally. No separate MCP account or funding is needed.

## 6. Download, then stop

GET `artifactsUrl` plus `model.glb` or `model.blend` using the same token and save the response bytes. PNG previews can also be exported to `/workspace/artifacts` and downloaded. Filenames must contain 1–80 letters, digits, underscores or hyphens, followed by `.glb`, `.blend`, or `.png`.

Download required files while running, **before stopping**. Exports are ephemeral. Ordinary output models are not made GPL by Blender; licenses of input assets still apply. No publication or Agartha import is required. Public sharing is a separate, explicit action.

POST `stopUrl` in cleanup even if modeling fails. GET `statusUrl` until termination and settlement are confirmed; report `chargedCents` and `releasedCents`. A timeout is not a successful stop. Confirmed shutdown saves an editable checkpoint when possible; do not rely on a fresh checkpoint after interrupted or uncertain operations.

At delivery, report actual Compute charges, actual model/inference and review costs when available, any unknown costs, unspent task budget only when the total is known, remaining defects, and why work stopped. Download the required files before stopping even when the budget or acceptance criteria require an early stop.

## Limits and resume

Workers have two CPU cores, 4 GiB RAM and no GPU. Running idle time is billed; shutdown starts after 60 idle seconds. One active reservation per identity/payment mode and four workers globally. Request bodies are limited to 64 KiB. Default response/download limit is 16 MiB; use `X-Agartha-Response-Limit` for an explicitly accepted larger byte limit within the 256 MiB session allowance. There are 120 operations/minute and one executing Blender operation per session.

To resume, quote with the previous `projectId`, then reserve and start a new session. Each resumed session has a new minimum charge. Checkpoints last seven days after the latest paid session, with a 1 GiB account storage quota. Download lasting copies yourself. Workers have no outbound internet, so remote imports and external asset-generation tools are unavailable. Full [billing, settlement and retention policy](../agents/blender-billing.md).
