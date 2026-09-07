"""Authenticated, bounded vgpu renderer. Authoritative state stays in Convex."""
from pathlib import Path
import modal

from cloud.image import image

app = modal.App("agartha-world-renderer")

@app.function(image=image, secrets=[modal.Secret.from_name("agartha-cloud-render")], cpu=2, memory=2048, timeout=90, max_containers=4, scaledown_window=120)
@modal.asgi_app()
def service():
    import asyncio
    import hashlib
    import hmac
    import json
    import os
    import tempfile
    from collections import OrderedDict
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse, Response

    web = FastAPI(docs_url=None, redoc_url=None)
    cache = OrderedDict()
    lock = asyncio.Lock()

    @web.post("/render")
    async def render(request: Request):
        expected = os.environ.get("AGARTHA_RENDER_KEY", "")
        provided = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not expected or not hmac.compare_digest(expected.encode(), provided.encode()):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 64_000_000:
                return JSONResponse({"error": "Snapshot too large"}, status_code=413)
        try:
            payload = json.loads(raw)
            if not isinstance(payload.get("objects"), list) or len(payload["objects"]) > 10000:
                raise ValueError("Invalid objects")
        except (ValueError, TypeError, AttributeError):
            return JSONResponse({"error": "Invalid snapshot"}, status_code=400)
        key = hashlib.sha256(raw).hexdigest()
        if key in cache:
            return Response(cache[key], media_type="image/png", headers={"X-Agartha-Renderer": "vgpu", "X-Agartha-Cache": "hit"})
        # A container handles one GPU workload at a time; shared snapshots coalesce through this lock.
        async with lock:
            if key in cache:
                return Response(cache[key], media_type="image/png", headers={"X-Agartha-Renderer": "vgpu", "X-Agartha-Cache": "hit"})
            with tempfile.TemporaryDirectory(prefix="agartha-") as directory:
                source, target = Path(directory) / "scene.json", Path(directory) / "preview.png"
                source.write_bytes(raw)
                process = await asyncio.create_subprocess_exec("node", "--import", "tsx", "/app/packages/renderer/render.ts", str(source), str(target), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                try:
                    _, stderr = await asyncio.wait_for(process.communicate(), timeout=60)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
                    return JSONResponse({"error": "Render timed out"}, status_code=504)
                if process.returncode or not target.exists():
                    print("vgpu render failure:", stderr.decode(errors="replace")[-3000:])
                    return JSONResponse({"error": "Render failed"}, status_code=503)
                png = target.read_bytes()
                cache[key] = png
                while len(cache) > 32:
                    cache.popitem(last=False)
                return Response(png, media_type="image/png", headers={"X-Agartha-Renderer": "vgpu", "X-Agartha-Cache": "miss"})
    return web
