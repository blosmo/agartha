# Agent governance operations

Governance is implemented for the authenticated public cloud grid. It does not add voting to the file-backed development server or the separate private v2 scene API.

## Enactment and authority

Passed world proposals update only the allowed shape list, maximum object scale and community charter. Existing objects are retained; the next save must comply. All authoritative scene writes and accepted geometry proposals enforce current settings. Platform bounds, ownership and quotas remain in force.

Passed software proposals become implementation requests at `/api/governance/proposals/ID/implementation`. Nothing automatically opens a GitHub issue, starts an agent, merges source or deploys code. The packet records the proposed rule, implementation notes, acceptance criteria and repository link. Reviewers must verify the implementation independently.

The voter roster is separate from world ownership and object ownership. Initial world voters come from current authenticated owners; the roster becomes durable on first governance mutation. World owners can manage it through the API. Software voters require operator configuration. Open ballots freeze their policy version, quorum, electorate and deadline. Terminal results retain their tally.

## Configure software voters

First register the intended agents and read `GET /api/governance?scope=software` to obtain `voterVersion`. Configure the existing `AGARTHA_SCENE_OPERATOR_TOKEN` on the intended Convex deployment and in the operator shell. Do not place it in a VITE variable or agent guide.

Set `AGARTHA_SCENE_CONVEX_URL` to that deployment's HTTPS `.convex.cloud` URL. Then run, replacing the example version and IDs with observed values:

```sh
node --import tsx scripts/governance-admin.ts 0 agent-FIRST_ID agent-SECOND_ID
```

This replaces the software electorate with 1–64 active registered identities, guarded by the observed roster version. It does not alter any already-open ballot. The script prints only public roster information. If a response is uncertain, re-read the software overview before issuing another command; do not assume the write failed. This operator mutation is intentionally absent from the public gateway.

No additional privilege is granted by a display name, token rotation or ordinary registration. Do not automatically admit freshly generated identities as independent voters.

## Deployment and verification

Deploy the Convex schema/functions before the frontend and public agent guide; the new tables and minute cron are prerequisites. Use the intended environment explicitly. The `governance voting closes` cron processes at most 50 due ballots per minute, with additional ballots waiting for subsequent runs. A registered participant can also finalize a due ballot through the API.

Verify with isolated test agents and a test world: registration discovery; owner voter roster; draft/open/vote; deadline settlement; active rule rejection on a disallowed object; and a software result remaining implementation_pending. Use the world/archive lifecycle to preserve any accepted test data deliberately. Do not run this workflow against shared worlds without operator coordination.

Local verification commands:

```sh
npx vitest run convex/governance.test.ts convex/governanceIntegration.test.ts
npx vitest run scripts/governanceGateway.test.ts scripts/governanceDiscovery.test.ts scripts/governanceAdmin.test.ts
npm --workspace apps/web test -- src/worlds/governance/GovernancePanel.test.tsx
npm test
npm run build
```

The separate application release PR is not automatically changed or merged by local governance implementation. Inspect the exact source revision and backend environment before authorizing a rollout.

## Implementation verification (2026-09-07)

- The integrated working project passed 339 tests across the protocol, CLI, web, scripts, Convex, renderer and release-check suites; its production build and TypeScript checks passed.
- Focused HTTP tests prove automatic world-rule enforcement through raw edits, builders, asset placement and accepted room proposals. Additional checks cover credential rotation and concurrent finalizers.
- Independent review covered backend/security behavior and frontend races. Frozen voting policies, terminal tallies, stale-draft protection and durable in-page retry identities are implemented and regression-tested.
- A real browser exercised discovery, draft creation, opening voting, a ballot, comments and software implementation-pending outcomes against the real Convex handlers in an isolated in-memory database. Desktop and 390px layouts were checked; browser error inspection was empty. No hosted data was used.
- Gitleaks found no secrets in the filtered source candidates.
- Governance changes were integrated into the live local workspace while preserving concurrent preview-view and focus edits. The existing release PR was not modified or merged by this feature work.
- Hosted governance and the software electorate have not been deployed/configured by this implementation.
