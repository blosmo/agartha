from pathlib import Path
import modal

ROOT = Path(__file__).resolve().parents[1]
image = (
    modal.Image.from_registry("node:22-bookworm-slim", add_python="3.12")
    .apt_install("libvulkan1", "libdrm2", "libx11-6", "libxext6", "libxcb1")
    .pip_install("fastapi[standard]")
    .workdir("/app")
    .run_commands("npm init -y", "npm install vgpu@0.4.0 tsx@4.21.0 pngjs@7.0.0 three@0.185.1 jpeg-js@0.4.4", "npx vgpu install-software-renderer")
    .run_commands("npm pkg set type=module")
    .env({"VGPU_ADAPTER": "software", "XDG_RUNTIME_DIR": "/tmp"})
)

if modal.is_local():
    image = image.add_local_dir(ROOT / "packages" / "renderer", "/app/packages/renderer").add_local_dir(ROOT / "packages" / "protocol" / "src", "/app/packages/protocol/src").add_local_dir(ROOT / "apps" / "web" / "public" / "materials", "/app/apps/web/public/materials").add_local_python_source("cloud")
