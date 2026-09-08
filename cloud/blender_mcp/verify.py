"""Live, credential-safe verifier for the hosted Blender MCP Sandbox.

Run this with the Modal SDK environment and an MCP client installation, for
example::

    /Users/cosmoscharf/.local/share/uv/tools/modal/bin/python -m \
      cloud.blender_mcp.verify --benchmark

The verifier deliberately prints only redacted, aggregate results.  It is an
operator tool: it starts named project Sandboxes, exercises them over the
authenticated Streamable HTTP endpoint, and always terminates smoke sessions.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import re
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from . import app
from .config import CPU_REQUEST, DEFAULT_CPU_LIMIT, MEMORY_REQUEST_MIB

CPU_PRICE = 0.00003942
MEMORY_PRICE = 0.00000667
WORKLOAD_NAME = "parametric_beacon"


def _safe_error(error: BaseException) -> str:
    """Return useful failure text without leaking Connect Token material."""
    if isinstance(error, BaseExceptionGroup):
        nested = "; ".join(_safe_error(child) for child in error.exceptions)
        return nested[:500]
    response = getattr(error, "response", None)
    if response is not None:
        headers = getattr(response, "headers", {})
        text = f"{error}; status={getattr(response, 'status_code', '?')}; body={getattr(response, 'text', '')[:240]}; forwarded_host={headers.get('forwarded', '')}; x_forwarded_host={headers.get('x-forwarded-host', '')}"
    else:
        text = str(error)
    text = re.sub(r"https?://[^\s)]+", "<redacted-url>", text)
    text = re.sub(r"Bearer\s+\S+", "Bearer <redacted>", text, flags=re.I)
    return text[:500]


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    for attr in ("model_dump", "dict"):
        method = getattr(value, attr, None)
        if callable(method):
            try:
                return _jsonable(method())
            except Exception:
                pass
    return str(value)


def _result_text(result: Any) -> str:
    chunks = []
    for item in getattr(result, "content", ()) or ():
        text = getattr(item, "text", None)
        if text:
            chunks.append(str(text))
    return "\n".join(chunks)


def _assert_result_ok(result: Any, label: str) -> None:
    text = _result_text(result)
    if bool(getattr(result, "isError", False)):
        raise RuntimeError(f"{label} returned MCP error: {text[:300]}")
    lowered = text.lower()
    if any(marker in lowered for marker in ("error:", "error getting", "object not found", "rejected by safe mode")):
        raise RuntimeError(f"{label} returned upstream failure: {text[:300]}")


def _structured_json(result: Any, label: str) -> Any:
    _assert_result_ok(result, label)
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        value = _jsonable(structured)
        if isinstance(value, dict) and isinstance(value.get("result"), str):
            try:
                return json.loads(value["result"])
            except json.JSONDecodeError:
                return value
        return value
    for chunk in _result_text(result).splitlines():
        try:
            return json.loads(chunk)
        except json.JSONDecodeError:
            continue
    try:
        return json.loads(_result_text(result))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{label} did not return JSON") from error


def _root_endpoint(endpoint: str) -> str:
    parsed = urlsplit(endpoint)
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def _mcp_endpoint(endpoint: str) -> str:
    if urlsplit(endpoint).path.rstrip("/").endswith("/mcp"):
        return endpoint
    return endpoint.rstrip("/") + "/mcp"


async def _mcp_call(session: Any, name: str, arguments: dict[str, Any] | None = None) -> Any:
    return await session.call_tool(name, arguments or {})


async def _artifact_download(endpoint: str, path: str, token: str, destination: Path) -> int:
    import httpx

    if not path.startswith("/"):
        raise ValueError("Verifier only accepts relative artifact URLs")
    async with httpx.AsyncClient(base_url=endpoint, headers={"Authorization": f"Bearer {token}"}, timeout=60) as client:
        response = await client.get(path)
        response.raise_for_status()
        destination.write_bytes(response.content)
        return len(response.content)


async def _auth_probe(endpoint: str, token: str) -> dict[str, Any]:
    import httpx

    url = _root_endpoint(endpoint).rstrip("/") + "/healthz"
    async with httpx.AsyncClient(timeout=15) as client:
        probes = {}
        for label, headers in (("valid", {"Authorization": f"Bearer {token}"}), ("missing", {}), ("invalid", {"Authorization": "Bearer invalid-verifier-token"})):
            response = await client.get(url, headers=headers)
            body = re.sub(r"https?://[^\s)]+", "<redacted-url>", response.text[:200])
            probes[label] = {"status": response.status_code, "body": body}
    denied = all(probes[label]["status"] in (401, 403) for label in ("missing", "invalid"))
    return {"denied": denied, "probes": probes}


def _sandbox_exec(sandbox: Any, *command: str) -> str:
    """Read a Modal exec result without logging its environment or secrets."""
    process = sandbox.exec(*command)
    stdout = getattr(process, "stdout", None)
    output = stdout.read() if stdout is not None and hasattr(stdout, "read") else ""
    wait = getattr(process, "wait", None)
    if callable(wait):
        wait()
    return output.decode(errors="replace") if isinstance(output, bytes) else str(output)


def _egress_probe(sandbox: Any) -> dict[str, Any]:
    code = r'''
import json, os, socket, urllib.request
secret_names = ("MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "MODAL_IDENTITY_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GOOGLE_APPLICATION_CREDENTIALS")
try:
    socket.create_connection(("1.1.1.1", 443), timeout=3).close()
    tcp_blocked = False
    tcp_error = ""
except Exception as exc:
    tcp_blocked = True
    tcp_error = type(exc).__name__
try:
    urllib.request.urlopen("https://example.com", timeout=3)
    https_blocked = False
    https_error = ""
except Exception as exc:
    https_blocked = True
    https_error = type(exc).__name__
print(json.dumps({"network_blocked": tcp_blocked and https_blocked, "tcp_blocked": tcp_blocked, "tcp_error": tcp_error, "https_blocked": https_blocked, "https_error": https_error, "oidc_or_provider_credentials_present": any(os.environ.get(k) for k in secret_names)}))
'''
    output = _sandbox_exec(sandbox, "python", "-c", code)
    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
            if isinstance(value, dict) and "network_blocked" in value:
                return value
        except json.JSONDecodeError:
            continue
    return {"network_blocked": False, "oidc_or_provider_credentials_present": None, "parse_error": True}


def _save_viewport_result(result: Any, destination: Path) -> int:
    """Persist image content when returned by MCP, with JSON fallback."""
    for item in getattr(result, "content", ()) or ():
        data = getattr(item, "data", None)
        mime = str(getattr(item, "mimeType", ""))
        if data and mime.startswith("image/"):
            raw = base64.b64decode(data)
            destination.with_suffix(".png").write_bytes(raw)
            if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError("viewport screenshot did not have PNG magic")
            return len(raw)
    raise RuntimeError("viewport screenshot did not return image content")


MODEL_CODE = r'''
import bpy, math
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass
def mat(name, color, metallic=0.0, roughness=0.35):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.metallic=metallic; m.roughness=roughness; return m
def finish(o, material, bevel=0.08):
    o.data.materials.append(material); mod=o.modifiers.new('Bevel','BEVEL'); mod.width=bevel; mod.segments=3
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.shade_smooth(); o.select_set(False); return o
bronze=mat('Beacon Bronze',(0.28,0.08,0.025),0.72,0.24); cyan=mat('Beacon Cyan',(0.01,0.24,0.38),0.42,0.2); dark=mat('Beacon Dark',(0.012,0.018,0.028),0.15,0.3)
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=2.3, depth=0.45, location=(0,0,0.22)); finish(bpy.context.object, dark, 0.1).name='BeaconFoundation'
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.55, depth=3.8, location=(0,0,2.2)); finish(bpy.context.object, bronze, 0.12).name='BeaconColumn'
bpy.ops.mesh.primitive_torus_add(major_radius=1.78, minor_radius=0.14, major_segments=32, minor_segments=12, location=(0,0,3.5)); finish(bpy.context.object, cyan, 0.04).name='BeaconRing'
bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1.55, radius2=0.35, depth=1.35, location=(0,0,4.75)); finish(bpy.context.object, bronze, 0.08).name='BeaconCrown'
for i in range(4):
    a=i*math.pi/2; x,y=2.1*math.cos(a),2.1*math.sin(a)
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(x,y,1.1), rotation=(0,0,a)); finish(bpy.context.object, cyan, 0.06).name=f'BeaconBrace_{i}'
bpy.ops.object.camera_add(location=(10,-12,8), rotation=(math.radians(67),0,math.radians(39))); camera=bpy.context.object; camera.name='VerificationCamera'; bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA', location=(4,-4,10)); bpy.context.object.data.energy=1200; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=5
bpy.ops.object.light_add(type='AREA', location=(-5,3,5)); bpy.context.object.data.energy=700; bpy.context.object.data.size=4
scene=bpy.context.scene; scene.render.engine='BLENDER_WORKBENCH'; scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100
scene['verification_workload']='parametric_beacon'; scene['verification_object_count']=len(bpy.context.scene.objects)
'''


async def _run_workload(project: str, cpu_limit: int, artifact_dir: Path) -> dict[str, Any]:
    started = time.perf_counter()
    first = None
    resumed = None
    try:
        startup_started = time.perf_counter()
        first = app.create_session(app.SessionOptions(project, timeout=300, cpu_limit=cpu_limit))
        startup_seconds = time.perf_counter() - startup_started
        # Import lazily so unit/static checks remain possible without MCP/httpx.
        import httpx
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        root_endpoint = _root_endpoint(first.url)
        auth = await _auth_probe(first.url, first.token)
        if auth["probes"]["valid"]["status"] != 200:
            raise RuntimeError(f"valid authentication probe failed: {auth}")
        if not auth["denied"]:
            raise RuntimeError(f"authentication boundary was not proven: {auth}")
        workload_started = time.perf_counter()
        async with httpx.AsyncClient(headers={"Authorization": f"Bearer {first.token}"}, timeout=180) as http_client:
            async with streamable_http_client(_mcp_endpoint(first.url), http_client=http_client) as (read, write, _):
                async with ClientSession(read, write) as client:
                    await client.initialize()
                    listed = await client.list_tools()
                    tool_names = sorted(getattr(tool, "name", "") for tool in getattr(listed, "tools", ()))
                    required = {"get_scene_info", "get_object_info", "get_viewport_screenshot", "execute_blender_code", "save_project", "export_glb", "render_preview"}
                    missing = sorted(required.difference(tool_names))
                    if missing:
                        raise RuntimeError(f"missing MCP tools: {missing}")
                    execution = await _mcp_call(client, "execute_blender_code", {"code": MODEL_CODE, "user_prompt": "Create and verify a parametric beacon model."})
                    _assert_result_ok(execution, "execute_blender_code")
                    scene = await _mcp_call(client, "get_scene_info", {"user_prompt": "Create and verify a parametric beacon model."})
                    scene_data = _structured_json(scene, "get_scene_info")
                    if not isinstance(scene_data, dict) or scene_data.get("object_count", 0) < 10 or scene_data.get("materials_count", 0) < 3:
                        raise RuntimeError(f"scene inspection was incomplete: {scene_data}")
                    scene_names = {item.get("name") for item in scene_data.get("objects", []) if isinstance(item, dict)}
                    if not {"BeaconColumn", "BeaconRing"}.issubset(scene_names):
                        raise RuntimeError(f"scene inspection omitted beacon objects: {sorted(scene_names)}")
                    object_info = await _mcp_call(client, "get_object_info", {"object_name": "BeaconColumn", "user_prompt": "Create and verify a parametric beacon model."})
                    object_data = _structured_json(object_info, "get_object_info")
                    if not isinstance(object_data, dict) or object_data.get("name") != "BeaconColumn" or object_data.get("type") != "MESH" or object_data.get("mesh", {}).get("vertices", 0) <= 0 or "Beacon Bronze" not in object_data.get("materials", []):
                        raise RuntimeError(f"object inspection was incomplete: {object_data}")
                    shot = await _mcp_call(client, "get_viewport_screenshot", {"max_size": 640, "user_prompt": "Create and verify a parametric beacon model."})
                    _assert_result_ok(shot, "get_viewport_screenshot")
                    preview = await _mcp_call(client, "render_preview", {"name": WORKLOAD_NAME, "width": 640, "height": 640, "samples": 8})
                    glb = await _mcp_call(client, "export_glb", {"name": WORKLOAD_NAME})
                    saved = await _mcp_call(client, "save_project")
                    _assert_result_ok(saved, "save_project")
                    preview_data = _structured_json(preview, "render_preview")
                    glb_data = _structured_json(glb, "export_glb")
                    screenshot_path = artifact_dir / f"{project}-viewport.json"
                    screenshot_bytes = _save_viewport_result(shot, screenshot_path)
                    preview_path = artifact_dir / f"{project}-preview.png"
                    glb_path = artifact_dir / f"{project}-{WORKLOAD_NAME}.glb"
                    preview_url = preview_data.get("url") if isinstance(preview_data, dict) else None
                    glb_url = glb_data.get("url") if isinstance(glb_data, dict) else None
                    preview_bytes = await _artifact_download(root_endpoint, preview_url, first.token, preview_path) if preview_url else 0
                    glb_bytes = await _artifact_download(root_endpoint, glb_url, first.token, glb_path) if glb_url else 0
                    if preview_bytes <= 0 or not preview_path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
                        raise RuntimeError("render_preview did not produce a PNG artifact")
                    if glb_bytes <= 0 or not glb_path.read_bytes().startswith(b"glTF"):
                        raise RuntimeError("export_glb did not produce a GLB artifact")
        egress = _egress_probe(first.sandbox)
        if egress.get("tcp_blocked") is not True or egress.get("https_blocked") is not True or egress.get("oidc_or_provider_credentials_present") is not False:
            raise RuntimeError(f"sandbox isolation probe failed: {egress}")
        workload_seconds = time.perf_counter() - workload_started
        app.save_session(project)
        first.stop()
        first = None
        resume_started = time.perf_counter()
        resumed = app.resume_session(app.SessionOptions(project, timeout=300, cpu_limit=cpu_limit))
        resume_seconds = time.perf_counter() - resume_started
        async with httpx.AsyncClient(headers={"Authorization": f"Bearer {resumed.token}"}, timeout=180) as http_client:
            async with streamable_http_client(_mcp_endpoint(resumed.url), http_client=http_client) as (read, write, _):
                async with ClientSession(read, write) as client:
                    await client.initialize()
                    retained = await _mcp_call(client, "get_object_info", {"object_name": "BeaconColumn", "user_prompt": "Verify the saved parametric beacon after resuming the same project."})
                    retained_data = _structured_json(retained, "retained get_object_info")
                    if not isinstance(retained_data, dict) or retained_data.get("name") != "BeaconColumn" or retained_data.get("type") != "MESH" or retained_data.get("mesh", {}).get("vertices", 0) <= 0:
                        raise RuntimeError(f"saved geometry was not retained: {retained_data}")
        elapsed = time.perf_counter() - started
        return {"ok": True, "project": project, "cpu_limit": cpu_limit, "latency_seconds": round(elapsed, 3), "startup_seconds": round(startup_seconds, 3), "workload_seconds": round(workload_seconds, 3), "resume_seconds": round(resume_seconds, 3), "tools": tool_names, "auth": auth, "scene_inspected": True, "object_inspected": True, "retained_after_resume": True, "artifact_bytes": {"viewport": screenshot_bytes, "preview": preview_bytes, "glb": glb_bytes}, "egress": egress, "estimated_cost_usd": {"lower_bound": round((CPU_REQUEST * workload_seconds * CPU_PRICE) + ((MEMORY_REQUEST_MIB / 1024) * workload_seconds * MEMORY_PRICE), 8), "upper_bound": round((cpu_limit * workload_seconds * CPU_PRICE) + (4 * workload_seconds * MEMORY_PRICE), 8)}}
    except Exception as error:
        return {"ok": False, "project": project, "cpu_limit": cpu_limit, "latency_seconds": round(time.perf_counter() - started, 3), "error": _safe_error(error)}
    finally:
        for session in (resumed, first):
            if session is not None:
                try:
                    session.stop()
                except Exception:
                    pass


async def main(args: argparse.Namespace) -> int:
    artifact_dir = Path(args.artifacts).resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)
    projects = [args.project] if args.project else []
    limits = [args.cpu_limit] if not args.benchmark else [2, 4]
    while len(projects) < len(limits):
        projects.append(str(uuid.uuid4()))
    results = [await _run_workload(project, limit, artifact_dir) for project, limit in zip(projects, limits)]
    print(json.dumps({"verifier": "cloud.blender_mcp.verify", "results": results}, indent=2, sort_keys=True))
    return 0 if all(result.get("ok") for result in results) else 1


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", help="UUID to use for one run and its resume")
    parser.add_argument("--cpu-limit", type=int, choices=(2, 4), default=DEFAULT_CPU_LIMIT)
    parser.add_argument("--benchmark", action="store_true", help="run the fixed workload at CPU caps 2 and 4")
    parser.add_argument("--artifacts", default="/tmp/agartha-blender-verify")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(_parse_args())))
