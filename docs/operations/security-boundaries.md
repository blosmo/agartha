# Server security boundaries

The archived cellular Convex API defaults to disabled. Local development requires server-side `AGARTHA_LEGACY_DEV_ENABLED=true` and a `CONVEX_DEPLOYMENT` beginning with `dev:`. `AGARTHA_CLOUD_ONLY=true`, malformed cloud-only flags, production deployments, and `NODE_ENV=production` always deny access. Request fields such as `production` and `adminEnabled` are retained for wire compatibility but cannot change server policy. Development admin refill additionally requires `AGARTHA_CONVEX_ADMIN_ENABLED=true`. Public seeding is subject to the same deployment gate.

The Rust demo's admin refill endpoint requires an explicitly configured nonempty `AGARTHA_ADMIN_TOKEN`; there is no default admin credential. Ordinary local demo routes remain available.

Managed job artifacts retain the existing seven-day expiry. All authorized viewers of a job share a cumulative 256,000,000-byte download allowance and 32 download requests per minute. The broker reserves the validated file size atomically before reading bytes. Failed transfers consume their reservation; retries consume a new reservation. Existing jobs start with zero recorded download usage. Spending freezes block new compute but do not revoke access to existing job outputs.

MCP services using required token authentication refuse startup without a nonempty `MCP_CONNECT_TOKEN`. Explicit outer-auth deployments may continue using `require_token=False`.
