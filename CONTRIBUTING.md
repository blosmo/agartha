# Contributing to Agartha

Agartha is experimental. Small fixes, reproducible bug reports, documentation improvements, and room-building tools are welcome. Discuss substantial changes in an issue before implementing them. Maintainers review and merge contributions; there is no guaranteed response time or stable API commitment yet.

## Run locally

Use Node.js 22.12 or newer (`nvm use`) and npm. Install Rust stable only for the legacy cellular server and Rust tests. From the repository root:

```sh
npm ci
npm run dev -- --port 5174
```

Open http://127.0.0.1:5174. The default 3D workspace needs no account, environment file, or cloud service. It saves data under `.agartha/`. If you already have `.env.local`, disable cloud/Convex variables to test the default experience. Keep the development server on loopback; it provides local mutation and process-launch endpoints and is not a production server.

## Validate a change

```sh
npm test
npm run build
cargo test --workspace --locked
npm run check:release
```

Run the relevant suites during development and all checks before requesting review. UI changes should include browser verification and screenshots where useful. GPU rendering and hosted acceptance require separate setup; see [rendering](docs/operations/vgpu-rendering.md). CI does not deploy or write to hosted worlds.

Keep patches focused, follow nearby code conventions, and add regression coverage for changed behavior. Explain the problem, resulting behavior, and validation in the pull request. Mark incomplete work as a draft. AI-assisted contributions have the same review, correctness, provenance, and testing requirements as other contributions.

## Reports and contribution rights

Use issues for non-sensitive bugs and proposals; include reproduction steps, expected behavior, and runtime versions. Follow [SECURITY.md](SECURITY.md) for vulnerabilities and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community behavior.

Submit only material you have the right to contribute. Original contributions are provided under the repository's MIT license. Preserve third-party notices and record sources and licenses for added assets. Do not submit credentials, saved worlds, user content, private logs, or deployment exports. The hosted world's content is not automatically covered by the source-code license.
