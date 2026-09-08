# Blender MCP on Modal

This optional workshop lets an MCP agent build and revise Blender projects in an isolated Modal Sandbox. It produces editable `.blend` files, GLB models, and PNG previews. Agartha's existing world API handles importing the resulting model; the workshop does not publish to the world itself.

Blender 4.5 runs unattended under Xvfb. The pinned [upstream Blender MCP](https://github.com/ahujasid/blender-mcp/tree/c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9) requires Blender's GUI event loop, so this uses a virtual display rather than Blender's `--background` mode. The upstream MCP tools remain the agent interface.

## Operator setup

From the repository root, create an isolated Python environment and authenticate Modal:

```sh
python3 -m venv .venv
.venv/bin/pip install -r cloud/blender_mcp/requirements-client.txt
.venv/bin/modal setup
```

Start a project and write its private connection config:

```sh
.venv/bin/python -m cloud.blender_mcp.app start --config .agartha/blender-mcp.json
```

The command prints the project UUID and config path. The JSON contains an `mcpServers.agartha-blender` entry for MCP clients, plus the base URL and token for artifact downloads. The first start builds the image; subsequent starts can reuse its cache. Configure the agent's MCP client with the generated entry while the session is running.

To save, stop, or resume, substitute the printed project UUID:

```sh
.venv/bin/python -m cloud.blender_mcp.app save PROJECT_UUID
.venv/bin/python -m cloud.blender_mcp.app stop PROJECT_UUID
.venv/bin/python -m cloud.blender_mcp.app resume PROJECT_UUID --config .agartha/blender-mcp.json
```

Regenerate the client connection after a resume. This is an on-demand Sandbox; it does not need a permanently running web service or a separate `modal deploy` step.

## Session ownership

An operator with Modal access starts a project session and writes its connection details to a private local file. An agent receives only that session's MCP connection. Use a new UUID for each independent project, and reuse the UUID to reopen a saved project. Only one running session may write a project at a time.

The Sandbox mounts only that project's directory in `agartha-blender-projects`. It receives no production secrets or Modal identity token, and outbound networking is blocked. Telemetry and external asset-generation integrations are disabled. Imports from websites must be prepared outside the session; the agent cannot download dependencies or external assets through Blender.

Connection credentials grant control of the entire project session. Keep generated configs in the ignored `.agartha/` directory with mode `0600`. Terminating the session ends access through its connection; resuming creates a new connection.

## Modeling workflow

1. Inspect the scene with `get_scene_info` and individual objects with `get_object_info`.
2. Use `execute_blender_code` to construct geometry, materials, and modifiers. Inspect intermediate results with `get_viewport_screenshot`.
3. Save the editable project with `save_project`.
4. Use `export_glb` for the model or `render_preview` for a camera render, then retrieve the named artifact.
5. Check the GLB against Agartha's existing model limits before following the [GLB upload protocol](../../apps/web/public/agents/glb-models.md).
6. Stop the session when finished. Start another session with the same project UUID to continue editing.

For example, call `execute_blender_code` with:

```json
{"code":"import bpy\nbpy.ops.mesh.primitive_cube_add()\nobj = bpy.context.object\nbevel = obj.modifiers.new('Bevel', 'BEVEL')\nbevel.width = 0.1\nbevel.segments = 3","user_prompt":"Create a beveled cube."}
```

Then call `export_glb` with `{"name":"cube"}`. Successful edits are automatically saved; the GLB export applies modifiers while the editable project retains them.

Blender code is capped at 64 KiB per call. Artifact names use letters, digits, underscores, and hyphens. GLB output is capped at 16 MB, PNG at 8 MB, and editable projects at 128 MB. Render helpers allow dimensions up to 1024 × 1024 and up to 32 samples. These limits do not guarantee that every Blender project fits Agartha's separate triangle, material, and animation budgets.

## Resource policy

Sessions request 0.125 physical CPU cores and 1 GiB of memory, capped at two physical cores and 4 GiB by default, with no GPU. An application idle timer stops unused sessions after three minutes; the default hard lifetime is 30 minutes. The saved project can outlive the running session.

The same modeling/inspection/export workload was compared with two and four physical cores:

| CPU cap | Workload time | Estimated workload cost ceiling |
| --- | ---: | ---: |
| 2 cores (default) | 25.700 s | $0.00271 |
| 4 cores | 22.526 s | $0.00415 |

Two cores provide a lower cost ceiling for a 3.2-second latency tradeoff in this sample. Use `start --cpu-limit 4` when faster completion is worth the higher ceiling. This is a measured default for the sample workload, not a claim that two cores are optimal for every Blender scene.

Cost ceilings assume continuous use of the CPU cap and all 4 GiB during the workload. They exclude image builds, startup, resume and idle time, and are not invoice measurements. [Modal Sandbox pricing](https://modal.com/pricing), checked September 7, 2026, is $0.00003942 per physical-core-second and $0.00000667 per GiB-second. Actual usage can exceed the requested minimum when resources burst.

## Verification status

Verified on September 7, 2026; [recorded evidence](evidence/modal-blender-mcp.json) includes the CPU comparison and lifecycle results. Thirteen local tests pass.

Real remote MCP calls created and inspected geometry, captured a viewport, rendered a PNG, exported a GLB, and reopened the saved project after replacing its Sandbox. Valid authentication returned 200; missing/invalid tokens returned 401. TCP and HTTPS egress attempts failed, and no provider or OIDC credentials were present.

The GLB passed Agartha's existing inspector with 4,196 triangles and three materials. The editable `.blend` was downloaded and verified. Backend polling confirmed both idle shutdown and hard timeout enforcement. All test Sandboxes were stopped; future sessions start on demand.

Run the focused local checks and the opt-in cloud benchmark:

```sh
.venv/bin/python -m unittest cloud.blender_mcp.test_app cloud.blender_mcp.test_runtime cloud.blender_mcp.test_transport
.venv/bin/python -m cloud.blender_mcp.verify --benchmark --artifacts .agartha/blender-verification
```

The benchmark starts paid Sandbox sessions and stops them in cleanup. It prints redacted results and writes model artifacts, exercises the actual MCP HTTP connection, and checks a saved project after a fresh session starts.
