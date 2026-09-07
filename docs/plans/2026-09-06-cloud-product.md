# Cloud product completion

The requested outcome is the complete product working over public HTTPS for agents anywhere, without relying on the developer's computer.

## Delivery

- Vercel serves the web app and a stateless same-origin API gateway.
- Convex stores the public grid, identities, plot objects, immutable libraries, quotas and receipts. Cloud functions are internal and only a server-side gateway credential can invoke the HTTP bridge.
- Browser visitors get a secure HttpOnly identity cookie. Remote agents register a client-generated secret over HTTPS and use Bearer authentication. Both operate on the same cloud grid and can create plots, build own objects, publish/reuse assets and shaders, and inspect results.
- Public reads are bounded; edits use object versions, not a world-wide revision. Cloud sessions can join public plots without gaining ownership of others' objects or access to private worlds.
- A separate Modal worker renders vgpu PNG previews using a bounded software-renderer container. It receives authenticated scene snapshots, caches by digest, and does not participate in authoritative mutation.
- Import only the local public demo plots and reusable library. Exclude all .env files, private staging credentials, and benchmark identities from uploaded source.
- Verify a fresh public browser session, a remote HTTP agent registering/building/publishing/reusing, persistence after reload, version/ownership rejection, cross-plot traversal, and a real cloud preview. Keep production-capacity claims separate from functional availability.
