"""Operator-side lifecycle for isolated Modal Blender MCP sessions."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import (
    ADDON_PORT,
    APP_NAME,
    CPU_REQUEST,
    DEFAULT_CPU_LIMIT,
    DEFAULT_IDLE_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    HTTP_PORT,
    MEMORY_LIMIT_MIB,
    MEMORY_REQUEST_MIB,
    VOLUME_NAME,
    project_id,
)
from .image import build_image

try:
    import modal
except ImportError:  # pragma: no cover - exercised with dependency injection in tests
    modal = None  # type: ignore[assignment]


@dataclass(frozen=True)
class SessionOptions:
    project: str
    timeout: int = DEFAULT_TIMEOUT_SECONDS
    idle_seconds: int = DEFAULT_IDLE_SECONDS
    cpu_limit: int = DEFAULT_CPU_LIMIT

    def __post_init__(self) -> None:
        object.__setattr__(self, "project", project_id(self.project))
        if not 120 <= self.timeout <= 3600:
            raise ValueError("timeout must be between 120 and 3600 seconds")
        if self.idle_seconds < 30:
            raise ValueError("idle_seconds must be at least 30 seconds")
        if self.cpu_limit not in (2, 4):
            raise ValueError("cpu_limit must be 2 or 4")


@dataclass
class Session:
    sandbox: Any
    project: str
    url: str
    token: str

    def stop(self) -> None:
        self.sandbox.terminate(wait=True)


def _require_modal() -> Any:
    if modal is None:
        raise RuntimeError("Modal SDK is required; use its isolated Python environment")
    return modal


def project_mount(project: str, volume: Any | None = None) -> tuple[str, Any]:
    """Return a project-only Volume mount, never the shared volume root."""
    sdk = _require_modal()
    canonical = project_id(project)
    volume = volume or sdk.Volume.from_name(
        VOLUME_NAME, create_if_missing=True, version=2
    )
    return "/workspace", volume.with_mount_options(sub_path=f"projects/{canonical}")


def create_session(options: SessionOptions, *, app: Any | None = None, image: Any | None = None) -> Session:
    """Create, await, and authenticate one project-scoped Sandbox."""
    sdk = _require_modal()
    app = app or sdk.App.lookup(APP_NAME, create_if_missing=True)
    image = image or build_image()
    mount_path, volume = project_mount(options.project)
    name = f"project-{options.project}"
    env = {
        "BLENDER_MCP_IDLE_SECONDS": str(options.idle_seconds),
        "BLENDER_MCP_TIMEOUT_SECONDS": str(options.timeout),
        "BLENDER_MCP_PROJECT_ID": options.project,
        "BLENDER_MCP_SAFE_MODE": "1",
        "DISABLE_TELEMETRY": "true",
        "BLENDER_MCP_WORKSPACE": "/workspace",
        "BLENDER_MCP_ADDON_PORT": str(ADDON_PORT),
    }
    readiness = sdk.Probe.with_exec(
        "python",
        "-c",
        "import urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2); raise SystemExit(0 if r.status == 200 else 1)",
    )
    sandbox = None
    try:
        sandbox = sdk.Sandbox.create(
            "python",
            "-m",
            "cloud.blender_mcp.supervisor",
            app=app,
            image=image,
            name=name,
            env=env,
            volumes={mount_path: volume},
            timeout=options.timeout,
            cpu=(CPU_REQUEST, float(options.cpu_limit)),
            memory=(MEMORY_REQUEST_MIB, MEMORY_LIMIT_MIB),
            block_network=False,
            outbound_cidr_allowlist=[],
            outbound_domain_allowlist=[],
            include_oidc_identity_token=False,
            readiness_probe=readiness,
        )
        sandbox.wait_until_ready(timeout=min(options.timeout, 300))
        credentials = sandbox.create_connect_token(
            {"project_id": options.project}, port=HTTP_PORT
        )
        return Session(sandbox, options.project, credentials.url, credentials.token)
    except Exception:
        if sandbox is not None:
            try:
                sandbox.terminate()
            except Exception:
                pass
        raise


def write_client_config(session: Session, path: str | os.PathLike[str]) -> Path:
    """Write agent credentials with restrictive permissions and no console output."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    base_url = session.url.rstrip("/")
    payload = (
        json.dumps(
            {
                "url": session.url,
                "token": session.token,
                "mcpServers": {
                    "agartha-blender": {
                        "url": f"{base_url}/mcp",
                        "headers": {"Authorization": f"Bearer {session.token}"},
                    }
                },
            },
            indent=2,
        )
        + "\n"
    ).encode()
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(target, flags, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = -1
            stream.write(payload)
    finally:
        if descriptor != -1:
            os.close(descriptor)
    if target.is_symlink():
        raise ValueError("Refusing symlink client config")
    return target


def find_sandbox(project: str) -> Any:
    """Resolve the single named Sandbox for a project through the Modal SDK."""
    sdk = _require_modal()
    return sdk.Sandbox.from_name(APP_NAME, f"project-{project_id(project)}")


def stop_session(project: str) -> None:
    find_sandbox(project).terminate(wait=True)


def save_session(project: str) -> Any:
    """Ask the supervisor to checkpoint the editable project before shutdown."""
    process = find_sandbox(project).exec(
        "python", "-m", "cloud.blender_mcp.supervisor", "--save"
    )
    exit_code = process.wait()
    if exit_code != 0:
        raise RuntimeError(f"Blender checkpoint exited with status {exit_code}")
    return process


def resume_session(options: SessionOptions, **kwargs: Any) -> Session:
    """Start a fresh isolated Sandbox; the project Volume supplies its checkpoint."""
    return create_session(options, **kwargs)


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Operate an Agartha Blender MCP Sandbox")
    sub = parser.add_subparsers(dest="command", required=True)
    start = sub.add_parser("start")
    start.add_argument("project", nargs="?", help="Project UUID (generated when omitted)")
    start.add_argument("--config", type=Path, required=True)
    start.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    start.add_argument("--cpu-limit", type=int, choices=(2, 4), default=DEFAULT_CPU_LIMIT)
    for command in ("stop", "resume", "save"):
        command_parser = sub.add_parser(command)
        command_parser.add_argument("project")
        if command == "resume":
            command_parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "start":
        session = create_session(SessionOptions(args.project, args.timeout, cpu_limit=args.cpu_limit))
        write_client_config(session, args.config)
        print(f"project={session.project} config={args.config}")
        return 0
    if args.command == "stop":
        stop_session(args.project)
        return 0
    if args.command == "save":
        save_session(args.project)
        return 0
    if args.command == "resume":
        session = resume_session(SessionOptions(args.project))
        write_client_config(session, args.config)
        print(f"project={session.project} config={args.config}")
        return 0
    return 2


app = None if modal is None else modal.App(APP_NAME, image=build_image())

if __name__ == "__main__":
    raise SystemExit(_cli())
