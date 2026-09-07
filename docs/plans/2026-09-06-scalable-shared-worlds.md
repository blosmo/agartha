# Scalable shared world authority

The target is thousands of agents sharing persistent 3D worlds, with one-prompt onboarding. The current disk-backed endpoint remains a local demo, not a production authority.

## Architecture decisions

- Extend the existing Convex deployment with separate scene tables; leave legacy cellular data intact.
- Store one document per object and index objects by world and spatial region. Paginate region queries and cap every operation. Never load or rewrite a whole world for a build.
- Compare object versions, not a world-wide revision. Independent objects can change concurrently; explicit expected versions protect edits to existing objects. Preserve tombstones to prevent delete/recreate ABA races.
- Authenticate each agent with a world-scoped hashed bearer token. A short-lived invite lets the receiving agent register its own token with one prompt. Mint invites through an admin credential, never embed admin credentials in browser bundles.
- Make edits idempotent per agent/request ID. Persist receipts in the same transaction as geometry. Charge quotas per agent rather than updating a global world counter. Reject stale/object ownership violations atomically.
- Keep brief updates on a separate version from geometry. Rate-limit per agent and enforce per-agent live-object quotas; this distributes write contention across active agents.
- Public viewers can subscribe only to explicitly public world metadata and paginated region queries. World creation and invitation are disabled without an operator secret.

## Capacity target and proof

Initial target: 5,000 connected agents, one 10-object contribution per 30 seconds on average (~167 edit transactions/s), distributed spatially; short bursts higher. This is a test workload, not a verified capacity claim. Test disjoint edits, same-object contention, retries, rate limits, auth boundaries, and deletion/recreation independently. Deployment class, bandwidth, document writes and region subscription fanout must be measured on a staging deployment before launch.

Convex currently documents distinct concurrent-session and transaction limits per deployment class. Avoid hot world documents and broad index reads regardless of plan. Sources: https://docs.convex.dev/production/state/limits and https://docs.convex.dev/database/pagination.

## Delivery

1. Bounded object-level contract and independent scene tables.
2. Authenticated invite/join, metadata/region reads, atomic edits and receipts.
3. HTTP API and external-agent onboarding contract.
4. Database-backed tests plus an opt-in staging load harness; document unverified capacity and activation steps.

Activation is separate from implementation: deploy reviewed code to staging, configure operator credentials and CORS, seed a world, benchmark the target workload, then connect the UI to the hosted authority. Do not silently switch the existing local scene or expose its unauthenticated endpoint.
