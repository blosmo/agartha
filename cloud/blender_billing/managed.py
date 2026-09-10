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
from .turnaround import render_turnaround, remaining_seconds, DELIVERY_RESERVE_SECONDS

BASE_NAMES = {'model.glb', 'model.blend', 'preview.png'}
NAMES = BASE_NAMES | {'turnaround.mp4', 'reference.jpg', 'review.json'}
FILE_LIMIT = 16 * 1024 * 1024
EXPORT_CODE = """
import bpy, os
os.makedirs('/workspace/artifacts', exist_ok=True)
model = bpy.data.collections.get('AGARTHA_MODEL')
assert model, 'Put the deliverable meshes in collection AGARTHA_MODEL.'
meshes = [o for o in model.all_objects if o.type == 'MESH']
assert meshes, 'The scene has no model meshes.'
depsgraph = bpy.context.evaluated_depsgraph_get()
triangles = 0
for obj in meshes:
    evaluated = obj.evaluated_get(depsgraph).to_mesh()
    try:
        evaluated.calc_loop_triangles()
        triangles += len(evaluated.loop_triangles)
    finally:
        obj.evaluated_get(depsgraph).to_mesh_clear()
assert triangles <= 100000, 'Simplify the evaluated model before export.'
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(filepath='/workspace/artifacts/model.glb', export_format='GLB', use_selection=True, export_apply=True, export_cameras=False, export_lights=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.time_limit = 10.0
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.05
scene.cycles.adaptive_min_samples = 8
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
scene.cycles.denoising_prefilter = 'ACCURATE'
scene.view_settings.view_transform = 'AgX'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
if hasattr(scene.render.image_settings, 'media_type'): scene.render.image_settings.media_type = 'IMAGE'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '/workspace/artifacts/preview.png'
assert scene.camera, 'Create a camera framing the model.'
# Blender 5.2 defaults to Zstd compression; the managed artifact contract uses
# an uncompressed BLENDER header, including during checkpoint validation.
bpy.ops.wm.save_as_mainfile(filepath='/workspace/artifacts/model.blend', compress=False)
bpy.ops.render.render(write_still=True)
"""


def quality_approved(review: Any, digest: str, revision: int | None = None) -> bool:
    """Validate the broker's durable verdict, never a modeler acceptance claim."""
    if not isinstance(review, dict) or review.get('glbSha256') != digest or not re.fullmatch('[a-f0-9]{64}', digest): return False
    if type(review.get('candidateRevision')) is not int or review['candidateRevision'] < 1: return False
    if revision is not None and review['candidateRevision'] != revision: return False
    keys = {'silhouette', 'proportions', 'construction', 'materials', 'presentation'}
    criteria = review.get('criteria')
    if not isinstance(criteria, dict) or set(criteria) != keys: return False
    for value in criteria.values():
        if not isinstance(value, dict) or set(value) != {'pass', 'evidence'} or value['pass'] is not True: return False
        if not isinstance(value['evidence'], str) or len(value['evidence'].strip()) < 30 or len(value['evidence'].encode()) > 800: return False
    defects = review.get('defects')
    if not isinstance(defects, list) or len(defects) > 12: return False
    for defect in defects:
        if not isinstance(defect, dict) or set(defect) != {'severity', 'criterion', 'description'}: return False
        if defect['severity'] != 'minor' or defect['criterion'] not in keys: return False
        if not isinstance(defect['description'], str) or len(defect['description'].strip()) < 30 or len(defect['description'].encode()) > 800: return False
    return review.get('accepted') is True


class ManagedFiles:
    def __init__(self, root: Path, storage: Any, commit: Callable[[], None]):
        self.root, self.storage, self.commit = root, storage, commit

    def directory(self, job_id: str) -> Path:
        return self.root / hashlib.sha256(job_id.encode()).hexdigest()

    def save(self, job_id: str, files: dict[str, bytes]) -> None:
        if not BASE_NAMES.issubset(files) or set(files) - (BASE_NAMES | {'turnaround.mp4'}) or any(len(value) > FILE_LIMIT for value in files.values()):
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
            # Retain the last accepted revision while a new candidate is reviewed.
            import shutil
            accepted_file = directory / 'accepted.json'
            accepted = json.loads(accepted_file.read_text())['revision'] if accepted_file.exists() else None
            for child in directory.iterdir():
                if child.is_dir() and child.name not in {revision, accepted}:
                    shutil.rmtree(child)
            self.commit()

    def read(self, job_id: str, name: str, authorize: Callable[[int], Any] | None = None) -> bytes:
        if name not in NAMES:
            raise ValueError('Unknown artifact.')
        with self.storage.transaction():
            directory = self.directory(job_id)
            if name in {'reference.jpg', 'review.json'}:
                meta = directory / ('review-meta.json' if name == 'review.json' else 'reference-meta.json')
                if name == 'review.json' and not meta.exists(): meta = directory / 'reference-meta.json'
                metadata = json.loads(meta.read_text())
                path = directory / name
            else:
                metadata = json.loads((directory / 'current.json').read_text())
                if not re.fullmatch('[a-f0-9]{32}', metadata['revision']):
                    raise ValueError('Invalid artifact revision.')
                path = directory / metadata['revision'] / name
            if time.time() - metadata['created'] > 7 * 86400:
                raise ValueError('Artifact retention has expired.')
            # Keep the validated descriptor and storage transaction through authorization
            # and bounded read so replacement/growth cannot return unreserved bytes.
            with path.open('rb') as artifact:
                size = os.fstat(artifact.fileno()).st_size
                if size > (1_000_000 if name == 'review.json' else FILE_LIMIT):
                    raise ValueError('Artifact exceeds its limit.')
                if authorize is not None:
                    authorization = authorize(size)
                    if authorization.get('bytes') != size:
                        raise ValueError('Artifact download authorization mismatch.')
                payload = artifact.read(size + 1)
                if len(payload) != size:
                    raise ValueError('Artifact changed during download.')
                return payload

    def save_reference(self, job_id: str, payload: bytes, model: str) -> None:
        from PIL import Image
        if len(payload) > 3_000_000: raise ValueError('Reference exceeds its limit.')
        with Image.open(io.BytesIO(payload)) as image:
            if image.format != 'JPEG' or image.size != (1536, 1536): raise ValueError('Invalid reference image.')
            image.verify()
        with self.storage.transaction():
            directory = self.directory(job_id)
            directory.mkdir(parents=True, exist_ok=True)
            if (directory / 'reference-meta.json').exists(): raise ValueError('A reference already exists.')
            for name, content in (
                ('reference.jpg', payload),
                ('review.json', json.dumps({'referenceModel': model, 'actions': []}).encode()),
                ('reference-meta.json', json.dumps({'created': time.time(), 'model': model, 'sha256': hashlib.sha256(payload).hexdigest()}).encode()),
            ):
                temporary = directory / ('.' + name)
                temporary.write_bytes(content)
                os.replace(temporary, directory / name)
            self.commit()

    def save_review(self, job_id: str, review: dict[str, Any]) -> None:
        payload = json.dumps(review, ensure_ascii=False).encode()
        if len(payload) > 1_000_000: raise ValueError('Review trace exceeds its limit.')
        with self.storage.transaction():
            directory = self.directory(job_id)
            directory.mkdir(parents=True, exist_ok=True)
            metadata = directory / 'review-meta.json'
            if not metadata.exists():
                legacy = directory / 'reference-meta.json'
                created = json.loads(legacy.read_text())['created'] if legacy.exists() else time.time()
                temporary_meta = directory / '.review-meta.json'
                temporary_meta.write_text(json.dumps({'created': created}))
                os.replace(temporary_meta, metadata)
            temporary = directory / '.review.json'
            temporary.write_bytes(payload)
            os.replace(temporary, directory / 'review.json')
            self.commit()

    def accept(self, job_id: str, quality_review: dict[str, Any] | None = None) -> None:
        with self.storage.transaction():
            directory = self.directory(job_id)
            current = json.loads((directory / 'current.json').read_text())
            digest = hashlib.sha256((directory / current['revision'] / 'model.glb').read_bytes()).hexdigest()
            if quality_review is None and (directory / 'accepted.json').exists():
                quality_review = json.loads((directory / 'accepted.json').read_text()).get('qualityReview')
                if quality_review and quality_review.get('glbSha256') != digest: quality_review = None
            if quality_review is not None:
                if not quality_approved(quality_review, digest): raise ValueError('Acceptance requires a bound passing quality review.')
                current['qualityReview'] = quality_review
            temporary = directory / '.accepted.json'
            temporary.write_text(json.dumps(current))
            os.replace(temporary, directory / 'accepted.json')
            self.commit()

    def read_accepted(self, job_id: str, name: str) -> bytes:
        if name not in BASE_NAMES: raise ValueError('Unknown accepted artifact.')
        with self.storage.transaction():
            directory = self.directory(job_id)
            metadata = json.loads((directory / 'accepted.json').read_text())
            if time.time() - metadata['created'] > 7 * 86400 or not re.fullmatch('[a-f0-9]{32}', metadata['revision']):
                raise ValueError('Accepted artifact expired.')
            with (directory / metadata['revision'] / name).open('rb') as artifact:
                size = os.fstat(artifact.fileno()).st_size
                if size > FILE_LIMIT: raise ValueError('Accepted artifact exceeds its limit.')
                payload = artifact.read(size + 1)
                if len(payload) != size: raise ValueError('Accepted artifact changed during read.')
                return payload

    def accepted_quality(self, job_id: str) -> dict[str, Any]:
        with self.storage.transaction():
            directory = self.directory(job_id)
            review = json.loads((directory / 'accepted.json').read_text()).get('qualityReview')
            digest = hashlib.sha256(self.read_accepted(job_id, 'model.glb')).hexdigest()
            if not quality_approved(review, digest): raise ValueError('No trusted accepted quality marker.')
            return review

    def restore_accepted(self, job_id: str) -> None:
        with self.storage.transaction():
            directory = self.directory(job_id)
            accepted = (directory / 'accepted.json').read_bytes()
            temporary = directory / '.current'
            temporary.write_bytes(accepted)
            os.replace(temporary, directory / 'current.json')
            self.commit()

    def add_video(self, job_id: str, payload: bytes) -> None:
        if len(payload) > FILE_LIMIT or len(payload) < 1000 or payload[4:8] != b'ftyp':
            raise ValueError('Invalid MP4 artifact.')
        with self.storage.transaction():
            files = {name: self.read(job_id, name) for name in BASE_NAMES}
            self.save(job_id, {**files, 'turnaround.mp4': payload})
            if (self.directory(job_id) / 'accepted.json').exists(): self.accept(job_id)

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
    if row.get('workflowVersion') == 3 or row.get('referenceMode') == 'generate':
        from .studio import run_studio
        run_studio(broker, files, token, job_id, executor, row, monitor, inference_url, broker_key)
        return
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
            if saved and running and remaining_seconds(broker.owned(token, reservation)) <= DELIVERY_RESERVE_SECONDS:
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
                next_image = preview_image(exported['preview.png'])
                if not exported['model.glb'].startswith(b'glTF') or not exported['model.blend'].startswith(b'BLENDER'):
                    raise ValueError('Invalid exported model.')
                files.save(job_id, exported)
                image = next_image
                inspected = False
                saved = True
                scene_matches_checkpoint = True
                broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor, progress='Model and preview saved. Astra is reviewing the result.')
            except Exception:
                history += '\nExports or preview could not be validated. Fix the scene and camera.'
        else:
            status = 'partial' if saved else 'failed'
            progress = 'Iteration limit reached; delivered the latest validated files.' if saved else 'Iteration limit reached without a validated model.'
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
            broker.ledger.call('finishManagedJob', jobId=job_id, executorId=executor, status=status, progress=progress[:1000], visuallyInspected=saved and inspected, artifactsReady=saved, videoReady=video_saved)


def recover_managed_files(broker: Any, files: ManagedFiles, job: dict[str, Any]) -> None:
    if not job.get('executorId'):
        return
    accepted = False
    quality = job.get('workflowVersion') == 3
    if quality or job.get('referenceMode') == 'generate':
        try:
            files.read(job['jobId'], 'reference.jpg')
            files.read(job['jobId'], 'review.json')
            broker.ledger.call('recordManagedReference', jobId=job['jobId'], executorId=job['executorId'])
        except (FileNotFoundError, ValueError): pass
        try:
            if quality: files.accepted_quality(job['jobId'])
            files.read_accepted(job['jobId'], 'model.blend')
            files.restore_accepted(job['jobId'])
            accepted = True
        except (FileNotFoundError, ValueError): pass
        try: files.read(job['jobId'], 'preview.png')
        except (FileNotFoundError, ValueError): return
    else:
        files.read(job['jobId'], 'preview.png')
    broker.ledger.call('recordManagedCheckpoint', jobId=job['jobId'], executorId=job['executorId'])
    if accepted: broker.ledger.call('recordManagedAcceptance', jobId=job['jobId'], executorId=job['executorId'], **({'qualityApproved': True} if quality else {}))
    try:
        video = files.read(job['jobId'], 'turnaround.mp4')
        if len(video) >= 1000 and video[4:8] == b'ftyp':
            broker.ledger.call('recordManagedVideo', jobId=job['jobId'], executorId=job['executorId'])
    except (FileNotFoundError, ValueError):
        pass
