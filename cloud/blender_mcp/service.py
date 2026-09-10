"""HTTP service around the pinned upstream FastMCP server."""
from __future__ import annotations

import inspect
import functools
import os
import asyncio
import threading
import time
from pathlib import Path
from typing import Any

from .config import (
    ESSENTIALS_GUIDANCE, ARTIFACT_DIRECTORY, CORE_TOOLS, MAX_ARTIFACTS, MAX_BLEND_BYTES, MAX_GLB_BYTES,
    MAX_PNG_BYTES, MAX_RENDER_SAMPLES, MAX_RENDER_SIZE, MAX_SCRIPT_BYTES, PROJECT_FILE, artifact_name,
)


class Activity:
    def __init__(self, marker: Path | None = None) -> None:
        self._lock = threading.Lock()
        self._last = time.monotonic()
        self._busy = 0
        self.marker = marker

    def touch(self) -> None:
        with self._lock:
            self._last = time.monotonic()
            if self.marker is not None:
                if self._busy == 0:
                    self.marker.write_text(str(self._last), encoding="ascii")

    def begin(self) -> None:
        with self._lock:
            self._busy += 1
            if self.marker is not None:
                self.marker.write_text(f"busy:{time.monotonic()}", encoding="ascii")

    def end(self) -> None:
        with self._lock:
            self._busy = max(0, self._busy - 1)
            self._last = time.monotonic()
            if self.marker is not None:
                self.marker.write_text(f"busy:{self._last}" if self._busy else str(self._last), encoding="ascii")

    def idle_for(self) -> float:
        with self._lock:
            return max(0.0, time.monotonic() - self._last)


class SessionStore:
    """Validated project/artifact operations shared by MCP helpers and HTTP."""
    def __init__(self, workspace: Path = Path(ARTIFACT_DIRECTORY).parent) -> None:
        self.workspace = workspace.resolve()
        self.artifacts = (self.workspace / "artifacts").resolve()
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def _path(self, name: str, suffix: str) -> Path:
        path = (self.artifacts / artifact_name(name, suffix)).resolve()
        if path.parent != self.artifacts:
            raise ValueError("Artifact path escapes workspace.")
        return path

    def _check_size(self, path: Path, limit: int) -> None:
        if path.exists() and path.stat().st_size > limit:
            raise ValueError("Artifact exceeds configured size limit.")

    def list_artifacts(self) -> list[dict[str, Any]]:
        rows = []
        for path in sorted(self.artifacts.iterdir()):
            if path.is_file() and path.is_relative_to(self.artifacts):
                rows.append({"name": path.name, "bytes": path.stat().st_size})
        if len(rows) > MAX_ARTIFACTS:
            raise ValueError("Artifact count exceeds configured limit.")
        return rows

    def artifact(self, name: str, suffix: str) -> Path:
        path = self._path(name, suffix)
        if not path.exists() and len(list(self.artifacts.iterdir())) >= MAX_ARTIFACTS:
            raise ValueError("Artifact count exceeds configured limit.")
        limits = {".blend": MAX_BLEND_BYTES, ".glb": MAX_GLB_BYTES, ".png": MAX_PNG_BYTES}
        self._check_size(path, limits[suffix])
        return path

    def checkpoint(self) -> dict[str, Any]:
        path = self.workspace / "project.blend"
        self._check_size(path, MAX_BLEND_BYTES)
        return {"name": path.name, "bytes": path.stat().st_size if path.exists() else 0}


async def _call_upstream(mcp: Any, name: str, arguments: dict[str, Any]) -> Any:
    """Call a tool through FastMCP's registered tool manager."""
    if name == "execute_blender_code":
        validate_script(arguments.get("code", ""))
    manager = getattr(mcp, "_tool_manager", None)
    tool = manager.get_tool(name) if manager is not None else None
    if tool is None:
        raise RuntimeError(f"Upstream tool is unavailable: {name}")
    result = tool.run(arguments)
    output = await result if inspect.isawaitable(result) else result
    return output


def require_code_success(result: Any) -> Any:
    if isinstance(result, str) and not result.startswith("Code executed successfully:"):
        raise RuntimeError(result[:512])
    return result


def validate_script(code: str) -> str:
    """Validate code before it reaches the upstream execution tool."""
    from .config import MAX_SCRIPT_BYTES
    if not isinstance(code, str) or len(code.encode("utf-8")) > MAX_SCRIPT_BYTES:
        raise ValueError("Blender code exceeds configured size limit.")
    return code


def filter_tools(mcp: Any) -> None:
    """Remove upstream integrations outside the approved core tool contract."""
    manager = getattr(mcp, "_tool_manager", None)
    tools = getattr(manager, "_tools", None)
    if tools is None:
        raise RuntimeError("Pinned FastMCP tool manager is unavailable.")
    for name in list(tools):
        if name not in CORE_TOOLS:
            tools.pop(name)


def wrap_execute_tool(mcp: Any, activity: Activity, project_file: Path = Path(PROJECT_FILE)) -> None:
    """Bound and autosave direct MCP dispatches while preserving the schema."""
    manager = getattr(mcp, "_tool_manager", None)
    tool = manager.get_tool("execute_blender_code") if manager is not None else None
    original = getattr(tool, "fn", None)
    if original is None or getattr(tool, "_agartha_wrapped", False):
        return

    @functools.wraps(original)
    async def guarded(*args: Any, **kwargs: Any) -> Any:
        positional_code = len(args) > 1 and "code" not in kwargs
        code = validate_script(args[1] if positional_code else kwargs.get("code", ""))
        activity.begin()
        try:
            call_args = (*args[:1], code, *args[2:]) if positional_code else args
            call_kwargs = kwargs if positional_code else {**kwargs, "code": code}
            result = original(*call_args, **call_kwargs)
            output = await result if inspect.isawaitable(result) else result
            if isinstance(output, str) and (output.startswith("Error executing code:") or output.startswith("Rejected by safe mode")):
                raise RuntimeError(output[:512])
            save_code = f"import bpy; bpy.ops.wm.save_as_mainfile(filepath={str(project_file)!r})"
            if isinstance(output, str) and output.startswith("Code executed successfully:") and code.strip() != save_code:
                save_kwargs = {"code": save_code, "user_prompt": ""}
                if "ctx" in kwargs: save_kwargs["ctx"] = kwargs["ctx"]
                saved = original(args[0], **save_kwargs) if args else original(**save_kwargs)
                saved_output = await saved if inspect.isawaitable(saved) else saved
                if isinstance(saved_output, str) and not saved_output.startswith("Code executed successfully:"):
                    raise RuntimeError(f"Blender edit succeeded but checkpoint failed: {str(saved_output)[:512]}")
            return output
        finally:
            activity.end()

    tool.fn = guarded
    tool._agartha_wrapped = True


def wrap_tool_dispatch(mcp: Any, activity: Activity) -> None:
    """Serialize every FastMCP dispatch and account only for real tool calls."""
    manager = getattr(mcp, "_tool_manager", None)
    original = getattr(manager, "call_tool", None)
    if original is None or getattr(manager, "_agartha_wrapped", False):
        return
    lock = asyncio.Lock()

    @functools.wraps(original)
    async def guarded(name: str, arguments: dict[str, Any], context: Any = None, convert_result: bool = False) -> Any:
        async with lock:
            activity.begin()
            try:
                return await original(name, arguments, context=context, convert_result=convert_result)
            finally:
                activity.end()

    manager.call_tool = guarded
    manager._agartha_wrapped = True


def register_helpers(mcp: Any, store: SessionStore, activity: Activity) -> None:
    """Register bounded helpers on the real upstream FastMCP instance."""
    if not hasattr(mcp, "tool"):
        raise RuntimeError("Pinned upstream FastMCP instance is required.")
    operation_lock = asyncio.Lock()

    @mcp.tool()
    async def save_project() -> dict[str, Any]:
        activity.touch()
        async with operation_lock:
            require_code_success(await _call_upstream(mcp, "execute_blender_code", {"code": f"import bpy; bpy.ops.wm.save_as_mainfile(filepath={str(store.workspace / 'project.blend')!r})"}))
            return store.checkpoint()

    @mcp.tool()
    async def export_glb(name: str = "model") -> dict[str, Any]:
        activity.touch()
        path = store.artifact(name, ".glb")
        code = f"import bpy; bpy.ops.export_scene.gltf(filepath={str(path)!r}, export_format='GLB', export_apply=True)"
        async with operation_lock:
            require_code_success(await _call_upstream(mcp, "execute_blender_code", {"code": code}))
            store._check_size(path, MAX_GLB_BYTES)
            return {"name": path.name, "bytes": path.stat().st_size, "url": f"/artifacts/{path.name}"}

    @mcp.tool()
    async def render_preview(name: str = "preview", width: int = 1024, height: int = 1024, samples: int = 32) -> dict[str, Any]:
        activity.touch()
        if not (1 <= width <= MAX_RENDER_SIZE and 1 <= height <= MAX_RENDER_SIZE and 1 <= samples <= MAX_RENDER_SAMPLES):
            raise ValueError("Render dimensions or samples exceed configured limits.")
        path = store.artifact(name, ".png")
        code = f"import bpy; scene=bpy.context.scene; scene.render.resolution_x={width}; scene.render.resolution_y={height}; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.render.filepath={str(path)!r}; hasattr(scene,'cycles') and setattr(scene.cycles,'samples',{samples}); bpy.ops.render.render(write_still=True)"
        async with operation_lock:
            require_code_success(await _call_upstream(mcp, "execute_blender_code", {"code": code}))
            store._check_size(path, MAX_PNG_BYTES)
            return {"name": path.name, "bytes": path.stat().st_size, "url": f"/artifacts/{path.name}"}

    @mcp.tool()
    def list_artifacts() -> list[dict[str, Any]]:
        activity.touch()
        return store.list_artifacts()


def load_upstream() -> Any:
    from blender_mcp.server import mcp  # type: ignore
    return mcp


def create_app(*, workspace: Path | None = None, require_token: bool = False,
               strict_transport: bool = False) -> Any:
    """Return upstream's Streamable HTTP adapter and session state."""
    from mcp.server.transport_security import TransportSecuritySettings

    mcp = load_upstream()
    mcp._mcp_server.instructions = (mcp.instructions or "") + "\n" + ESSENTIALS_GUIDANCE
    mcp.settings.transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=strict_transport,
        allowed_hosts=(
            ["127.0.0.1", "127.0.0.1:*", "localhost", "localhost:*", "[::1]", "[::1]:*"]
            if strict_transport else []
        ),
    )
    filter_tools(mcp)
    manager = getattr(mcp, "_tool_manager", None)
    registered = set(getattr(manager, "_tools", {}))
    if not CORE_TOOLS.issubset(registered):
        raise RuntimeError("Pinned upstream core tool allowlist is incomplete.")
    store = SessionStore(workspace or Path(ARTIFACT_DIRECTORY).parent)
    activity = Activity(store.workspace / ".mcp-last-activity")
    wrap_execute_tool(mcp, activity, store.workspace / "project.blend")
    wrap_tool_dispatch(mcp, activity)
    register_helpers(mcp, store, activity)
    return SessionASGI(mcp.streamable_http_app(), activity, store, require_token=require_token), activity, store


class SessionASGI:
    """Small route wrapper that delegates MCP requests to upstream's ASGI app."""
    def __init__(self, upstream: Any, activity: Activity, store: SessionStore, *, require_token: bool = False) -> None:
        self.expected_token = os.environ.get("MCP_CONNECT_TOKEN")
        if require_token and not (self.expected_token or "").strip():
            raise RuntimeError("MCP_CONNECT_TOKEN is required when token authentication is enabled.")
        self.upstream, self.activity, self.store, self.require_token = upstream, activity, store, require_token

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            return await self.upstream(scope, receive, send)
        path = scope.get("path", "")
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        expected = self.expected_token
        if (self.require_token or expected) and headers.get("authorization") != f"Bearer {expected}":
            await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"text/plain")]})
            await send({"type": "http.response.body", "body": b"Unauthorized"})
            return
        if int(headers.get("content-length", "0") or 0) > MAX_SCRIPT_BYTES * 2:
            await send({"type": "http.response.start", "status": 413, "headers": []})
            await send({"type": "http.response.body", "body": b"Request too large"})
            return
        if path == "/healthz":
            await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": b'{"status":"ready"}'})
            return
        if path.startswith("/artifacts/") and scope.get("method") == "GET":
            name = path.removeprefix("/artifacts/")
            if "." not in name:
                await send({"type": "http.response.start", "status": 404, "headers": []})
                await send({"type": "http.response.body", "body": b"Not found"})
                return
            stem, suffix = name.rsplit(".", 1)
            try:
                artifact = self.store.artifact(stem, "." + suffix)
            except (ValueError, KeyError):
                artifact = None
            if artifact is None or not artifact.is_file():
                await send({"type": "http.response.start", "status": 404, "headers": []})
                await send({"type": "http.response.body", "body": b"Not found"})
                return
            body = artifact.read_bytes()
            self.activity.touch()
            await send({"type": "http.response.start", "status": 200, "headers": [(b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
            return
        prefetched = []
        if scope.get("method") in {"POST", "PUT", "PATCH"}:
            total = 0
            while True:
                message = await receive()
                prefetched.append(message)
                total += len(message.get("body", b"")) if message.get("type") == "http.request" else 0
                if total > MAX_SCRIPT_BYTES * 2:
                    await send({"type": "http.response.start", "status": 413, "headers": []})
                    await send({"type": "http.response.body", "body": b"Request too large"})
                    return
                if not message.get("more_body", False):
                    break
        replay_index = 0
        async def bounded_receive() -> dict[str, Any]:
            nonlocal replay_index
            if replay_index < len(prefetched):
                message = prefetched[replay_index]
                replay_index += 1
                return message
            return await receive()
        try:
            await self.upstream(scope, bounded_receive, send)
        except ValueError as error:
            if str(error) == "Request too large":
                await send({"type": "http.response.start", "status": 413, "headers": []})
                await send({"type": "http.response.body", "body": b"Request too large"})
            else:
                raise
