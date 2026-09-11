---
name: 3d-for-agents
description: Create a private Blender model from a brief and one approved total budget.
---

# Managed 3D creation

Use the origin serving this document as `BASE`. Managed creation owns Blender work and private delivery. Workflow version 3 adds a separate modeling plan and independent review of the exported GLB. No Agartha room, SDK, local Blender, MCP client, or model API key is required.

Read `GET BASE/api/blender/capabilities` and proceed only when `managed.enabled` is true. Claim version-3 acceptance only when `managed.workflowVersion` is `3` and the job records an accepted review. Save a stable agent identity and its separate recovery credential using [the identity guide](../agents/identity.md), then read `GET BASE/api/blender/balance`.

Obtain approval for the exact brief and one total cap from $1 to $20. The cap includes service inference and Blender compute and never increases automatically. A small cap may end with an honest `partial` or `failed` result. A completed reviewed job is evidence of checks performed, not a promise of artistic quality or fitness for use.

## Create once

Save unique IDs and the exact payload before sending it:

```http
POST BASE/api/blender/jobs
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{"jobId":"model-unique-1","requestId":"model-request-1","brief":"A ceramic teapot with a wide handle and subtle leaf details, for a game","budgetCents":500}
```

For workflow version 3, an omitted `referenceMode` uses generated references when the cap is at least $5 and `managed.references.enabled` is true. Reference generation stays inside the same cap. To work without generated references, send `"referenceMode":"none"`. Never raise the cap to activate references.

The create call atomically reserves the cap. Start with `POST BASE/api/blender/jobs/model-unique-1/start` and `{}`. Poll `GET BASE/api/blender/jobs/model-unique-1` with bounded waits. After an uncertain create or start response, reuse the same IDs and exact payload and observe that job. Do not dispatch a replacement. Cancel with `POST BASE/api/blender/jobs/model-unique-1/cancel`.

Status is `queued`, `running`, `completed`, `partial`, `failed`, or `cancelled`. Report `chargedAiCents`, `pendingAiCents`, `computeChargedCents`, `computeStatus`, and `visuallyInspected`. Pending usage is unresolved, not refunded. Unused settled credit remains in the wallet.

Download only returned authenticated artifact links. A checkpoint may expose `model.glb`, `model.blend`, `preview.png`, `review.json`, and sometimes `turnaround.mp4`; generated-reference jobs can also expose `reference.jpg`. Save copies within seven days. Keep credentials and private artifact URLs private. Inspect the model for its intended use before publication.

## Fund only when needed

Buying prepaid credit is a separate cash approval and never starts a job. The wallet supports $5 or $20 purchases, human-assisted Checkout, and agent MPP payments. Reuse purchase IDs after uncertainty.

For Checkout, create a purchase and POST its `/checkout` route, then give the user the returned `paymentUrl` unchanged. For MPP, create it with `"paymentRail":"mpp"`, POST its `/mpp` route, and set the payer limit explicitly. Follow [billing, payment, settlement, and recovery constraints](../agents/blender-billing.md). A redirect is not proof of credited balance.

Use [OpenAPI](openapi.json) for request schemas, [modeling guidance](modeling.md) for better briefs and evaluation, and [Direct Blender](direct.md) only when the user explicitly wants their own agent to control a paid Blender session.

## Reuse before modeling

Search Agartha components and templates first. For suitable ready-made props, managed agents can use `search_polyhaven` and `load_polyhaven`; the service packages a bounded 1K model with textures, retains Poly Haven credit, and requires visual review. See the [Poly Haven workflow](../agents/polyhaven.md). Use existing bundled PBR materials for finishes, and continue authoring if no suitable asset is available.
