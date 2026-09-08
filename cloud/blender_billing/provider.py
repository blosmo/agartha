"""Trusted Modal provider adapter for paid, private Blender workers."""
from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import posixpath
import time
from dataclasses import dataclass
from typing import Any, BinaryIO

from .storage import PROJECT_MAX_BYTES, RESPONSE_MAX_BYTES
from .worker_bridge import MAX_REQUEST_BYTES, decode_frame, encode_frame

MAX_STARTUP_ALLOWANCE_SECONDS = 75
WORKER_CPU = 2
WORKER_MEMORY_MIB = 4096
CHECKPOINT_PATH = "/workspace/project.blend"
FILE_TIMEOUT_SECONDS = 12


def _sync(value: Any) -> Any:
    if not inspect.isawaitable(value):
        return value
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(value)
    raise RuntimeError("Modal provider cannot be called synchronously from a running event loop")


async def _sdk_async(method: Any, *args: Any, **kwargs: Any) -> Any:
    """Use Modal's actual async interface so the controller deadline can interrupt I/O."""
    invoke = getattr(method, "aio", method)
    value = invoke(*args, **kwargs)
    return await value if inspect.isawaitable(value) else value


def worker_name(reservation_id: str, generation: int) -> str:
    digest = hashlib.sha256(f"{reservation_id}:{generation}".encode()).hexdigest()[:24]
    return f"paid-blender-{digest}"


@dataclass(frozen=True)
class WorkerHandle:
    worker_id: str
    sandbox: Any
    deadline: float


class ModalProvider:
    def __init__(self, sdk: Any, image_id: str, app_name: str = "agartha-paid-blender") -> None:
        if not isinstance(image_id, str) or not image_id.strip():
            raise ValueError("A prebuilt paid Blender image ID is required")
        self.sdk = sdk
        self.image_id = image_id
        self.app_name = app_name
        self._workers: dict[str, WorkerHandle] = {}

    def ensure_worker(self, reservation_id: str, generation: int, claimed_at: float, reserved_minutes: int) -> str:
        key = f"{reservation_id}:{generation}"
        existing = self._workers.get(key)
        if existing is not None:
            return existing.worker_id
        if reserved_minutes < 1 or not isinstance(claimed_at, (int, float)):
            raise ValueError("Invalid paid worker reservation")
        deadline = float(claimed_at) + reserved_minutes * 60 + MAX_STARTUP_ALLOWANCE_SECONDS
        if time.time() >= deadline:
            raise ValueError("Paid worker reservation has expired")
        timeout = max(1, int(deadline - time.time()))
        name = worker_name(reservation_id, generation)
        from_name = getattr(self.sdk.Sandbox, "from_name", None)
        if from_name is not None:
            try:
                sandbox = _sync(from_name(self.app_name, name))
                handle = WorkerHandle(getattr(sandbox, "object_id", name), sandbox, deadline)
                self._workers[key] = handle
                return handle.worker_id
            except Exception as error:
                not_found = getattr(getattr(self.sdk, "exception", None), "NotFoundError", None)
                if not_found is None or not isinstance(error, not_found):
                    raise
        image = self.sdk.Image.from_id(self.image_id)
        app = self.sdk.App.lookup(self.app_name, create_if_missing=False)
        sandbox = _sync(self.sdk.Sandbox.create(
            "python", "-m", "cloud.blender_billing.runtime",
            image=image,
            app=app,
            name=name,
            env={"AGARTHA_PAID_TTL_SECONDS": str(timeout), "DISABLE_TELEMETRY": "true"},
            secrets=[],
            volumes={},
            timeout=timeout,
            cpu=(WORKER_CPU, WORKER_CPU),
            memory=(WORKER_MEMORY_MIB, WORKER_MEMORY_MIB),
            gpu=None,
            block_network=True,
            encrypted_ports=[],
            h2_ports=[],
            unencrypted_ports=[],
            include_oidc_identity_token=False,
        ))
        handle = WorkerHandle(getattr(sandbox, "object_id", name), sandbox, deadline)
        self._workers[key] = handle
        return handle.worker_id

    def lookup_worker(self, reservation_id: str, generation: int) -> str | None:
        """Find an existing deterministic worker without creating one."""
        from_name = getattr(self.sdk.Sandbox, "from_name", None)
        if from_name is None:
            raise RuntimeError("Modal SDK does not support named Sandbox lookup")
        name = worker_name(reservation_id, generation)
        try:
            sandbox = _sync(from_name(self.app_name, name))
        except Exception as error:
            not_found = getattr(getattr(self.sdk, "exception", None), "NotFoundError", None)
            if not_found is not None and isinstance(error, not_found):
                return None
            raise
        worker_id = getattr(sandbox, "object_id", name)
        self._workers[f"{reservation_id}:{generation}"] = WorkerHandle(worker_id, sandbox, float("inf"))
        return worker_id

    def _handle(self, worker_id: str) -> WorkerHandle:
        for handle in self._workers.values():
            if handle.worker_id == worker_id:
                return handle
        sandbox = self.sdk.Sandbox.from_id(worker_id)
        handle = WorkerHandle(worker_id, sandbox, float("inf"))
        self._workers[worker_id] = handle
        return handle

    async def _invoke_async(self, handle: WorkerHandle, request: dict[str, Any], max_bytes: int, timeout: float) -> dict[str, Any]:
        if max_bytes < 1 or max_bytes > RESPONSE_MAX_BYTES:
            raise ValueError("Invalid response byte limit")
        process = await _sdk_async(handle.sandbox.exec,
            "python", "-m", "cloud.blender_billing.worker_bridge",
            text=False, timeout=max(1, int(timeout)),
        )
        frame = encode_frame(request, max_bytes=MAX_REQUEST_BYTES)
        written = process.stdin.write(frame)
        if inspect.isawaitable(written):
            await written
        ended = process.stdin.write_eof()
        if inspect.isawaitable(ended):
            await ended
        await _sdk_async(process.stdin.drain)
        raw = bytearray()
        stream = process.stdout
        if hasattr(stream, "__aiter__"):
            async for chunk in stream:
                raw.extend(chunk.encode() if isinstance(chunk, str) else chunk)
                if len(raw) > max_bytes:
                    raise ValueError("Worker response exceeds the configured limit")
        else:
            while True:
                chunk = stream.read(min(64 * 1024, max_bytes + 1))
                chunk = await chunk if inspect.isawaitable(chunk) else chunk
                if not chunk:
                    break
                raw.extend(chunk.encode() if isinstance(chunk, str) else chunk)
                if len(raw) > max_bytes:
                    raise ValueError("Worker response exceeds the configured limit")
        exit_code = await _sdk_async(process.wait)
        if exit_code not in (None, 0):
            raise RuntimeError(f"Worker bridge exited with status {exit_code}")
        line = bytes(raw).split(b"\n", 1)[0]
        response = decode_frame(line, max_bytes=max_bytes)
        if response.get("id") != request.get("id"):
            raise ValueError("Worker response ID does not match request")
        if len(raw.split(b"\n", 1)[1]) if b"\n" in raw else 0:
            raise ValueError("Worker returned extra output")
        return response

    def call(self, worker_id: str, request: dict[str, Any], max_bytes: int = RESPONSE_MAX_BYTES, timeout: float = 30) -> dict[str, Any]:
        if not isinstance(request.get("id"), (str, int)):
            raise ValueError("Worker requests require an ID")
        operation = self._invoke_async(self._handle(worker_id), request, max_bytes, timeout)
        return _sync(asyncio.wait_for(operation, timeout=max(1, timeout) + 2))

    def ready(self, worker_id: str) -> bool:
        try:
            response = self.call(worker_id, {"id": "ready", "method": "tools/call", "params": {"name": "execute_blender_code", "arguments": {"code": "print('AGARTHA_BLENDER_READY')"}}}, max_bytes=65_536, timeout=10)
        except TimeoutError:
            # Container boot and Blender initialization can outlast one probe.
            # The broker still enforces the original overall startup deadline.
            return False
        if response.get("error"):
            raise RuntimeError(f"Worker readiness bridge failed: {response['error'].get('type', 'unknown')}")
        result = response.get("result", {})
        if not isinstance(result, dict) or result.get("isError"):
            return False
        return any(isinstance(block, dict) and block.get("type") == "text" and str(block.get("text", "")).startswith("Code executed successfully:") and "AGARTHA_BLENDER_READY" in block["text"] for block in result.get("content", []))

    def poll(self, worker_id: str) -> int | None:
        return self._handle(worker_id).sandbox.poll()

    def stop(self, worker_id: str) -> Any:
        return self._handle(worker_id).sandbox.terminate(wait=True)

    async def _transfer(self, worker_id: str, remote_path: str, stream: BinaryIO, max_bytes: int, writing: bool) -> int:
        if not (remote_path == CHECKPOINT_PATH or remote_path.startswith("/workspace/artifacts/")):
            raise ValueError("Invalid worker file path")
        if writing:
            script = ("import os,sys,tempfile; p=%r; d=os.path.dirname(p); fd,t=tempfile.mkstemp(dir=d,prefix='.paid-upload-'); f=os.fdopen(fd,'wb'); n=0\n"
                      "while True:\n c=sys.stdin.buffer.read(1048576)\n if not c: break\n n+=len(c)\n if n>%d: f.close(); os.unlink(t); raise SystemExit(73)\n f.write(c)\n"
                      "f.flush(); os.fsync(f.fileno()); f.close(); os.replace(t,p)\n") % (remote_path, max_bytes)
        else:
            script = ("import os,stat,sys; fd=os.open(%r,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW); s=os.fstat(fd); assert stat.S_ISREG(s.st_mode), 'Expected regular file'; f=os.fdopen(fd,'rb'); n=0\n"
                      "while True:\n c=f.read(min(1048576,%d-n+1))\n if not c: break\n n+=len(c)\n if n>%d: raise SystemExit(73)\n sys.stdout.buffer.write(c); sys.stdout.buffer.flush()\n"
                      "f.close()\n") % (remote_path, max_bytes, max_bytes)
        process = await _sdk_async(self._handle(worker_id).sandbox.exec, "python", "-c", script, text=False, timeout=FILE_TIMEOUT_SECONDS)
        total = 0
        if writing:
            while True:
                chunk = stream.read(min(1048576, max_bytes - total + 1))
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("Worker file exceeds the accepted byte limit.")
                process.stdin.write(chunk)
                await _sdk_async(process.stdin.drain)
            process.stdin.write_eof()
            await _sdk_async(process.stdin.drain)
        else:
            reader = process.stdout
            if hasattr(reader, "__aiter__"):
                async for chunk in reader:
                    data = chunk.encode() if isinstance(chunk, str) else chunk
                    total += len(data)
                    if total > max_bytes:
                        raise ValueError("Worker file exceeds the accepted byte limit.")
                    stream.write(data)
            else:
                while True:
                    chunk = await _sdk_async(reader.read)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("Worker file exceeds the accepted byte limit.")
                    stream.write(chunk)
        code = await _sdk_async(process.wait)
        if total > max_bytes:
            raise ValueError("Worker file exceeds the accepted byte limit.")
        if code not in (None, 0):
            raise RuntimeError(f"Worker file transfer exited with status {code}")
        return total

    def _bounded_transfer(self, worker_id: str, remote_path: str, stream: BinaryIO, max_bytes: int, writing: bool) -> int:
        transfer = self._transfer(worker_id, remote_path, stream, max_bytes, writing)
        return _sync(asyncio.wait_for(transfer, timeout=FILE_TIMEOUT_SECONDS))

    def read_checkpoint(self, worker_id: str, sink: BinaryIO, max_bytes: int = PROJECT_MAX_BYTES) -> int:
        if max_bytes < 1 or max_bytes > PROJECT_MAX_BYTES:
            raise ValueError("Invalid checkpoint limit")
        return self._bounded_transfer(worker_id, CHECKPOINT_PATH, sink, max_bytes, False)

    def read_artifact(self, worker_id: str, name: str, sink: BinaryIO, max_bytes: int = RESPONSE_MAX_BYTES) -> int:
        if not isinstance(name, str) or posixpath.basename(name) != name or name in {"", ".", ".."}:
            raise ValueError("Invalid artifact name")
        if max_bytes < 1 or max_bytes > RESPONSE_MAX_BYTES:
            raise ValueError("Invalid artifact limit")
        return self._bounded_transfer(worker_id, f"/workspace/artifacts/{name}", sink, max_bytes, False)

    def write_checkpoint(self, worker_id: str, source: BinaryIO, max_bytes: int = PROJECT_MAX_BYTES) -> int:
        if max_bytes < 1 or max_bytes > PROJECT_MAX_BYTES:
            raise ValueError("Invalid checkpoint limit")
        total = self._bounded_transfer(worker_id, CHECKPOINT_PATH, source, max_bytes, True)
        result = self.call(worker_id, {"id": "restore", "method": "tools/call", "params": {"name": "execute_blender_code", "arguments": {"code": "import bpy; bpy.ops.wm.open_mainfile(filepath='/workspace/project.blend', load_ui=True, use_scripts=False)"}}}, max_bytes=65_536, timeout=10)
        tool_result = result.get("result", {})
        if result.get("error") or tool_result.get("isError") or not any(isinstance(block, dict) and str(block.get("text", "")).startswith("Code executed successfully:") for block in tool_result.get("content", [])):
            raise RuntimeError("Blender could not restore the project.")
        return total
