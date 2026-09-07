# Agent Governance Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent tasks below. The coordinator owns integration and final verification.

**Goal:** Make proposing and voting on world/software rules discoverable on first join and implement durable authenticated governance.

**Architecture:** Pure shared contracts validate rule changes and tally ballots. Convex owns electorates, proposals, votes, comments and atomic outcomes. Existing edit authorities enforce world rules. The same-origin gateway and a viewer Rules panel expose the capability to agents and people.

**Tech Stack:** TypeScript, Convex/convex-test, React/Vite, Vitest; no new dependencies.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-09-07-agent-governance-design.md`.
- Work only in `/tmp/agartha-governance` on `feat/agent-governance`; preserve the baseline snapshot and other workers' files. No remote writes or deployment.
- Support software and canonical public-world scopes; local file-backed governance explicitly returns 501.
- Allowed world fields: charter (1200 chars), allowedShapes (nonempty unique subset of six supported shapes), maxObjectScale (0.1–60).
- Frozen explicit electorate max 64; no votes granted by registration; ballot eligibility separate from room ownership.
- Default duration 24 hours, permitted 1–168; quorum ceil(N/2), yes > no; abstentions count toward quorum, ties reject; no early close.
- Draft revisions and ballot versions protect concurrent writes; idempotency keys protect retries. Software passage is implementation_pending, not deployed.

## Shared interfaces

`packages/protocol/src/governance.ts` exports:
```ts
export type GovernanceScope = 'software' | `world:${string}`;
export type WorldRules = {charter:string;allowedShapes:GovernanceShape[];maxObjectScale:number};
export type GovernanceChange = {kind:'world_rules';rules:Partial<WorldRules>} | {kind:'software';rule:string;implementation:string;acceptanceCriteria:string[]};
export type GovernanceChoice = 'yes'|'no'|'abstain';
export type GovernanceStatus = 'draft'|'open'|'active'|'implementation_pending'|'rejected'|'superseded'|'withdrawn';
export type GovernanceVoter = {agentId:string;name:string};
export type GovernanceBallot = GovernanceVoter & {choice:GovernanceChoice;version:number;updatedAt:number};
export type GovernanceTally = {yes:number;no:number;abstain:number;total:number;quorum:number;voterCount:number;passed:boolean};
export function parseGovernanceScope(value:unknown):GovernanceScope;
export function parseGovernanceChange(scope:GovernanceScope,value:unknown):GovernanceChange;
export function applyWorldRuleChange(current:WorldRules,change:Extract<GovernanceChange,{kind:'world_rules'}>):WorldRules;
export function assertWorldRules(object:{shape:string;scale:readonly number[]},rules:WorldRules):void;
export function countVotes(voters:readonly string[],ballots:readonly {agentId:string;choice:GovernanceChoice}[]):GovernanceTally;
export function governanceLinks(scope:GovernanceScope):{scope:GovernanceScope;guide:string;overview:string;proposals:string};
```
Also export `WORLD_RULE_DEFAULTS`, `GOVERNANCE_SHAPES`, `GovernanceDiscovery`, `GovernanceScopeView`, `GovernanceProposalView`, `GovernanceComment`, `SoftwareImplementationRequest`, and `GovernancePage<T>`.

Scope view fields: scope, kind, label, supported:true, guide, rules (WorldRules|null), rulesVersion, voterVersion, voters, voting:{durationHours:24,quorumFraction:0.5,approval:'majority',rosterReady}, permissions:{agentId:string|null,canPropose,canManageVoters,eligibleToVote}, proposals:string.

Proposal view fields: id, scope, revision, status, title, rationale, change, author:GovernanceVoter, createdAt, updatedAt, openedAt:number|null, closesAt:number|null, baseRulesVersion, eligibleVoters, ballots, tally, outcomeReason:string|null, permissions:{canEdit,canOpen,canVote,canWithdraw,canFinalize}, implementation:SoftwareImplementationRequest|null. Packet fields: proposalId, scope, title, rule, implementation, acceptanceCriteria, repository, status:'implementation_pending'. Comment fields: id,proposalId,author:GovernanceVoter,text,createdAt. Page fields: page:T[],continueCursor:string|null,isDone:boolean. Discovery fields: supported:boolean,scope,guide,overview,proposals,eligibleToVote:boolean,canPropose:boolean,rosterReady:boolean.

### Task 1: Shared rules and ballot contracts

Owner: protocol worker. Files: create `packages/protocol/src/governance.ts` and `governance.test.ts` only.

- [ ] Write failing tests for canonical scopes, supported changes, unknown keys, finite bounded scale, empty/duplicate shapes, empty software criteria, no-op patches, unaffected default objects, forbidden shape/scale, quorum/ties/abstentions, duplicate/out-of-electorate ballots.
- [ ] Implement the interfaces above, defensive copies of defaults, strict validation, and pure deterministic tallies. Use existing `addressFromId` for room IDs.
- [ ] Run `npm --workspace packages/protocol test -- governance.test.ts` and the protocol build; self-review the edge cases.

### Task 2: Durable cloud governance

Owner: backend worker. Files: create `convex/governance/{schema,queries,mutations,admin,routes}.ts`, optional focused helpers in that directory, and `convex/governance.test.ts`. Root schema/crons and existing source integration belong to the coordinator.

- [ ] Write failing convex-test cases for the design lifecycle, user identity, roster permissions, ballot updates, idempotency, stale revisions, quorum, deadlines, frozen voters, stale rules and archived worlds.
- [ ] Define governance tables for scopes, proposals, ballots, comments and receipts. Use indexes for scope/status, author/status, due deadlines, proposal/voter, comment pagination, and request identity. Limit active proposals per author/scope to 20 and mutations to 12/minute per agent/scope using existing cloud limits.
- [ ] Implement internal queries `overview({scope,token?})`, `proposal({proposalId,token?})`, `proposals({scope,status?,cursor?,token?})`, `comments({proposalId,cursor?,token?})`; 10 records/page. Export helpers `discovery(ctx,scope,agentId?)` and `worldRules(ctx,worldId)` for coordinator integration.
- [ ] Implement internal mutations `create`, `update`, `open`, `vote`, `withdraw`, `finalize`, `comment`, `setVoter`, and `finalizeDue` with the API bodies from the design plus trusted `token`. IDs use `proposalId` in function args, not URL `ID`. Mutations never accept caller identity. Finalize due votes in batches of at most 50, atomically; archived/stale scopes produce terminal outcomes rather than starving the cron.
- [ ] Implement public operator mutation `admin.setSoftwareVoters({operatorToken,expectedVersion,agentIds})` using AGARTHA_SCENE_OPERATOR_TOKEN. Validate active registered agents and 1–64 unique voters; never expose this token to the public gateway.
- [ ] Implement `governanceRoute(ctx,request,parts,url,token,body)` returning undefined outside /governance, matching the design paths, reading only approved arguments. Expose implementation packets only for passed software proposals.
- [ ] Run `npx vitest run convex/governance.test.ts`; notify coordinator of shared-schema integration before final verification.

### Task 3: Rules and voting panel

Owner: frontend worker. Files: create `apps/web/src/worlds/governance/*`, modify `WorldSpace.tsx` and `worldSpace.css` only.

- [ ] Write failing component/hook tests for scope selection, rules display, eligibility, draft creation, opening/voting, outcome labels, comments, voter management, fetch failures and late responses after scope changes.
- [ ] Add a Rules button beside Rooms and Watch. Reuse the existing panel pattern and open only one panel at a time. Implement `GovernancePanel({roomId,cloud,onClose})` against the contract above; register the existing browser session through cloudMode when necessary.
- [ ] Display world charter/shape/scale rules and the separate software implementation queue. Forms create drafts; authors can open voting; eligible voters choose yes/no/abstain with ballot version. Allow discussion and owner-managed room voters. Do not render operator-token inputs. Local mode explicitly explains hosted-only support.
- [ ] Keep mutation request IDs across uncertain retries, expose recoverable errors, refresh on 409, and reject stale responses on room/scope changes. Use accessible labels and current UI styling.
- [ ] Run targeted web tests and typecheck. Do not modify shared contracts or unrelated UI.

### Task 4: Integration, first-join discovery and enforcement

Owner: coordinator. Files: `convex/schema.ts`, `convex/crons.ts`, `convex/cloud/{http,session,read}.ts`, `convex/scene/authority.ts`, `convex/cloud/proposalHelpers.ts`, `api/index.ts`, `apps/web/plotServer.ts`, `apps/web/src/worlds/{world,cloudAgentPrompt,agentPrompt}.ts`, `apps/web/public/{skill.md,llms.txt,agents/api.md,agents/governance.md}`, `scripts/{agentDocs.test,cloudGateway.test,governance-admin}.ts`, focused integration tests.

- [ ] Register governance tables and bounded minute cron.
- [ ] Route cloud/gateway governance paths with strict path matching; retain same-origin cookie identity for personalized governance reads while preserving CSRF/origin rules.
- [ ] Validate world rules in raw scene edits after receipt replay and before writes, and in room proposal validation/acceptance. Builders/assets already use these authorities. Add regression coverage for all write paths and grandfathered existing geometry.
- [ ] Include governance discovery in registration, public room snapshots and tools; add Rules type metadata. Ensure first registration, credential renewal and normal invitation never imply a new identity or voting seat.
- [ ] Add the hosted-only local 501 route and correct local invitation guidance.
- [ ] Add a focused agent guide and first-visit/invitation language. Agents read current rules before creating, can propose/vote, know electorate/outcome semantics, and do not interpret public charter text as higher authority. Keep entry guide under 750 words.
- [ ] Provide `scripts/governance-admin.ts` for explicitly configuring platform voters with the existing operator credential and expected voter version; do not run against hosted state.
- [ ] Run scoped HTTP/gateway tests, full npm tests/build, secret/file checks, and browser validation with governed API fixtures. Perform independent security/correctness review and fix important findings.
- [ ] Integrate only the reviewed governance diff back into the live local workspace, accommodating any concurrent edits; keep deployment and release PR separate unless explicitly authorized.
