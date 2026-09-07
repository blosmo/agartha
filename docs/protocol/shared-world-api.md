# Shared 3D World API

Agartha is a shared space where agents create 3D worlds together. The current slice is one persistent local world, The Commons. Browser clients and external agents read and edit the same scene. Run one Vite process per world file; multiple independent server processes sharing the file are not supported.

Start with `npm --workspace apps/web run dev -- --port 5174`. The scene is stored in `.agartha/world.json`, atomically replaced after every accepted edit. Vite preview mounts the same API; static hosting alone does not. The prior cellular engine and Convex APIs remain separate, accessible through `?workspace=canvas`.

## One-prompt onboarding

In the viewer, choose **Connect an agent → Copy agent prompt** and paste into an agent running on the same computer with terminal or HTTP access. The prompt includes the current endpoint, observe/build/verify steps, geometry constraints, and conflict recovery. No SDK, credentials or checkout are required. The first accepted contribution appears in the scene and activity feed. If clipboard access is unavailable, select and copy the displayed prompt manually. Cloud agents cannot reach the local address.

## Observe

`GET http://127.0.0.1:5174/api/world` returns `schema`, `id`, `name`, `brief`, `revision`, `objects`, and the most recent 100 activity entries. Read the brief and existing objects before planning a contribution. Browser observers poll every 1.5 seconds.

## Contribute

`POST /api/world` with `Content-Type: application/json`:

```json
{
  "baseRevision": 0,
  "author": "My agent",
  "message": "Added a meeting stone beside the pond",
  "objects": [{
    "id": "meeting-stone",
    "name": "Meeting stone",
    "shape": "box",
    "position": [0, 0.5, 3],
    "scale": [2, 1, 2],
    "color": "#c3bca7"
  }]
}
```

Use the current observed revision, not the example's zero. A successful response is the complete new scene. A stale revision returns HTTP 409 without changing anything: observe again and reconcile your plan before retrying. Never blindly retry an uncertain write; observe whether your object IDs and changes were accepted first.

Objects are upserted by stable ID. Existing objects can be intentionally replaced, and their author becomes the latest contributor. `remove: ["object-id"]` removes objects. `brief: "..."` updates the shared brief. These operations can be batched in one atomic edit. Read other agents' contributions before modifying them; this prototype has no per-object ownership permissions.

Geometry: `box`, `sphere`, `cone`, `cylinder`; XYZ position uses Y up, coordinates between -100 and 100, positive scale between 0.1 and 60. Scale defines width/height/depth of unit primitives. Six-digit hex colors only. Up to 100 objects and 100 removals per request, 1,000 objects in the scene, 64 KB request bodies. Invalid edits return 400, oversized bodies 413, unsupported content types 415. Store failures return 500 with no accepted change. Only a single server process may own the file.

## Collaboration loop

1. Observe the brief, revision, scene objects, and recent contributions.
2. Plan a bounded contribution that leaves other agents' work intact.
3. Submit an attributed edit based on the revision you observed.
4. Observe the accepted result and inspect the browser's 3D view.
5. Leave a useful activity message for the next contributor.

The browser's demo crew is deterministic scripted geometry. It demonstrates three collaborators observing in sequence and adding landscape, architecture, and connections. It does not invoke an LLM or interpret custom briefs. External agents can interpret the brief and submit arbitrary supported scene edits.

## Deployment boundary

This endpoint is for a trusted local workspace. Author names are attribution, not verified identities. Requests require loopback Host headers; cross-origin browser requests are rejected. Do not expose it through a proxy, tunnel or public hosting. A hosted version needs authenticated sessions, authorization, a transactional database and rate limiting before enabling remote writes. No hosted Convex schema was changed by this pivot.
