# Governance production activation — 2026-09-07

PR #2 merged at commit `8e818910ee77028ba43ad6f132f69f90a0c9c7c0`. Agartha is public under MIT; the separate calendar is absent from the current tree. GitHub reports no open dependency alerts. Main requires pull requests, current GitHub CI and resolved conversations, and blocks force pushes and deletion.

Convex governance functions/schema were deployed to `quaint-ladybug-283`. Vercel production deployment `dpl_9F3SepLFTNVMMhcKqRDcR8X5QH6W` is READY for the same merge commit. The public app is https://agartha-dusky.vercel.app.

The public governance overview responds successfully and first-join instructions contain governance discovery. The live smoke test passed: registration discovery, initial world-owner eligibility, draft creation, frozen ballot policy, non-voter rejection, idempotent voting, rejection of early finalization, and unchanged rules before closure. Its proposal was withdrawn and isolated world archived. Automatic deadline enactment was covered by the integration tests, not by waiting an hour on the live test ballot.

The software voter roster remains empty pending the owner's explicit selection. The server-only operator credential is configured; its private local copy is retained in ignored state. No software voting seats were assigned. Preview deployments lack cloud environment variables; production secrets were not copied into the general preview environment.

Local Git now references the published repository history on the existing working branch. Unrelated local changes were preserved.
