# Cloud Blender MCP

Goal: set up headless Blender on Modal with Blender MCP so agents can create more complex 3D models. The user additionally requires the best practical Modal price/performance option.

## Architecture

Use the real ahujasid/blender-mcp addon and MCP tool definitions pinned to commit `c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9`. Upstream refuses Blender background mode because it requires the Blender main-thread event loop. Run the full Blender executable under Xvfb: unattended/headless in operation, while preserving upstream viewport and tool behavior. Do not substitute a new custom modeling protocol.

Each session runs in a separate Modal Sandbox containing Blender, the addon, and an upstream FastMCP Streamable HTTP adapter. No production credentials or Modal secrets enter it. Outbound networking is blocked; use Modal Connect Tokens without public tunnel ports to expose only the authenticated session. The operator's SDK creates/stops sessions; agents receive only that session's URL/token.

Persist editable `project.blend` and exports in a project-specific Modal Volume subpath constructed from validated UUIDs. Never mount the whole shared volume inside a session. Serialize operations within a session and prevent two simultaneous writers for one project. Keep telemetry and third-party asset/generation integrations disabled. Expose upstream scene/object inspection, screenshots, code execution, and addon status, with small explicit checkpoint/render/export/artifact helpers.

Use a short application-level idle timer based on actual tool activity; do not assume Modal idle_timeout is reset by Connect Token HTTP traffic. Apply a hard maximum session lifetime as a backstop. Save successful edits/checkpoints before graceful shutdown. Authentication and isolation are hard boundaries; upstream safe mode is an additional default safeguard, not a substitute for the Sandbox boundary.

## Price/performance

Start CPU-only, with low requested CPU/memory and bounded burst limits. Compare CPU caps of 2 and 4 physical cores on the same modeling/export/inspection workload. Select from measured latency and estimated resource cost rather than hourly GPU price alone. No GPU is provisioned unless a measured render workload justifies it. Do not claim globally optimal or exact invoice cost without evidence.

Pricing checked 2026-09-07: https://modal.com/pricing. Sandbox CPU is $0.00003942 per physical-core-second, memory $0.00000667 per GiB-second; GPU prices are additional. Use provider-reported prices as assumptions, and record benchmark methodology. Keep idle cost and startup latency in the comparison.

## File contracts

- `cloud/blender_mcp/config.py`: shared stdlib-only versions, ports, resource bounds, artifact limits and project-ID validation.
- `cloud/blender_mcp/image.py`: separate pinned image with Blender 4.5 LTS, Xvfb/Mesa, pinned upstream addon/package; no change to existing renderer image.
- `cloud/blender_mcp/app.py`: Modal app/session launcher, project subpath persistence, Connect Token generation, readiness, stop/resume, private client config, operator CLI.
- `cloud/blender_mcp/bootstrap.py`: load project with auto-execution disabled, enable upstream addon, configure telemetry/provider flags and startup readiness.
- `cloud/blender_mcp/service.py`: upstream MCP HTTP adapter, tool allowlist, bounded exports/previews/artifacts, checkpointing/activity accounting.
- `cloud/blender_mcp/supervisor.py`: Xvfb/Blender/MCP process lifecycle, graceful exit and hard resource cleanup.
- `cloud/blender_mcp/verify.py`: actual MCP initialization/tool calls, complex model creation, inspection, GLB/.blend export, restart/resume, authentication/egress checks, timing.
- Focused Python tests cover validation, authentication boundary, allowed tools, path/size limits, lifecycle and failure handling. Use stdlib unittest unless another installed test runner is justified.

## Acceptance

- [x] Reproducible pinned cloud image starts unattended and exposes real Blender MCP core tools.
- [x] A client with only the session Connect Token can initialize MCP and create a model using meaningful Blender modifiers.
- [x] Missing/invalid authentication is denied; code execution has no Modal/production credentials and no outbound network access.
- [x] Scene and object inspection, screenshot/render, editable .blend save, GLB export and bounded artifact retrieval work.
- [x] A saved project reopens in a new isolated session after shutdown.
- [x] Idle and hard timeouts terminate the processes; failed startup does not leave an orphan session.
- [x] CPU configurations are compared on a representative task, with measured latency and transparent cost assumptions.
- [x] Exported GLB passes Agartha's existing GLB inspection before any claim of compatibility; no automatic world/database publication.
- [x] Agent setup instructions include actual MCP URL/config creation, project resume, limits and example calls.
- [x] Existing Agartha renderer, Convex authority and Vercel gateway remain unchanged.

## Current evidence

Verified on September 7, 2026; see [operation instructions](../operations/modal-blender-mcp.md) and [recorded results](../operations/evidence/modal-blender-mcp.json).

- Real remote MCP clients initialized, created a beveled/materialized model, inspected scene and object data, captured a viewport, rendered PNG, exported GLB, saved the editable project, and reopened geometry in a fresh session.
- Valid token returned 200; missing and invalid tokens returned 401. Direct TCP and HTTPS attempts failed under empty outbound CIDR/domain allowlists. No provider or OIDC credentials were present.
- Both exported GLBs passed Agartha's inspector: 2,455 vertices, 4,196 triangles, eight draws, eight nodes, three materials. The persisted 600,170-byte `.blend` was downloaded and its Blender header verified.
- CPU caps two/four completed the same workload in 25.700/22.526 seconds. The selected two-core default has a lower resource-cost ceiling; estimates are not invoice measurements.
- Backend polling confirmed idle shutdown (30-second setting, exit 0) and hard lifetime enforcement (120-second setting, exit 124). All test Sandboxes were stopped. Failed-start cleanup is covered by the local suite.
- Thirteen local tests pass. Independent real-MCP checks also verified serialization, error propagation, nested activity, and oversized-request rejection.

The final network configuration uses empty outbound allowlists and no public tunnel ports. `block_network=True` was unsuitable for the tested Connect Token route. The remote service configures MCP for Modal's authenticated proxy rather than retaining upstream's localhost-only Host restriction. Blender helper scripts explicitly import `bpy` to satisfy upstream safe mode.

No Agartha world/database publication or changes to its existing renderer were made by this setup.
