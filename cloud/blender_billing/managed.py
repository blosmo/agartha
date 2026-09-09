"""Budget-fenced managed modeler. Credentials never enter the Blender sandbox."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import httpx
from .turnaround import render_turnaround, remaining_seconds, VIDEO_RESERVE_SECONDS

BASE_NAMES = {'model.glb', 'model.blend', 'preview.png'}
NAMES = BASE_NAMES | {'turnaround.mp4'}
FILE_LIMIT = 16 * 1024 * 1024
EXPORT_CODE = """
import bpy, os
os.makedirs('/workspace/artifacts', exist_ok=True)
model = bpy.data.collections.get('AGARTHA_MODEL')
assert model, 'Put the deliverable meshes in collection AGARTHA_MODEL.'
meshes = [o for o in model.all_objects if o.type == 'MESH']
assert meshes, 'The scene has no model meshes.'
assert sum(len(o.data.polygons) for o in meshes) <= 100000, 'Simplify the model before export.'
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(filepath='/workspace/artifacts/model.glb', export_format='GLB', use_selection=True, export_cameras=False, export_lights=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '/workspace/artifacts/preview.png'
assert scene.camera, 'Create a camera framing the model.'
bpy.ops.wm.save_as_mainfile(filepath='/workspace/artifacts/model.blend')
bpy.ops.render.render(write_still=True)
"""


class ManagedFiles:
    def __init__(self, root: Path, storage: Any, commit: Callable[[], None]):
        self.root, self.storage, self.commit = root, storage, commit

    def directory(self, job_id: str) -> Path:
        return self.root / hashlib.sha256(job_id.encode()).hexdigest()

    def save(self, job_id: str, files: dict[str, bytes]) -> None:
        if not BASE_NAMES.issubset(files) or set(files) - NAMES or any(len(value) > FILE_LIMIT for value in files.values()):
            raise ValueError('Invalid managed artifact set.')
        with self.storage.transaction():
            directory = self.directory(job_id)
            directory.mkdir(parents=True, exist_ok=True)
            revision = uuid.uuid4().hex
            target = directory / revision
            target.mkdir()
            for name, value in files.items():
                (target / name).write_bytes(value)
            temporary = directory / '.current'
            temporary.write_text(json.dumps({'revision': revision, 'created': time.time()}))
            os.replace(temporary, directory / 'current.json')
            self.commit()
            # Only the committed best checkpoint is served. Old checkpoints are removed.
            import shutil
            for child in directory.iterdir():
                if child.is_dir() and child.name != revision:
                    shutil.rmtree(child)
            self.commit()

    def read(self, job_id: str, name: str) -> bytes:
        if name not in NAMES:
            raise ValueError('Unknown artifact.')
        with self.storage.transaction():
            directory = self.directory(job_id)
            metadata = json.loads((directory / 'current.json').read_text())
            if time.time() - metadata['created'] > 7 * 86400 or not re.fullmatch('[a-f0-9]{32}', metadata['revision']):
                raise ValueError('Artifact retention has expired.')
            payload = (directory / metadata['revision'] / name).read_bytes()
            if len(payload) > FILE_LIMIT:
                raise ValueError('Artifact exceeds its limit.')
            return payload

    def add_video(self, job_id: str, payload: bytes) -> None:
        if len(payload) > FILE_LIMIT or len(payload) < 1000 or payload[4:8] != b'ftyp':
            raise ValueError('Invalid MP4 artifact.')
        with self.storage.transaction():
            files = {name: self.read(job_id, name) for name in BASE_NAMES}
            self.save(job_id, {**files, 'turnaround.mp4': payload})

    def cleanup(self) -> None:
        import shutil
        with self.storage.transaction():
            if not self.root.exists():
                return
            for directory in self.root.iterdir():
                if directory.is_dir() and time.time() - directory.stat().st_mtime > 7 * 86400:
                    shutil.rmtree(directory)
            self.commit()


def preview_image(payload: bytes) -> str:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 1_048_576
    with Image.open(io.BytesIO(payload)) as source:
        if source.width > 1024 or source.height > 1024:
            raise ValueError('Preview is too large.')
        source.thumbnail((512, 512))
        sink = io.BytesIO()
        source.convert('RGB').save(sink, format='JPEG', quality=75)
    return 'data:image/jpeg;base64,' + base64.b64encode(sink.getvalue()).decode()


def run_managed(broker: Any, files: ManagedFiles, token: str, job_id: str,
                monitor: Callable[[str], None], inference_url: str, broker_key: str) -> None:
    executor = uuid.uuid4().hex
    claim = broker.ledger.call('claimManagedJob', jobId=job_id, executorId=executor)
    if not claim.get('claimed'):
        return
    row = broker.ledger.call('getManagedJobForBroker', jobId=job_id)
    reservation = row['reservationId']
    status, progress, inspected, saved, running = 'failed', 'The job could not complete.', False, False, False
    image = None
    scene_matches_checkpoint = False
    video_saved = False
    history = 'Plan and create the first coherent version. Include camera and lighting.'
    try:
        for turn in range(6):
            row = broker.ledger.call('getManagedJobForBroker', jobId=job_id)
            if row.get('cancelled') or row.get('cancelRequested') or row['status'] == 'cancelled':
                status, progress = 'cancelled', 'Stopped at your request.'
                break
            if saved and running and remaining_seconds(broker.owned(token, reservation)) <= VIDEO_RESERVE_SECONDS:
                status, progress = 'partial', 'Stopped refining to reserve time for the turnaround video.'
                break
            done = threading.Event()
            def heartbeat():
                while not done.wait(20):
                    try:
                        if not broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor).get('active'):
                            return
                    except Exception:
                        return
            thread = threading.Thread(target=heartbeat, daemon=True)
            thread.start()
            try:
                request = {'jobId': job_id, 'executorId': executor, 'operationId': f'{executor}-{turn}', 'history': history[:7000]}
                if image:
                    request['image'] = image
                # No retries: the proxy has already fenced and reserved this operation.
                with httpx.Client(timeout=240, follow_redirects=False) as client:
                    response = client.post(inference_url, json=request, headers={'x-agartha-broker-key': broker_key})
                    response.raise_for_status()
                    if len(response.content) > 100_000:
                        raise ValueError('Inference response too large.')
                    step = response.json()
            finally:
                done.set()
                thread.join(timeout=1)
            inspected = inspected or bool(image)
            row = broker.ledger.call('getManagedJobForBroker', jobId=job_id)
            if row.get('cancelled') or row.get('cancelRequested') or row['status'] == 'cancelled':
                status, progress = 'cancelled', 'Stopped at your request.'
                break
            progress = 'Preparing the Blender edit.' if step['code'].strip() else str(step['summary'])[:1000]
            broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor, progress=progress)
            if step['done'] and not step['code'].strip():
                status = 'completed' if saved and inspected else 'partial' if saved else 'failed'
                break
            if not isinstance(step['code'], str) or len(step['code'].encode()) > 32_000:
                raise ValueError('Invalid model code.')
            if not running:
                broker.start(token, reservation)
                running = True
                monitor(reservation)
            scene_matches_checkpoint = False
            frame = broker.call(token, reservation, {'jsonrpc': '2.0', 'id': turn, 'method': 'tools/call', 'params': {'name': 'execute_blender_code', 'arguments': {'code': step['code'] + '\n' + EXPORT_CODE + f'\nprint("MANAGED_EXPORT_OK:{executor}:{turn}")'}}}, f'{executor}-edit-{turn}', 65_536)
            result = frame.get('result', {})
            history = f"Previous edit: {step['code'][-5000:]}\nResult: {json.dumps(result)[:1500]}\nProgress: {progress}"
            if 'error' in frame or result.get('isError') or f'MANAGED_EXPORT_OK:{executor}:{turn}' not in json.dumps(result):
                continue
            try:
                exported = {name: broker.download(token, reservation, name, FILE_LIMIT) for name in sorted(BASE_NAMES)}
                image = preview_image(exported['preview.png'])
                if not exported['model.glb'].startswith(b'glTF') or not exported['model.blend'].startswith(b'BLENDER'):
                    raise ValueError('Invalid exported model.')
                inspected = False
                files.save(job_id, exported)
                saved = True
                scene_matches_checkpoint = True
                broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor, progress='Model and preview saved. Astra is reviewing the result.')
            except Exception:
                history += '\nExports or preview could not be validated. Fix the scene and camera.'
        else:
            status, progress = ('partial' if saved else 'failed'), 'Iteration limit reached; delivered the latest validated files.'
    except Exception:
        status = 'partial' if saved else 'failed'
        progress = 'Stopped because the remaining budget, service availability, or execution limit did not permit another safe step.'
    finally:
        if saved and not scene_matches_checkpoint and status != 'cancelled':
            status = 'partial'
            progress += ' Retained the last valid model; video omitted because the latest edit did not save successfully.'
        if saved and scene_matches_checkpoint and status != 'cancelled':
            try:
                video = render_turnaround(broker, token, reservation, lambda text: broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor, progress=text))
                files.add_video(job_id, video)
                video_saved = True
                broker.ledger.call('recordManagedVideo', jobId=job_id, executorId=executor)
                progress = (progress + ' A 360-degree turnaround MP4 is included.')[:1000]
            except Exception:
                if not video_saved:
                    status = 'partial'
                    progress = (progress + ' The video could not finish within the available rendering time; model files are preserved.')[:1000]
        try:
            broker.stop(token, reservation)
        finally:
            broker.ledger.call('finishManagedJob', jobId=job_id, executorId=executor, status=status, progress=progress[:1000], visuallyInspected=inspected, artifactsReady=saved, videoReady=video_saved)


def recover_managed_files(broker: Any, files: ManagedFiles, job: dict[str, Any]) -> None:
    if not job.get('executorId'):
        return
    files.read(job['jobId'], 'preview.png')
    broker.ledger.call('recordManagedCheckpoint', jobId=job['jobId'], executorId=job['executorId'])
    try:
        video = files.read(job['jobId'], 'turnaround.mp4')
        if len(video) >= 1000 and video[4:8] == b'ftyp':
            broker.ledger.call('recordManagedVideo', jobId=job['jobId'], executorId=job['executorId'])
    except (FileNotFoundError, ValueError):
        pass
