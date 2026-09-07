# Agent-native onboarding research and implementation

Researched 2026-09-06. Recommendation: a short outcome-based invitation points to a hosted Markdown entry file. The entry file explains orientation, identity, scope, verification and completion; detailed API/design/library material lives behind focused links.

## Primary sources

- [Moltbook homepage](https://www.moltbook.com/): directly demonstrates a short invitation pointing at `/skill.md`. This is a product example, not proof that its entire registration/security design should be copied. Its social ownership-verification flow is unnecessary for this Agartha change.
- [Anthropic: equipping agents with skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills): supports loading concise metadata/instructions first and additional files when relevant. Applied as progressive disclosure, not mandatory software installation.
- [Agent Skills specification](https://agentskills.io/specification): describes Markdown plus name/description metadata, examples, edge cases and focused reference files. Agartha's hosted `/skill.md` borrows this structure; it is readable directly and does not claim to be an installed skill package.
- [llms.txt proposal](https://llmstxt.org/): provides a discovery index of clean agent-readable content and recommends discoverability through HTML/HTTP link relations. It is a proposal, not a guarantee every agent automatically reads it; the invitation explicitly names the entry file.

## Applied architecture principles

The requested ce-agent-native-architecture skill guides the implementation: retain atomic public operations and shared human/agent state; provide current room context and dynamic capability discovery; let the agent choose its creative solution; verify outcomes using a fresh agent rather than a prescribed script.

Human outcome → agent capability:

| Human outcome | Agent equivalent |
| --- | --- |
| Explore rooms | Public neighborhood and room GETs |
| Select/read a room | Room GET with brief, ownership and geometry |
| See the scene | Authenticated PNG preview |
| Invite a collaborator | Public skill.md and short URL-bearing prompt |

Agents additionally create rooms, update their brief, create/edit/remove their own objects, use builders, and publish/reuse immutable library versions. Room deletion and mutable library deletion are not exposed by either this human UI or onboarding; no unsupported capability is advertised. Hosted documents have no access to secrets and cannot grant permissions beyond the user's request.

## Implementation

- `/skill.md`: small entry point with registration/resume, current-room orientation, credential destination boundary, recovery, and explicit finish criteria.
- `/agents/api.md`: exact HTTP payloads, current-time examples, bounds, ownership/versions, quotas, errors and PNG verification.
- `/agents/design.md`: shared room shell and open-ended interior composition guidance.
- `/agents/library.md`: optional asset/shader discovery, placement and publication.
- `/llms.txt`: discovery index; HTML and HTTP Link metadata point to it.
- Cloud invitation UI copies a short prompt with `/skill.md` and the current viewer URL, and offers a readable instructions link. Clipboard fallback remains available.
- Static docs use text/plain with Markdown syntax for broad HTTP-tool compatibility, no auth/JavaScript dependency, and revalidation instead of long stale caching.
- Local mode retains its existing local-server prompt; the hosted guide documents the cloud API.

## Validation

39 web tests passed, including short-prompt generation, current-room context, cloud copy behavior, and manual-copy fallback. The hosted reference graph test passed; all Markdown links resolve and the entry stays below 750 words. Production build passed locally. Live fetch and fresh-agent outcome verification are recorded below when complete.

## Live outcome

Deployment https://agartha-7zrdr7cgs-divine-inside.vercel.app is aliased to https://agartha-dusky.vercel.app. All five hosted documents returned unauthenticated HTTP 200 text/plain with revalidation. The mobile dialog showed the entire copied invitation (textarea clientHeight and scrollHeight both 178px), and the live copy button reported success.

A fresh AI agent received only the actual short invitation, with no inherited Agartha conversation. It fetched skill.md, api.md and design.md, skipped the optional library guide, registered its own identity, and created [The Lantern Bindery](https://agartha-dusky.vercel.app/?plot=plot-5--1). It verified 102 object IDs, fields, ownership, versions, clear aisles and a real PNG. The coordinator independently read back 102 objects (brief version 2, no pagination) and inspected the PNG. No repository knowledge was needed. Reported friction was environment-specific DNS behavior and the large neighborhood response; the onboarding/API guides were clear. This is one successful fresh-agent outcome, not proof of compatibility with every agent platform.
