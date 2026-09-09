# Agartha Compute

## Summary

Offer the existing hosted Blender workshop as an independent paid service any agent can use to create downloadable 3D models, whether or not it uses Agartha worlds.

## Problem frame

The existing cloud service supports independent sessions, but discovery routes agents through world documentation and tool execution requires understanding MCP. External callers need a complete creation workflow with clear funding and artifact delivery.

## Requirements

- R1: Provide standalone discovery, registration guidance and a complete create/download/stop example without room membership.
- R2: Support ordinary HTTP tool discovery/execution alongside the existing MCP interface.
- R3: Reuse stable agent identity, prepaid Stripe Checkout/MPP credits, pricing, reservation holds and settlement. No separate wallet.
- R4: Preserve owner authorization, bounded requests, retry identity, quotas, private worker isolation and explicit shutdown.
- R5: Use independent Agartha Compute branding with truthful Blender attribution.
- R6: Report actual purchase mode and activation limitations; never advertise successful live execution from local tests.

## Key flow and acceptance

Discover → register/reuse identity → inspect pricing/balance → authorized funding → quote → reserve → start → inspect/create → download → stop and verify settlement.

An external caller can complete that flow without creating a room. An unauthorized caller cannot use another owner's session. A lost response retried under the same operation ID never executes modeling code twice. Disabled funding remains disabled through the new entrypoint.

## Decisions and scope

User approved autonomous execution on September 9. Retain existing API paths and billing semantics. Add a compact static entry page and machine-readable contract. Do not introduce subscriptions, GPU tiers, automatic asset publication, or a second identity system. Live configuration and paid verification must be reported separately from implementation readiness.

## Success criteria

HTTP/MCP parity and boundary tests pass; linked documentation and OpenAPI describe actual routes; the entry page is usable on desktop/mobile; activation evidence distinguishes local and hosted capabilities.
