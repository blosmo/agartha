"""Operator-built paid image; customer requests can only reference its ID."""
from __future__ import annotations

from pathlib import Path

from cloud.blender_mcp.image import build_image as build_upstream_image

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def build_image():
    """Extend the pinned upstream image with the paid private bridge."""
    return build_upstream_image().add_local_dir(
        REPOSITORY_ROOT / "cloud" / "blender_billing",
        "/opt/agartha-blender/cloud/blender_billing",
        copy=True,
        ignore=lambda path: path.name.startswith("test_") or "__pycache__" in path.parts,
    )


image = build_image


if __name__ == "__main__":
    import modal
    operator_app = modal.App.lookup("agartha-paid-blender", create_if_missing=True)
    paid_image = build_image()
    with modal.enable_output():
        paid_image.build(operator_app)
    print(paid_image.object_id)
