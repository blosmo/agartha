import modal
from cloud.image import image
app=modal.App("agartha-render-validation")

@app.function(image=image, cpu=2, memory=2048, timeout=120)
def validate_renderer():
    """Private build-time check: no web endpoint and no application secrets."""
    import json
    import subprocess
    import tempfile
    from pathlib import Path
    doctor = subprocess.run(["npx", "vgpu", "doctor"], cwd="/app", capture_output=True, text=True, timeout=60)
    if doctor.returncode:
        return {"ok": False, "doctor": doctor.stdout[-4000:], "error": doctor.stderr[-2000:]}
    with tempfile.TemporaryDirectory() as directory:
        source, target = Path(directory) / "scene.json", Path(directory) / "preview.png"
        source.write_text(json.dumps({"objects": [{"id": "cube", "name": "Cloud cube", "shape": "box", "position": [0, 0, 0], "scale": [2, 2, 2], "color": "#88aa77"}]}))
        result = subprocess.run(["node", "--import", "tsx", "/app/packages/renderer/render.ts", str(source), str(target)], cwd="/app", capture_output=True, text=True, timeout=60)
        return {"ok": result.returncode == 0 and target.exists(), "doctor": doctor.stdout[-4000:], "png_bytes": target.stat().st_size if target.exists() else 0, "error": result.stderr[-2000:] if result.returncode else None}

@app.local_entrypoint()
def check():
    import json
    print(json.dumps(validate_renderer.remote()))
