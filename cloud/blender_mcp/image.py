"""Reproducible Modal image for the upstream Blender MCP runtime.

The image is deliberately separate from Agartha's existing renderer image.  All
network access happens while the image is built; the resulting Sandbox has no
outbound network access.
"""

from __future__ import annotations

from pathlib import Path

from .config import BLENDER_VERSION, UPSTREAM_COMMIT

BLENDER_ARCHIVE = f"blender-{BLENDER_VERSION}-linux-x64.tar.xz"
BLENDER_URL = f"https://download.blender.org/release/Blender4.5/{BLENDER_ARCHIVE}"
BLENDER_CHECKSUMS_URL = f"https://download.blender.org/release/Blender4.5/blender-{BLENDER_VERSION}.sha256"
UPSTREAM_REPOSITORY = "https://github.com/ahujasid/blender-mcp.git"
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def build_image():
    """Return the pinned, CPU-only Blender MCP image.

    This function imports Modal lazily so config and unit tests remain usable on
    machines that only have the Modal CLI's isolated Python environment.
    """
    import modal

    install = (
        "set -eux; "
        f"curl -fsSL {BLENDER_URL} -o /tmp/{BLENDER_ARCHIVE}; "
        f"curl -fsSL {BLENDER_CHECKSUMS_URL} -o /tmp/SHA256SUMS; "
        f"grep -E '  {BLENDER_ARCHIVE}$' /tmp/SHA256SUMS | sed 's#  {BLENDER_ARCHIVE}$#  /tmp/{BLENDER_ARCHIVE}#' | sha256sum -c -; "
        f"tar -xJf /tmp/{BLENDER_ARCHIVE} -C /opt; "
        f"ln -s /opt/blender-{BLENDER_VERSION}-linux-x64/blender /usr/local/bin/blender; "
        "rm /tmp/" + BLENDER_ARCHIVE + "; "
        "git clone --filter=blob:none https://github.com/ahujasid/blender-mcp.git /opt/blender-mcp; "
        f"cd /opt/blender-mcp && git checkout {UPSTREAM_COMMIT}; "
        "python -m pip install --no-cache-dir .; "
        "python -m pip install --no-cache-dir 'mcp==1.26.0'; "
        f"python -m pip install --no-cache-dir --target /opt/blender-{BLENDER_VERSION}-linux-x64/4.5/python/lib/python3.11/site-packages requests==2.32.4; "
        "addon=$(find /opt/blender-mcp -name addon.py -type f -print -quit); "
        "test -n \"$addon\"; "
        "if [ \"$addon\" != /opt/blender-mcp/addon.py ]; then install -m 0644 \"$addon\" /opt/blender-mcp/addon.py; fi"
    )
    return (
        modal.Image.debian_slim(python_version="3.12")
        .apt_install(
            "bzip2",
            "ca-certificates",
            "curl",
            "git",
            "libgl1",
            "libglib2.0-0",
            "libxi6",
            "libxfixes3",
            "libxkbcommon0",
            "libxrender1",
            "mesa-utils",
            "xvfb",
        )
        .run_commands(install)
        .add_local_dir(
            REPOSITORY_ROOT / "cloud" / "blender_mcp",
            "/opt/agartha-blender/cloud/blender_mcp",
            copy=True,
            ignore=lambda path: path.name.startswith("test_")
            or path.name == "verify.py"
            or "__pycache__" in path.parts,
        )
        .env(
            {
                "BLENDER_BIN": "/usr/local/bin/blender",
                "BLENDER_MCP_ADDON": "/opt/blender-mcp/addon.py",
                "PYTHONPATH": "/opt/agartha-blender",
                "PYTHONUNBUFFERED": "1",
            }
        )
    )


image = build_image
