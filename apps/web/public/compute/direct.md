# Direct Blender

Use this advanced path when the user wants their own agent to control Blender. Direct reservations cover Blender compute only; separately billed planning, model inference, image inspection, and review remain your responsibility. Start with [the modeling guide](modeling.md), [OpenAPI](openapi.json), and the current public pricing response.

Use the origin serving this document as `BASE`. Workers run Blender 5.2.1 LTS with two CPU cores, 4 GiB RAM, no GPU, and no outbound internet. Use `BLENDER_EEVEE`; `BLENDER_EEVEE_NEXT` is invalid. Prepare code and acceptance checks before paid compute. Tool calls can take 90 seconds, so allow at least 150 seconds at the client boundary.

## Plan and fund

Record the desired model, intended use, observable acceptance criteria, and maximum total task usage budget. Bound Compute, external model inference, and review separately. The service enforces each Compute hold, not a total across those systems. Stop or reduce scope when the remaining budget cannot cover validation, export, and cleanup.

Register or recover a stable identity through `POST BASE/api/session`; never replace an identity to recover its wallet. Check `GET BASE/api/blender/pricing` and `GET BASE/api/blender/balance`.

Buying credit needs separate approval. For Checkout, create a purchase, POST its `/checkout` route, and share the returned `paymentUrl` unchanged. It can contain an opaque fragment. For MPP, create with `"paymentRail":"mpp"`, POST `/mpp`, and set the payer spend limit. Retry the same purchase ID and payload after uncertainty. See [billing and payment recovery](../agents/blender-billing.md).

## Reserve and run

Create a quote, inspect it, then reserve with Bearer authentication:

```http
POST BASE/api/blender/quotes
{"quoteId":"quote-unique-1","requestId":"quote-unique-1","minutes":10}

POST BASE/api/blender/sessions
{"quoteId":"quote-unique-1","reservationId":"session-unique-1","requestId":"session-unique-1"}
```

Reservations allow 5–30 minutes. Pricing returned by the API is authoritative. The reservation returns `startUrl`, `statusUrl`, `stopUrl`, `toolsUrl`, `artifactsUrl`, and `mcpUrl`. POST `startUrl`, then poll `statusUrl` until running or terminal.

GET `toolsUrl` with Bearer authentication and a unique `X-Agartha-Operation-Id` to discover schemas. POST tool calls to the same URL, or connect a Streamable HTTP MCP client to `mcpUrl`. REST and MCP share one operation namespace and balance. Check `isError` even on HTTP 200.

Use a fresh operation ID for each distinct action. Reuse an ID only with an identical payload to recover a lost response. Observe uncertain operations; never blindly reissue them under a new ID.

Build in stages. Inspect real viewport images and scene/object state, compare against the acceptance criteria, and revise before delivery. Primitives are a blockout unless the brief asks for that style. Materials and render resolution do not replace adequate form.

## Download and stop

Write exports under `/workspace/artifacts`. Download required `.glb`, `.blend`, or `.png` files from `artifactsUrl` while the session is running. Use only filenames accepted by [OpenAPI](openapi.json). Inputs retain their own licenses; public sharing or Agartha import is a separate action.

POST `stopUrl` even after failure, then poll until settlement is confirmed. Report actual Compute and external inference/review costs, unresolved costs, remaining defects, and why work stopped. A timeout is not confirmed shutdown.

Workers stop after 60 idle seconds. Checkpoints last seven days after the latest paid session and account storage is bounded. See the [full constraints, settlement, and resume guide](../agents/blender-billing.md) and [advanced Blender toolkit](../agents/blender-advanced.md).
