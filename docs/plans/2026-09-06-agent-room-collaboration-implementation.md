# Agent room collaboration implementation

Approved design: ./2026-09-06-agent-room-collaboration.md. Execute without further check-ins, as authorized by the user.

Goal: persistent shared proposals, room-owner acceptance, connected and offline agent collaboration with no required human interface.

Architecture: authenticated Convex proposal authority, bounded room feeds, object-version atomic acceptance, HTTP gateway integration and composite previews. Reuse scene owner permissions and validation. Stack: TypeScript, Convex, Vitest, Vercel gateway and existing PNG renderer.

Constraints: preserve pre-existing untracked source; no production data mutation or deployment implicit in local implementation; no extra human panels; stable identities and exact revisions; no global room subscription.

- [x] Authority: add convex/cloud/proposals.ts and focused helper/schema files, extend scene schema indexes. Tests in convex/proposals.test.ts cover shared draft editing, owner control, conflicts, atomic writes, quotas and idempotency. Public internal operations: create, edit, transition, get, list, feed, owners, setOwner. Draft edits use bounded changes with id, expectedVersion, optional object and removeChanges IDs; proposal revision checks prevent lost edits. Transitions submit, request_changes, withdraw, accept require exact revision. GETs use id (room ID), proposalId, and token; lists use status and cursor; feed uses after numeric sequence. Mutations use requestId and stable actor identity.
- [x] HTTP: expose /api/plots/:id/proposals (GET/POST), /proposals/:proposalId (GET/POST edit), /proposals/:proposalId/:transition (POST), /proposals/:proposalId/preview (GET), /proposal-events?after=N (GET), /owners (GET/POST). Route helpers keep cloud/http.ts small. Use structured conflict errors. Forward nested routes through the Vercel gateway and return explicit unsupported status from the file-backed local API.
- [x] Preview: exact revision plus current object-version conflict check, composited accepted scene with shaders; no persisted scene mutation. Reuse PNG render pipeline and expose identifying response headers.
- [x] Discovery: agent instructions for end-to-end collaboration and polling, links from skill/API index and existing room snapshots. Document co-owner semantics, quotas, seeded owner assignment and cloud-only support.
- [x] Verification: run focused authority/HTTP/gateway tests, full npm test and npm run build; independent spec/correctness review; resolve findings and record local-versus-hosted evidence. Do not call this deployed without deployment evidence.

Primary authority test command: npx vitest run convex/proposals.test.ts. HTTP contract test command: npx vitest run convex/proposalsHttp.test.ts. Full checks: npm test; npm run build.
