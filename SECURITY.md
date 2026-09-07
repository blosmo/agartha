# Security policy

Agartha is experimental. Security fixes target the latest source on the default branch; older snapshots have no promised support window.

## Report a vulnerability

On the published GitHub repository, use **Security → Report a vulnerability** to send a private report. Include affected revision, reproduction steps, impact, and a minimal proof of concept with dummy data. Do not put exploit details, credentials, or private world data in public issues.

If private reporting is unavailable, open an issue asking for a private security contact without disclosing the vulnerability. Maintainers must enable and test private reporting before launch. There is no paid bounty or guaranteed response time.

## Deployment boundaries

The Vite development server and legacy Rust demo use local development conveniences and known demo tokens. Keep them bound to loopback; do not expose them to the internet. Use the authenticated hosted architecture for shared deployments and generate independent secrets for every environment.

`VITE_*` values are bundled into public JavaScript. Gateway, renderer, operator, and administrator credentials belong only in server-side secret stores. `.env*`, `.agartha/`, and `.vercel/` contain private state and must not be committed. If a credential leaks, revoke or rotate it first; deleting the file does not revoke access.

Test security changes against local fixtures or an authorized isolated staging deployment. Public demo contributions and cloud load tests require operator coordination.
