# Local Blender studio

The local studio runs the same bounded Agartha MCP service and pinned Blender
4.5.0 runtime used by the hosted authoring stack. It binds only to loopback,
requires a per-process bearer token, stores the editable project and artifacts
under `.agartha/local-studio`, and never invokes Modal, billing, or provider
APIs.

From the repository root, start it with:

```sh
PYTHONPATH=. python scripts/blender/local_studio.py \
  --blender /path/to/Blender \
  --pythonpath "$PWD" --material-root "$PWD/apps/web/public"
```

The command writes an owner-only MCP client config containing the URL and token.
Override the workspace with `--workspace`, or provide a different pinned
Blender/add-on location with `--blender` and `--addon`. Stop with Ctrl-C; both
child processes are cleaned up and `project.blend` remains in the workspace.

The launcher uses Blender batch mode with `--factory-startup --disable-autoexec
--threads 6` and a small main-thread pump; Blender API commands remain on
Blender's main thread while the process stays alive. The first run needs the
pinned upstream checkout and Python dependencies (`mcp`, `httpx`, `uvicorn`,
and the upstream package) in a local venv. The durable wrapper at
`.agartha/local-runtime/start-studio.sh` supplies those paths automatically.

The local service preserves the cloud core tool allowlist and size limits. It
adds `save_project`, `export_glb`, `render_preview`, and `list_artifacts`; the
service writes checkpoints and generated artifacts below the selected
workspace. The local server is intentionally not reachable through a LAN
address or DNS alias.

## One-time setup

Use Python 3.12 or newer to create a local environment, then install the same pinned service dependencies:

```sh
python3 -m venv .agartha/local-runtime/venv
.agartha/local-runtime/venv/bin/python -m pip install -r cloud/blender_mcp/requirements-client.txt
```

Install Blender 4.5.0 locally and pass its executable with `--blender` (or set `BLENDER_BIN`). The launcher provisions and verifies the pinned upstream add-on/server checkout on first use; later runs reuse it without cloning. `--addon` is an optional override for deliberate development.

For deterministic offline batch authoring, use the same interpreter and helpers directly:

```sh
"$BLENDER_BIN" --background --factory-startup --disable-autoexec --threads 6 \
  --python-exit-code 1 --python scripts/showcase/build_models.py -- .agartha/showcase verdant-conservatory final
```

The canonical procedural chair is available as a review fixture at
`scripts/showcase/chair-template.json`. It can be loaded by a local Blender
script through `cloud.blender_mcp.asset_templates.build_template`; pass a
resolved parameter object and a unique component name. The interpreter records
`agarthaTemplateId`, canonical definition JSON, and resolved parameter JSON on
the component root. Use the managed `search_templates`, `inspect_template`,
and `build_template` actions when working through the agent API so the same
template catalog and provenance rules apply locally and in the hosted service.

The local route has no billing or hosted inference calls. Source generation uses the calling agent; rendering and geometry generation run on this computer. Shared-library publication remains an explicit network action. Local artifacts have no automatic expiry.
