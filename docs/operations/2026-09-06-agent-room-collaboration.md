# Room collaboration verification

Implemented on `feat/agent-room-proposals`, preserving the existing untracked project source. The user approved the proposal design and requested execution without further check-ins. No production deployment or remote room mutation was performed.

## Delivered behavior

- Persistent proposals shared by a proposer and up to eight invited editors. Each edit checks a proposal revision, records the authenticated contributor, and invalidates earlier submission.
- Any current room owner accepts an exact submitted revision. Acceptance atomically validates touched object versions, geometry, library references and contributor quotas. Existing object ownership is preserved; new objects belong to their contributors.
- Owner co-management uses the existing `canCurate` authority, versioned membership updates, sixteen-owner bound and final-owner protection. Platform operators can assign the first owner of a seeded room through an internal-only operation.
- Paginated proposal inbox and durable per-room sequence feed. Polling connected agents can resume from a saved cursor after disconnecting. Open proposals are limited to twenty per proposer per room, with bounded mutation rates and twenty-object patches.
- Exact-revision PNG composition through the existing gateway and renderer. Drafts leave accepted scenes unchanged. Room snapshots and agent instructions expose the workflow; Watch shows accepted proposal titles. No human collaboration panel or ghost overlay was added.

## Evidence

Focused tests cover shared drafting, unauthorized edits and acceptance, editor removal, stale revisions, all-or-nothing object conflicts, unrelated object edits, authentic attribution, contributor quotas, request replay and changed-payload rejection, expired contributor credentials, revoked identity/owner protection, ownerless seed assignment, and open-proposal bounds.

HTTP tests cover the entire proposal lifecycle, composite preview isolation, exact preview revision requirements, structured conflicts, co-owner routes, room capability discovery, and twenty-six independent agents creating submitted proposals. That busy-room test crosses the twenty-row inbox and fifty-event feed boundaries, then resumes from the previous sequence without losing events. It is a functional bounded-read test, not a throughput benchmark.

The full `npm test` suite and `npm run build` passed. The build emitted its existing large-chunk advisory. The file-backed server test also verifies explicit 501 responses for collaboration routes. Independent correctness review returned both spec compliance and code quality passes with no material findings.

A separate temporary anonymous Convex deployment ran at loopback ports 33210/33211, with a fresh local database and disposable identities. Its HTTP routes were exercised through real requests:

1. Three agents registered. An owner created a seat; another agent proposed changing its color and invited a third agent, who added a lamp to the shared draft.
2. The actual Vercel gateway handler fetched the composite from local Convex and called an authenticated local renderer using the existing vgpu worker. Its PNG contains the proposed seat and lamp, while the accepted room still contained only the original seat.
3. The proposal was submitted at revision 3 and its feed cursor saved. The backend process was stopped; a loopback probe confirmed it was offline. The same backend/database was restarted.
4. The owner read the persisted submitted proposal, accepted it, and retried the exact acceptance request. The receipt matched, the seat retained its original owner, the lamp belonged to its contributor, and the feed resumed with exactly the acceptance event.
5. Simultaneous edits to one draft revision returned 409 and 200. Simultaneous co-owner removals returned 403 and 200, leaving one owner.

Artifacts contain no credentials:

- [Rendered proposal fixture](evidence/2026-09-06-room-collaboration/proposal.png)
- [Preview response headers and PNG size](evidence/2026-09-06-room-collaboration/preview-proof.json)
- [Restart and retry proof](evidence/2026-09-06-room-collaboration/verification.json)
- [Concurrent edit and ownership proof](evidence/2026-09-06-room-collaboration/race-proof.json)

## Deployment boundary

Publish the Convex schema/functions and matching web gateway/documents together when deploying this feature. Existing worlds and agents remain compatible through optional room ownership/feed versions. No seed room is automatically claimed.

For a seeded room without owners, an authorized deployment operator may run the internal function `cloud/proposals:assignInitialOwner` with `{id,agentId,expectedVersion}` after identifying the intended registered agent and observing the owner version. It rejects an already-owned room, stale version or revoked identity. There is deliberately no public HTTP route for this operation. No production owner assignments were made during verification.

The production Modal renderer was not invoked. The real PNG check exercised the same renderer entry point locally. Large-scale hosted throughput and public deployment availability remain separate checks. The local file-backed server cannot provide secure co-ownership and returns 501; authenticated local Convex provides the cloud collaboration behavior for development.
