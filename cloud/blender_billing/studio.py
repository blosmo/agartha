"""Reference-guided agent loop using the real Blender MCP worker."""
from __future__ import annotations
import base64
import hashlib
import io
import json
import threading
import time
from typing import Any, Callable

import httpx
from .managed import BASE_NAMES, FILE_LIMIT, EXPORT_CODE, ManagedFiles
from .review import VIEWS, render_view_code
from .turnaround import DELIVERY_RESERVE_SECONDS, remaining_seconds, render_turnaround

REFERENCE_MODEL = 'openai/gpt-image-2.5-flare'
MAX_ACTIONS = 24
# Detailed glTF exports can log one line per mesh/material; history remains truncated below.
TOOL_RESPONSE_BYTES = 1_000_000
EXPORT = EXPORT_CODE.replace("bpy.ops.object.select_all(action='DESELECT')", "depsgraph = bpy.context.evaluated_depsgraph_get()\nassert sum(len(o.evaluated_get(depsgraph).data.polygons) for o in meshes) <= 100000, 'Simplify evaluated geometry before export.'\nbpy.ops.object.select_all(action='DESELECT')", 1)
FINAL_EXPORT = EXPORT.replace('scene.cycles.samples = 32', 'scene.cycles.samples = 64').replace('scene.cycles.time_limit = 10.0', 'scene.cycles.time_limit = 25.0').replace('scene.cycles.adaptive_threshold = 0.05', 'scene.cycles.adaptive_threshold = 0.025').replace('scene.render.resolution_x = 512', 'scene.render.resolution_x = 1024').replace('scene.render.resolution_y = 512', 'scene.render.resolution_y = 1024')


def image_data(payload: bytes, *, crop: tuple[int, int, int, int] | None = None) -> str:
    from PIL import Image
    with Image.open(io.BytesIO(payload)) as source:
        if source.width > 1536 or source.height > 1536: raise ValueError('Image dimensions exceed the inspection bound.')
        image = source.crop(crop) if crop else source.copy()
        image.thumbnail((768, 768))
        sink = io.BytesIO()
        image.convert('RGB').save(sink, format='JPEG', quality=78)
    encoded = base64.b64encode(sink.getvalue()).decode()
    if len(encoded) > 340000: raise ValueError('Inspection image exceeds its byte bound.')
    return 'data:image/jpeg;base64,' + encoded


def reference_views(payload: bytes) -> list[dict[str, str]]:
    return [{'label': label, 'image': image_data(payload, crop=box)} for label, box in [
        ('reference-front', (0, 0, 768, 768)), ('reference-right', (768, 0, 1536, 768)),
        ('reference-rear', (0, 768, 768, 1536)), ('reference-hero', (768, 768, 1536, 1536)),
    ]]


def run_studio(broker: Any, files: ManagedFiles, token: str, job_id: str, executor: str,
               row: dict[str, Any], monitor: Callable[[str], None], inference_url: str, broker_key: str) -> None:
    reservation = row['reservationId']
    running = saved = scene_matches = accepted_current = video_saved = False
    reference_saved = False
    accepted_revision: int | None = None
    revision = 0
    reviewed_views: set[str] = set()
    rendered: list[dict[str, str]] = []
    references: list[dict[str, str]] = []
    events: list[dict[str, Any]] = []
    status, progress = 'failed', 'The reference-guided job could not complete.'
    history = 'Inspect the persistent scene, then build a strong blockout matching the reference. Work through Blender tools and use rendered evidence to guide each stage.'
    reference_cost = 0
    from .material_exchange import MaterialExchange
    exchange = None
    prepared_material = None
    material_preview = None
    published_materials = 0

    def shared_materials():
        nonlocal exchange
        if exchange is None: exchange = MaterialExchange(inference_url, broker.ledger.base, token)
        return exchange

    def current() -> dict[str, Any]:
        value = broker.ledger.call('getManagedJobForBroker', jobId=job_id)
        if value.get('cancelled') or value['status'] == 'cancelled': raise InterruptedError('Cancelled')
        if value['status'] != 'running': raise RuntimeError('Job is no longer active.')
        return value

    def heartbeat(message: str) -> None:
        value = broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor, progress=message[:1000])
        if not value.get('active'): raise InterruptedError('Job is no longer active.')

    def trace() -> None:
        if reference_saved:
            files.save_review(job_id, {'protocol': 2, 'jobId': job_id, 'referenceModel': REFERENCE_MODEL, 'referenceCostCents': reference_cost, 'model': 'openai/gpt-6-astra', 'acceptedRevision': accepted_revision, 'candidateRevision': revision, 'actions': events})

    def inference(operation: str, kind: str, **payload: Any) -> dict[str, Any]:
        current()
        done = threading.Event()
        def maintain():
            while not done.wait(20):
                try:
                    if not broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor).get('active'): return
                except Exception: return
        thread = threading.Thread(target=maintain, daemon=True)
        thread.start()
        try:
            request = {'protocol': 2, 'kind': kind, 'jobId': job_id, 'executorId': executor, 'operationId': operation, **payload}
            # Single dispatch, with the same durable budget fence as text inference.
            with httpx.Client(timeout=240, follow_redirects=False) as client:
                with client.stream('POST', inference_url, json=request, headers={'x-agartha-broker-key': broker_key}) as response:
                    response.raise_for_status()
                    chunks = bytearray()
                    limit = 4_000_000 if kind == 'reference' else 100_000
                    for chunk in response.iter_bytes():
                        chunks.extend(chunk)
                        if len(chunks) > limit: raise ValueError('Inference response exceeds its limit.')
                    result = json.loads(chunks)
            if kind != 'reference': current()
            return result
        finally:
            done.set(); thread.join(timeout=1)

    def mcp(name: str, arguments: dict[str, Any], operation: str, marker: str | None = None) -> dict[str, Any]:
        current()
        frame = broker.call(token, reservation, {'jsonrpc': '2.0', 'id': operation, 'method': 'tools/call', 'params': {'name': name, 'arguments': arguments}}, operation, TOOL_RESPONSE_BYTES)
        result = frame.get('result', {})
        if 'error' in frame or result.get('isError') or marker and marker not in json.dumps(result):
            raise ValueError(json.dumps(result)[:2000] or 'Blender tool failed.')
        return result

    def execute(code: str, operation: str) -> dict[str, Any]:
        marker = 'STUDIO_OK:' + operation
        return mcp('execute_blender_code', {'code': code + '\nprint(' + repr(marker) + ')'}, operation, marker)

    def exported() -> dict[str, bytes]:
        result = {name: broker.download(token, reservation, name, FILE_LIMIT) for name in sorted(BASE_NAMES)}
        if not result['model.glb'].startswith(b'glTF') or not result['model.blend'].startswith(b'BLENDER'): raise ValueError('Invalid exported model.')
        image_data(result['preview.png'])
        return result

    def inspect(names: list[str], object_name: str, operation: str) -> list[dict[str, str]]:
        if not names or len(names) > 3 or any(name not in VIEWS for name in names): raise ValueError('Invalid inspection request.')
        observations = []
        for view in names:
            heartbeat('Inspecting the model: ' + view + '.')
            execute(render_view_code(view, object_name), operation + '-' + view)
            payload = broker.download(token, reservation, 'review_' + view + '.png', 4_000_000)
            observations.append({'label': 'render-' + view, 'image': image_data(payload)})
        return observations

    try:
        heartbeat('Generating a four-view design reference with GPT Image 2.5 Flare.')
        reference = inference(executor + '-reference', 'reference')
        if reference.get('model') != REFERENCE_MODEL or not isinstance(reference.get('image'), str) or not reference['image'].startswith('data:image/jpeg;base64,'):
            raise ValueError('Invalid reference generation result.')
        payload = base64.b64decode(reference['image'].split(',', 1)[1], validate=True)
        files.save_reference(job_id, payload, REFERENCE_MODEL)
        reference_saved = True; reference_cost = reference.get('chargeCents', 0)
        references = reference_views(payload)
        trace()
        broker.ledger.call('recordManagedReference', jobId=job_id, executorId=executor)
        for turn in range(MAX_ACTIONS):
            current()
            if saved and running and remaining_seconds(broker.owned(token, reservation)) <= DELIVERY_RESERVE_SECONDS:
                status, progress = 'partial', 'Stopped refining to preserve delivery time.'
                break
            heartbeat('Reviewing references and deciding the next Blender action.')
            visible_model_views = [image for image in rendered if not material_preview or image['label'] != material_preview['label']]
            step = inference(f'{executor}-studio-{turn}', 'modeling', history=history.encode()[-15000:].decode(errors='ignore'), images=references + visible_model_views + ([material_preview] if material_preview else []))
            if material_preview and prepared_material: prepared_material['reviewed'] = True
            if scene_matches:
                reviewed_views.update(image['label'].removeprefix('render-') for image in visible_model_views)
            action = step.get('action')
            if action not in {'inspect_scene', 'inspect_object', 'edit', 'render_views', 'accept', 'restore', 'finish', 'search_materials', 'load_material', 'prepare_material', 'publish_material'}: raise ValueError('Unknown Blender action.')
            event = {'turn': turn, 'action': action, 'candidateRevision': revision, 'summary': str(step.get('summary', ''))[:1000], 'critique': str(step.get('critique', ''))[:2000], 'inspectedViews': sorted(reviewed_views), 'time': int(time.time())}
            events.append(event)
            operation = f'{executor}-tool-{turn}'
            try:
                if action == 'finish':
                    if not accepted_current or not scene_matches: raise ValueError('Accept the current visually inspected candidate before finishing.')
                    status, progress = 'completed', event['summary'] or 'Accepted model delivered.'
                    event['result'] = 'Finished with an accepted, inspected model.'
                    trace(); break
                if action == 'search_materials':
                    parameters = json.loads(step.get('code', '{}'))
                    result = shared_materials().search(parameters.get('q',''),parameters.get('cursor'))
                    compact = {'entries':[{'id':entry['id'],'name':entry['name'].encode()[:100].decode(errors='ignore'),'tileSize':entry['tileSize'],'description':entry['description'].encode()[:80].decode(errors='ignore')} for entry in result['entries']], 'cursor':result.get('cursor')}
                    event['result'] = json.dumps(compact,ensure_ascii=False)
                    trace()
                    history = f'Candidate revision {revision}. Accepted revision {accepted_revision}. Current scene matches candidate: {scene_matches}. Current candidate accepted: {accepted_current}.\n'+json.dumps(events[-3:],ensure_ascii=False)
                    continue
                if not running:
                    heartbeat('Starting the private Blender workspace.')
                    broker.start(token, reservation); running = True; monitor(reservation)
                heartbeat(event['summary'] or 'Operating Blender.')
                if action in {'inspect_scene', 'inspect_object'}:
                    name = 'get_scene_info' if action == 'inspect_scene' else 'get_object_info'
                    arguments = {'user_prompt': row['brief'][:1000]}
                    if action == 'inspect_object': arguments['object_name'] = step['objectName']
                    result = mcp(name, arguments, operation)
                    event['result'] = json.dumps(result)[:5000]
                elif action in {'edit','load_material'}:
                    if action == 'load_material':
                        parameters = json.loads(step['code'])
                        entry, payload = shared_materials().load(parameters['id'])
                        name = broker.upload_material(token,reservation,payload,operation+'-upload')
                        mapping = {key:parameters[key] for key in ['projection','center','direction'] if key in parameters}
                        mapping['tile_size'] = parameters.get('tileSize',entry['tileSize'])
                        code = "import bpy,sys,json,hashlib\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.material_authoring import import_material\n"
                        code += "target=bpy.data.objects.get("+repr(step['objectName'])+")\nassert target and target.type=='MESH' and target.name in bpy.data.collections['AGARTHA_MODEL'].all_objects, 'Choose a deliverable mesh.'\n"
                        code += "path='/workspace/artifacts/"+name+"'\nassert hashlib.sha256(open(path,'rb').read()).hexdigest()=="+repr(entry['modelId'].removeprefix('model-'))+"\n"
                        code += "surface=import_material(path,target,**json.loads("+repr(json.dumps(mapping))+"))\nsurface['agarthaSharedMaterialId']="+repr(entry['id'])
                    else:
                        code = step.get('code')
                    if not isinstance(code, str) or not code.strip() or len(code.encode()) > 32000: raise ValueError('Invalid edit code.')
                    scene_matches = accepted_current = False
                    prepared_material = material_preview = None
                    rendered = []; reviewed_views.clear()
                    event['codeSha256'] = hashlib.sha256(code.encode()).hexdigest()
                    result = execute(code + '\n' + EXPORT, operation)
                    candidate = exported(); files.save(job_id, candidate)
                    revision += 1; saved = scene_matches = True
                    broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                    # Every edit produces actual evidence; the next action can request more.
                    rendered = inspect(['hero', 'front', 'right'], '', operation + '-inspect')
                    event['result'] = 'Saved candidate and rendered hero, front, and right views. ' + json.dumps(result)[:1000]
                elif action == 'render_views':
                    if not scene_matches: raise ValueError('Repair and export the current scene before inspecting a candidate.')
                    rendered = inspect(step.get('views', []), step.get('objectName', ''), operation)
                    event['result'] = 'Rendered requested inspection views without changing the model or hero camera.'
                elif action == 'accept':
                    if not scene_matches or len(reviewed_views) < 2 or not event['critique'].strip(): raise ValueError('Acceptance requires the current candidate, two inspected views, and a concrete visual critique.')
                    execute("import shutil\nshutil.copyfile('/workspace/artifacts/model.blend', '/workspace/artifacts/accepted.blend')", operation)
                    files.accept(job_id); accepted_revision = revision; accepted_current = True
                    broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor)
                    event['result'] = 'Accepted the current visually inspected checkpoint.'
                elif action == 'prepare_material':
                    if not accepted_current or not scene_matches: raise ValueError('Accept and inspect the model before contributing a material.')
                    if published_materials >= 3: raise ValueError('At most three material contributions per job.')
                    prepared_material = material_preview = None
                    metadata = json.loads(step['code'])
                    resolution = metadata.pop('resolution',1024)
                    code = "import bpy,sys,shutil\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.material_authoring import export_material_bundle\n"
                    code += "target=bpy.data.objects.get("+repr(step['objectName'])+")\nassert target and target.type=='MESH' and target.name in bpy.data.collections['AGARTHA_MODEL'].all_objects and len(target.data.materials)==1, 'Choose a deliverable mesh with one material.'\n"
                    code += "paths=export_material_bundle(target.data.materials[0],'/workspace/artifacts/material-stage',name="+repr(metadata['name'])+",recipe="+repr(metadata['recipe'])+",tile_size="+repr(metadata['tileSize'])+",resolution="+repr(resolution)+")\n"
                    code += "for key,name in [('glb','shared_material.glb'),('source','shared_source.blend'),('preview','shared_preview.png')]: shutil.copyfile(paths[key],'/workspace/artifacts/'+name)"
                    execute(code,operation)
                    material_files = {key:broker.download(token,reservation,name,2_000_000 if key=='preview' else 16_000_000) for key,name in [('glb','shared_material.glb'),('source','shared_source.blend'),('preview','shared_preview.png')]}
                    prepared_material = {'files':material_files,'metadata':metadata,'reviewed':False,'publication':{}}
                    material_preview = {'label':'render-detail','image':image_data(material_files['preview'])}
                    event['result'] = 'Prepared a private material-only bundle. render-detail now shows the material sphere and repeating tile, not a model detail. Inspect seams, grain scale, roughness and normal strength before publish_material.'
                elif action == 'publish_material':
                    if not accepted_current or not prepared_material or not prepared_material['reviewed'] or not event['critique'].strip():
                        raise ValueError('Prepare a material, inspect its swatch in a later turn, and provide a visual critique before publishing.')
                    result = shared_materials().publish(prepared_material['files'],prepared_material['metadata'],event['critique'],prepared_material['publication'])
                    published_materials += 1
                    prepared_material = material_preview = None
                    event['result'] = 'Published reusable material: '+json.dumps({key:result[key] for key in ['id','name','files','author']})
                elif action == 'restore':
                    if accepted_revision is None: raise ValueError('There is no accepted checkpoint to restore.')
                    accepted_bytes = files.read_accepted(job_id, 'model.blend')
                    worker_bytes = broker.download(token, reservation, 'accepted.blend', FILE_LIMIT)
                    if hashlib.sha256(accepted_bytes).digest() != hashlib.sha256(worker_bytes).digest(): raise ValueError('The worker checkpoint changed after acceptance.')
                    scene_matches = accepted_current = False
                    prepared_material = material_preview = None
                    execute("import bpy\nbpy.ops.wm.open_mainfile(filepath='/workspace/artifacts/accepted.blend', load_ui=False)\n" + EXPORT, operation)
                    files.restore_accepted(job_id); revision = accepted_revision
                    scene_matches = accepted_current = True; reviewed_views.clear()
                    rendered = inspect(['hero', 'front', 'right'], '', operation + '-inspect')
                    broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor)
                    event['result'] = 'Restored the accepted scene and rendered it for comparison.'
            except ValueError as error:
                event['error'] = str(error)[:2500]
                if action in {'edit','load_material'}: rendered = []; reviewed_views.clear()
            trace()
            recent = [{key: value for key, value in item.items() if key != 'time'} for item in events[-6:]]
            history = f'Candidate revision {revision}. Accepted revision {accepted_revision}. Current scene matches candidate: {scene_matches}. Current candidate accepted: {accepted_current}.\n' + json.dumps(recent,ensure_ascii=False)
        else:
            status, progress = 'partial' if saved else 'failed', 'Action limit reached; preserved available files.'
    except InterruptedError:
        status, progress = 'cancelled', 'Stopped at your request or because the job is no longer active.'
    except Exception as error:
        events.append({'action': 'error', 'type': type(error).__name__, 'message': str(error)[:1500]})
        status, progress = 'partial' if saved else 'failed', 'Stopped because budget, availability, or execution limits prevented another safe step.'
    finally:
        if exchange is not None: exchange.close()
        delivered_inspected = accepted_current
        try:
            if saved and accepted_revision is not None and not accepted_current:
                files.restore_accepted(job_id)
                delivered_inspected = True
                scene_matches = False
                progress += ' Retained the last accepted model.'
            if saved and accepted_current and scene_matches and status != 'cancelled':
                try:
                    heartbeat('Rendering the accepted model for delivery.')
                    execute(FINAL_EXPORT, executor + '-final-render')
                    files.save(job_id, exported()); files.accept(job_id)
                    broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                    broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor)
                except Exception:
                    progress += ' Retained the accepted checkpoint at its existing render resolution.'
                try:
                    video = render_turnaround(broker, token, reservation, heartbeat)
                    files.add_video(job_id, video); video_saved = True
                    broker.ledger.call('recordManagedVideo', jobId=job_id, executorId=executor)
                except Exception:
                    progress += ' Turnaround video was unavailable within the remaining time.'
        except Exception:
            status = 'partial' if saved else 'failed'
            progress += ' Delivery cleanup retained the available files.'
        try:
            events.append({'action': 'delivery', 'status': status, 'acceptedRevision': accepted_revision, 'video': video_saved, 'summary': progress[:1000]})
            trace()
        finally:
            try: broker.stop(token, reservation)
            finally:
                broker.ledger.call('finishManagedJob', jobId=job_id, executorId=executor, status=status, progress=progress[:1000], visuallyInspected=delivered_inspected, artifactsReady=saved, videoReady=video_saved)
