"""Process lifecycle for Xvfb, Blender's GUI event loop, and MCP HTTP."""
from __future__ import annotations

import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Sequence

from .bootstrap import READY_FILE, build_bootstrap_script
from .config import DEFAULT_IDLE_SECONDS, DEFAULT_TIMEOUT_SECONDS


def _terminate(process: subprocess.Popen[bytes] | None, timeout: float = 5) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=timeout)


def _sync_workspace(workspace: Path) -> None:
    """Flush the editable volume before process teardown or handoff."""
    for path in workspace.rglob("*"):
        if path.is_file():
            try:
                with path.open("rb") as file:
                    os.fsync(file.fileno())
            except OSError:
                pass
    os.sync()


def checkpoint_live(workspace: Path) -> None:
    """Ask the live upstream add-on to save, then flush the mounted volume."""
    from blender_mcp.server import get_blender_connection  # type: ignore
    result = get_blender_connection().send_command(
        "execute_code", {"code": "bpy.ops.wm.save_as_mainfile(filepath='/workspace/project.blend')"}
    )
    if isinstance(result, dict) and result.get("error"):
        raise RuntimeError("Blender checkpoint failed")
    _sync_workspace(workspace)
def run_supervisor(*, blender: str | None = None, idle_seconds: int | None = None,
                   max_seconds: int | None = None, workspace: Path | None = None,
                   service_command: Sequence[str] | None = None) -> int:
    """Run children, stopping all of them on failure, timeout, or interruption."""
    blender = blender or os.environ.get("BLENDER_BIN", "/usr/local/bin/blender")
    idle_seconds = idle_seconds if idle_seconds is not None else int(os.environ.get("BLENDER_MCP_IDLE_SECONDS", DEFAULT_IDLE_SECONDS))
    max_seconds = max_seconds if max_seconds is not None else int(os.environ.get("BLENDER_MCP_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    workspace = workspace or Path(os.environ.get("BLENDER_MCP_WORKSPACE", "/workspace"))
    xvfb = blender_proc = service = None
    started = time.monotonic()
    workspace.mkdir(parents=True, exist_ok=True)
    ready = workspace / READY_FILE.name
    ready.unlink(missing_ok=True)
    (workspace / ".mcp-last-activity").unlink(missing_ok=True)
    commands = service_command or ("python", "-m", "cloud.blender_mcp.service_main")
    stopping = False

    def request_stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    old_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}
    for sig in old_handlers:
        signal.signal(sig, request_stop)
    try:
        xvfb = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1280x1024x24", "-nolisten", "tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        env = os.environ.copy()
        env.update({"DISPLAY": ":99", "BLENDER_MCP_READY_FILE": str(ready), "BLENDER_MCP_PROJECT_FILE": str(workspace / "project.blend")})
        blender_proc = subprocess.Popen([blender, "--python-expr", build_bootstrap_script(workspace / "project.blend", ready)], env=env)
        deadline = time.monotonic() + min(120, max_seconds)
        while not ready.exists():
            if stopping or blender_proc.poll() is not None or time.monotonic() >= deadline:
                return 1
            time.sleep(0.1)
        service = subprocess.Popen(list(commands), env=env)
        while True:
            if stopping or any(proc.poll() is not None for proc in (xvfb, blender_proc, service)):
                return 1
            if time.monotonic() - started >= max_seconds:
                return 0
            marker = workspace / ".mcp-last-activity"
            try:
                raw_marker = marker.read_text(encoding="ascii")
                if raw_marker.startswith("busy:"):
                    time.sleep(0.25)
                    continue
                last = float(raw_marker)
            except (FileNotFoundError, ValueError):
                last = started
            if time.monotonic() - last >= idle_seconds:
                return 0
            time.sleep(0.25)
    finally:
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        _terminate(service)
        _terminate(blender_proc)
        _terminate(xvfb)
        _sync_workspace(workspace)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()
    if args.save:
        target_workspace = Path(os.environ.get("BLENDER_MCP_WORKSPACE", "/workspace"))
        checkpoint_live(target_workspace)
        raise SystemExit(0)
    raise SystemExit(run_supervisor())
