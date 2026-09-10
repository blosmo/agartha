"""Persistent, loopback-only Blender MCP studio for local authoring."""
from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

from .bootstrap import build_bootstrap_script
from .config import ADDON_PORT, HTTP_PORT, UPSTREAM_COMMIT

DEFAULT_BLENDER = "blender"


def _stop(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=8)


def provision_upstream(root: Path) -> Path:
    """Provision and verify the exact upstream revision; never silently reuse another version."""
    root = root.expanduser().resolve()
    if not root.exists():
        root.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(["git","clone","--filter=blob:none","https://github.com/ahujasid/blender-mcp.git",str(root)],check=True)
        subprocess.run(["git","-C",str(root),"checkout",UPSTREAM_COMMIT],check=True)
    revision=subprocess.run(["git","-C",str(root),"rev-parse","HEAD"],check=True,capture_output=True,text=True).stdout.strip()
    if revision!=UPSTREAM_COMMIT: raise ValueError("Local upstream checkout is not the pinned cloud revision.")
    for source in [root,root/'src']:
        if (source/'blender_mcp'/'server.py').is_file():return source
    raise FileNotFoundError(f"Pinned upstream server.py not found below {root}")


def run(*, workspace: Path, blender: str, addon: str | None = None, host: str = "127.0.0.1",
        port: int = HTTP_PORT, token: str | None = None, config: Path | None = None,
        pythonpath: str | None = None, material_root: Path | None = None) -> int:
    """Start Blender and the authenticated local HTTP bridge until interrupted."""
    if host not in {"127.0.0.1","localhost","::1"} or not 1<=port<=65535:
        raise ValueError("Use a loopback host and a valid local port.")
    workspace = workspace.expanduser().resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    upstream_repository=workspace/'upstream-blender-mcp'
    upstream_root=provision_upstream(upstream_repository)
    addon_path = Path(addon).expanduser().resolve() if addon else upstream_repository/'addon.py'
    installed_addon = workspace / "agartha_blender_addon.py"
    if addon_path != installed_addon:
        source = addon_path.read_text(encoding="utf-8")
        marker = "        if bpy.app.background:\n"
        if marker not in source:
            if addon_path.name != "agartha_blender_addon.py":
                raise ValueError("Pinned Blender add-on start guard was not found")
        else:
            source = source.replace(marker, "        if False and bpy.app.background:\n", 1)
        installed_addon.write_text(source, encoding="utf-8")
    installed_addon.chmod(0o600)
    ready = workspace / ".blender-mcp-ready"
    ready.unlink(missing_ok=True)
    secret = token or secrets.token_urlsafe(32)
    env = os.environ.copy()
    env.update({
        "BLENDER_MCP_ADDON": str(installed_addon),
        "BLENDER_MCP_ADDON_MODULE": installed_addon.stem,
        "BLENDER_MCP_PORT": str(ADDON_PORT),
        "BLENDER_MCP_PROJECT_FILE": str(workspace / "project.blend"),
        "BLENDER_MCP_READY_FILE": str(ready),
        "BLENDER_MCP_WORKSPACE": str(workspace),
        "MCP_CONNECT_TOKEN": secret,
        "DISABLE_TELEMETRY": "true",
        "BLENDER_MCP_BATCH_MODE": "1",
    })
    env["PYTHONPATH"] = os.pathsep.join(filter(None, [str(upstream_root), env.get("PYTHONPATH", "")]))
    if pythonpath:
        env["PYTHONPATH"] = os.pathsep.join(filter(None, [pythonpath, env["PYTHONPATH"]]))
    if material_root:
        env["AGARTHA_MATERIAL_ROOT"] = str(material_root.expanduser().resolve())
    bootstrap = build_bootstrap_script(workspace / "project.blend", ready)
    blender_process: subprocess.Popen[bytes] | None = None
    service_process: subprocess.Popen[bytes] | None = None
    try:
        blender_process = subprocess.Popen(
            [blender, "--background", "--factory-startup", "--disable-autoexec", "--threads", "6", "--python-expr", bootstrap], env=env,
        )
        deadline = time.monotonic() + 120
        while not ready.exists():
            if blender_process.poll() is not None or time.monotonic() >= deadline:
                return 1
            time.sleep(0.25)
        service_process = subprocess.Popen([
            sys.executable, "-m", "cloud.blender_mcp.service_main",
            "--workspace", str(workspace), "--host", host, "--port", str(port),
            "--require-token", "--strict-transport",
        ], env=env)
        config_path = config or workspace / "mcp-client.json"
        hostname = f"[{host}]" if ':' in host else host
        url = f"http://{hostname}:{port}"
        config_path.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(config_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as output:
            os.fchmod(output.fileno(),0o600)
            json.dump({"url":url,"token":secret,"mcpServers":{"agartha-blender":{"url":url+"/mcp","headers":{"Authorization":"Bearer "+secret}}}},output,indent=2)
        print(f"MCP config: {config_path}")
        print(f"Workspace: {workspace}")
        while service_process.poll() is None and blender_process.poll() is None:
            time.sleep(0.5)
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        _stop(service_process)
        _stop(blender_process)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local Agartha Blender MCP studio")
    parser.add_argument("--workspace", type=Path, default=Path.cwd() / ".agartha" / "local-studio")
    parser.add_argument("--blender", default=os.environ.get("BLENDER_BIN", DEFAULT_BLENDER))
    parser.add_argument("--addon", default=os.environ.get("BLENDER_MCP_ADDON"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=HTTP_PORT)
    parser.add_argument("--token", help="Explicit token; otherwise one is generated")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--pythonpath", default=os.environ.get("AGARTHA_BLENDER_PYTHONPATH"))
    parser.add_argument("--material-root", type=Path, default=os.environ.get("AGARTHA_MATERIAL_ROOT"))
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("local studio host must be loopback")
    args.blender=shutil.which(args.blender) or args.blender
    if not Path(args.blender).is_file():
        parser.error(f"Blender binary not found: {args.blender}")
    if args.addon and not Path(args.addon).is_file():
        parser.error(f"Blender MCP add-on not found: {args.addon}")
    return run(workspace=args.workspace, blender=args.blender, addon=args.addon,
               host=args.host, port=args.port, token=args.token, config=args.config,
               pythonpath=args.pythonpath, material_root=args.material_root)


if __name__ == "__main__":
    raise SystemExit(main())
