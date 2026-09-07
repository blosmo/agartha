# Open-source release preparation

Prepared 2026-09-06. Local preparation is distinct from publishing the repository or changing its visibility.

## Research and decisions

GitHub's [starting a project guide](https://opensource.guide/starting-a-project/) recommends a clear README, an open-source license, contribution guidance, and community expectations. This project now includes those documents and an account-free local quickstart.

The existing Rust workspace declared MIT. The root license and npm workspace metadata preserve that choice. [MIT](https://choosealicense.com/licenses/mit/) permits reuse subject to preserving its notices. The owner must confirm they have the right to release all contributed source and assets. No source license automatically relicenses hosted user content.

[Poly Haven's license](https://polyhaven.com/license) permits redistribution of its CC0 assets. The existing source manifest and hash tests establish the provenance of the bundled texture maps. Third-party notices distinguish these assets from original source and dependency licenses.

GitHub recommends [protecting secrets](https://docs.github.com/en/code-security/concepts/secret-security/secret-leakage-risks), including push protection. Broad environment/state ignore rules and `npm run check:release` now help detect accidental publication. That script is deliberately a limited pattern check, not a substitute for a dedicated secret scanner, historical review, or credential rotation.

The [Actions security reference](https://docs.github.com/en/actions/reference/security/secure-use) supports least-privilege workflows and full-commit action pins. CI uses read-only permissions, pinned official actions, no deployment secrets, and pull_request events rather than privileged pull_request_target execution. Dependabot covers npm, Cargo, and Actions updates. Local test success does not prove GitHub-hosted CI success.

[Private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository) requires repository-owner setup; adding SECURITY.md alone does not enable it.

## Publication checklist

- Confirm the copyright holder and rights to release original source, including any employer/client or outside-contributor rights. MIT is the prepared license, preserving the existing Rust declaration.
- Choose the publication destination. The authenticated owner is `blosmo`, and `blosmo/agartha` already exists privately with older history and a `new-calendar/` application absent from this local project. Do not overwrite it or change its visibility as part of local preparation. No local remote is configured.
- Review `git status --short`, `git ls-files --cached --others --exclude-standard`, and the full staged diff before the first commit. Preserve `.env.local`, `.agartha/`, and `.vercel/` locally; do not upload the working directory as an unfiltered archive.
- Run a dedicated secret scanner on the candidate tree and, if importing prior commits, the entire history. The project root had no Git history when preparation began. An unrelated nested docs Git repository was preserved under ignored `.agartha/open-source-backup/docs.git`; its history is not part of the release. Rotate any exposed credentials before publication.
- Run `npm ci`, `npm test`, `npm run build`, `cargo test --workspace --locked`, and `npm run check:release` in a clean checkout. Verify the browser quickstart without local environment files or saved worlds.
- Create the repository only after the destination and publication are authorized. Enable private vulnerability reporting and test its report path. Designate a monitored private conduct contact and update CODE_OF_CONDUCT.md.
- Enable available secret scanning, push protection, dependency alerts, and default CodeQL scanning for supported languages. Require CI and review on the default branch, restrict force pushes, and require maintainer MFA.
- Confirm the first GitHub CI run succeeds before advertising the project. Avoid automatic deployment of untrusted pull requests with production credentials.
- For release binaries or packages, inventory the actual bundled dependencies and retain their license notices. npm workspaces remain private to prevent accidental registry publication; this does not prevent open-source repository distribution.

## Project boundaries

The current supported entrypoint is the local 3D workspace. Rust/Convex cellular documentation is historical and optional. Cloud acceptance scripts mutate shared worlds and may incur provider costs; they are not contributor setup steps or ordinary CI checks. Existing dated operational reports describe past evidence rather than a fresh guarantee about deployed services.

## Verification evidence (2026-09-06)

- Local `npm test` passed; the final filtered copy then passed 176 Vitest tests plus 5 release-gate fixture tests after a fresh install. Both builds passed; Vite still reports large bundle chunks.
- `cargo test --workspace --locked` passed 41 tests.
- A filtered copy installed successfully with `npm ci`, without local environment files, saved worlds, deployment metadata, or pre-existing node_modules.
- Browser quickstart rendered the 3D grid and opened local agent instructions with the correct loopback origin; browser error inspection was empty. Verification servers were stopped afterward.
- Compatible lockfile updates resolved seven npm advisories; the final updater reported zero known vulnerabilities. No forced major upgrades or dependency overrides were used.
- Gitleaks 8.30.1 (official release checksum verified) found no leaks in the final filtered candidate tree. The existing private GitHub repository was separately mirrored and scanned across all refs: Gitleaks reported 42 scanned commits and no leaks (Git lists 46 commits including merges). This is a pattern-scan result, not proof that every historical file is suitable for publication.
- Release-gate fixtures cover credential redaction, force-staged private files, staged/working-tree mismatch, missing required files, and symbolic links.
- Review covered correctness, security, contributor documentation, test coverage, standards, and consistency. The staged-secret blind spot and missing private-path checks were fixed.

The publication destination, owner rights confirmation, private conduct contact, repository settings, first hosted CI run, and publication remain owner-side release decisions. No remote was configured and no code was pushed or published.

## Existing remote and recommended publication path

Read-only inspection verified `blosmo/agartha` is private, with main at `45ca207f3cec973c047652e786e6af1926e52e55`. It contains a separate `new-calendar/` app and older history. A clean new public repository is the simplest way to release only the reviewed shared-world project while preserving that private archive. Alternatively, reconcile the existing repository and explicitly review the additional app/history before changing visibility. Neither path has been executed.

## Publication update (2026-09-07)

The owner made the existing `blosmo/agartha` repository public. This supersedes the recommendation to create a separate repository. Its main branch was still at `45ca207f3cec973c047652e786e6af1926e52e55` when checked. The release update is prepared on top of that history, bringing in the current local Agartha project and preserving the remote-only `new-calendar/` application unchanged. Earlier verification counts apply to the September 6 snapshot; the reconciled branch requires its own checks.

The owner subsequently requested removal of the separate calendar project from this repository. `new-calendar/` is removed from the release branch; an ignored local copy was preserved under `.agartha/open-source-backup/new-calendar`. Existing Git history remains intact. The calendar project's source is not part of the Agartha release.
