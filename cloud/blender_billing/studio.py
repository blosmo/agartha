"""Reference-guided agent loop using the real Blender MCP worker."""
from __future__ import annotations
import base64
import hashlib
import io
import json
import math
import threading
import time
from typing import Any, Callable

import httpx
from .managed import BASE_NAMES, FILE_LIMIT, EXPORT_CODE, ManagedFiles, quality_review_valid
from .modeling_images import modeler_images
from .resource_inspection import resource_inspection_code
from .review import VIEWS, render_view_code
from .export_review import render_export_view_code
from .turnaround import DELIVERY_RESERVE_SECONDS, remaining_seconds, render_turnaround
from .meshy_exchange import MeshyExchange

REFERENCE_MODEL = 'openai/gpt-image-2.5-flare'
MAX_ACTIONS = 24
MAX_REVIEWS = 4
INFERENCE_TIMEOUT_SECONDS = 240
# Detailed glTF exports can log one line per mesh/material; history remains truncated below.
TOOL_RESPONSE_BYTES = 1_000_000
EXPORT = EXPORT_CODE
FINAL_EXPORT = EXPORT.replace('scene.cycles.samples = 32', 'scene.cycles.samples = 64').replace('scene.cycles.time_limit = 10.0', 'scene.cycles.time_limit = 25.0').replace('scene.cycles.adaptive_threshold = 0.05', 'scene.cycles.adaptive_threshold = 0.025').replace('scene.render.resolution_x = 512', 'scene.render.resolution_x = 1024').replace('scene.render.resolution_y = 512', 'scene.render.resolution_y = 1024')

# Render-only delivery cannot export or replace independently reviewed geometry.
FINAL_RENDER = 'import bpy\n' + FINAL_EXPORT[FINAL_EXPORT.index('scene = bpy.context.scene'):].replace("bpy.ops.wm.save_as_mainfile(filepath='/workspace/artifacts/model.blend', compress=False)", '')


class InferenceProtocolError(RuntimeError):
    """Unusable inference results stop execution rather than inviting candidate repair."""


class CorrectableModelResponse(ValueError):
    """A billed response produced no executable action and may be corrected."""


class ReviewBudgetReserved(RuntimeError):
    """The gateway declined modeling before dispatch to preserve critic allowance."""


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


def validate_review(value: Any) -> dict[str, Any]:
    """Fail closed on an incompatible broker response before recording acceptance."""
    if not isinstance(value, dict): raise RuntimeError('Invalid independent review.')
    verdict, score, corrections = value.get('verdict'), value.get('score'), value.get('corrections')
    if verdict not in {'ready', 'revise'} or type(score) is not int or not 0 <= score <= 10 or not isinstance(corrections, list) or len(corrections) > 3:
        raise RuntimeError('Invalid independent review.')
    if (verdict == 'ready' and (score < 8 or corrections)) or (verdict == 'revise' and not corrections):
        raise RuntimeError('Invalid independent review.')
    if not isinstance(value.get('summary'), str) or not value['summary'].strip(): raise RuntimeError('Invalid independent review.')
    for item in corrections:
        if not isinstance(item, dict) or any(not isinstance(item.get(key), str) or not item[key].strip() for key in ['area', 'issueId', 'evidence', 'change']):
            raise RuntimeError('Invalid independent review.')
    return value


def run_studio(broker: Any, files: ManagedFiles, token: str, job_id: str, executor: str,
               row: dict[str, Any], monitor: Callable[[str], None], inference_url: str, broker_key: str) -> None:
    reservation = row['reservationId']
    quality = row.get('workflowVersion') == 3
    strategy = None
    reviews: list[dict[str, Any]] = []
    accepted_review = None
    running = saved = scene_matches = accepted_current = video_saved = False
    reference_saved = False
    accepted_revision: int | None = None
    revision = 0
    # Restores change the current candidate, never the allocation counter.
    revision_sequence = 0
    legacy_reviews: dict[int, dict[str, Any]] = {}
    stop_reason: str | None = None
    reviewed_views: set[str] = set()
    rendered: list[dict[str, str]] = []
    references: list[dict[str, str]] = []
    events: list[dict[str, Any]] = []
    status, progress = 'failed', 'The reference-guided job could not complete.'
    history = 'Inspect the persistent scene, then build a strong blockout matching the reference. Work through Blender tools and use rendered evidence to guide each stage.'
    reference_cost = 0
    invalid_actions = 0
    component_sharing = row.get('shareComponents')
    sharing_enabled = row.get('shareMaterials') is True
    history += ' Component publication: '+json.dumps(component_sharing or 'disabled')+'.'
    history += ' Material publication is '+('enabled' if sharing_enabled else 'disabled')+' for this job.'
    from .material_exchange import MaterialExchange
    exchange = None
    exchange_client = None
    asset_exchange = None
    polyhaven = None
    prepared_asset = None
    asset_preview = None
    published_assets = 0
    prepared_material = None
    material_preview = None
    published_materials = 0
    generated_assets = 0
    meshy_allowance = row.get('meshyAllowance')
    meshy_context = row.get('meshyContext')
    if meshy_context is None and isinstance(meshy_allowance, dict):
        # The trusted gateway snapshots the rate on the managed row. Keep this
        # context informational; the gateway remains the authority for claims.
        meshy_context = {
            'enabled': row.get('meshyAdmissionEnabled', True) is True,
            'budgetRemainingCents': max(0, int(meshy_allowance.get('budgetCents', 0)) - int(row.get('chargedMeshyCents', 0))),
            'maxAssets': meshy_allowance.get('maxAssets', 1),
            'allowRigging': meshy_allowance.get('allowRigging', False),
            **({'generationCents': row['meshyGenerationCents']} if isinstance(row.get('meshyGenerationCents'), int) else {}),
            **({'riggingCents': row['meshyRiggingCents']} if isinstance(row.get('meshyRiggingCents'), int) else {}),
        }
    meshy_enabled = isinstance(meshy_context, dict) and meshy_context.get('enabled') is True

    def shared_materials():
        nonlocal exchange
        if exchange is None: exchange = MaterialExchange(inference_url, broker.ledger.base, token)
        return exchange

    def shared_assets():
        nonlocal asset_exchange
        if asset_exchange is None:
            from .asset_exchange import AssetExchange
            asset_exchange = AssetExchange(inference_url, broker.ledger.base, token)
        return asset_exchange

    def polyhaven_assets():
        nonlocal polyhaven
        if polyhaven is None:
            from .polyhaven import PolyHaven
            polyhaven = PolyHaven(check_active=current)
        return polyhaven

    def current() -> dict[str, Any]:
        value = broker.ledger.call('getManagedJobForBroker', jobId=job_id)
        if value.get('cancelled') or value.get('cancelRequested') or value['status'] == 'cancelled': raise InterruptedError('Cancelled')
        if value['status'] != 'running': raise RuntimeError('Job is no longer active.')
        return value

    def heartbeat(message: str) -> None:
        value = broker.ledger.call('heartbeatManagedJob', jobId=job_id, executorId=executor, progress=message[:1000])
        if not value.get('active'): raise InterruptedError('Job is no longer active.')

    def trace() -> None:
        if quality:
            files.save_review(job_id, {'protocol': 3, 'strategy': strategy, 'reviews': reviews, 'jobId': job_id, 'referenceModel': REFERENCE_MODEL if reference_saved else None, 'referenceCostCents': reference_cost, 'model': 'openai/gpt-6-astra', 'acceptedRevision': accepted_revision, 'candidateRevision': revision, 'actions': events})
        elif reference_saved:
            files.save_review(job_id, {'protocol': 2, 'jobId': job_id, 'referenceModel': REFERENCE_MODEL, 'referenceCostCents': reference_cost, 'model': 'openai/gpt-6-astra', 'acceptedRevision': accepted_revision, 'candidateRevision': revision, 'quality': {'reviewer': 'independent', 'scope': 'Blender renders', 'reviews': list(legacy_reviews.values()), 'stopReason': stop_reason}, 'actions': events})

    def workflow_history() -> str:
        header = f'Candidate revision {revision}. Accepted revision {accepted_revision}. Current scene matches candidate: {scene_matches}. Current candidate accepted: {accepted_current}. Material publication enabled: {sharing_enabled}. Component publication: {json.dumps(component_sharing or "disabled")}.\n'
        recent = []
        for event in events[-6:]:
            detail = {key: value for key, value in event.items() if key not in {'time', 'sourceMetadata'}}
            if event['action'] in {'search_assets', 'search_polyhaven', 'search_materials', 'search_templates', 'inspect_template'} and isinstance(detail.get('result'), str):
                # Avoid double-escaping metadata, and retain identifiers as structured data.
                try: detail['result'] = json.loads(detail['result'])
                except json.JSONDecodeError: pass
            recent.append(detail)

        def serialized() -> str:
            return header + json.dumps(recent, ensure_ascii=False)

        if len(serialized().encode()) > 15000:
            for detail in recent:
                result = detail.get('result')
                if isinstance(result, dict) and isinstance(result.get('entries'), list):
                    for entry in result['entries']:
                        entry.pop('description', None)
                        if isinstance(entry.get('name'), str): entry['name'] = entry['name'][:40]
            for detail in recent[:-1]:
                if len(serialized().encode()) <= 15000: break
                detail.pop('result', None)  # Retain the fact and summary of earlier inspection.
        if len(serialized().encode()) > 15000:
            for detail in recent:
                for key in ['critique', 'summary', 'error']:
                    if isinstance(detail.get(key), str): detail[key] = detail[key].encode()[:500].decode(errors='ignore')
            result = recent[-1].get('result')
            if isinstance(result, dict) and isinstance(result.get('entries'), list):
                recent[-1]['result'] = {'entries': [{'id': entry['id']} for entry in result['entries']], 'cursor': result.get('cursor')}
        while len(serialized().encode()) > 15000:
            # Non-catalog tool output may be shortened, never a catalog's IDs or cursor.
            value = recent[-1].get('result')
            if not isinstance(value, str) or not value:
                raise ValueError('Workflow history exceeds its structured context limit.')
            recent[-1]['result'] = value[:len(value) // 2]
        return serialized()

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
            request = {'protocol': 3 if quality else 2, 'kind': kind, 'jobId': job_id, 'executorId': executor, 'operationId': operation, **payload}
            # Single dispatch, with the same durable budget fence as text inference.
            with httpx.Client(timeout=INFERENCE_TIMEOUT_SECONDS, follow_redirects=False) as client:
                with client.stream('POST', inference_url, json=request, headers={'x-agartha-broker-key': broker_key}) as response:
                    chunks = bytearray()
                    limit = 4_000_000 if kind in {'reference', 'asset-reference'} else 100_000
                    for chunk in response.iter_bytes():
                        chunks.extend(chunk)
                        if len(chunks) > limit: raise InferenceProtocolError('Inference response exceeds its limit.')
                    try:
                        result = json.loads(chunks)
                    except (json.JSONDecodeError, UnicodeDecodeError) as error:
                        raise InferenceProtocolError('Inference response is not usable JSON.') from error
                    if not isinstance(result, dict): raise InferenceProtocolError('Inference response must be an object.')
                    if quality and kind == 'modeling' and response.status_code == 409:
                        if result.get('code') == 'quality_review_reserved': raise ReviewBudgetReserved('Modeling allowance is reserved for final review.')
                    if quality and kind == 'modeling' and response.status_code == 502 and result.get('code') in {'inference_action_invalid', 'inference_output_incomplete'}:
                        raise CorrectableModelResponse(str(result.get('error', 'Invalid Blender action.'))[:500])
                    if quality and response.status_code >= 400:
                        details = {'status': response.status_code, 'kind': kind, 'operationId': operation}
                        for key, limit in [('error', 500), ('code', 100)]:
                            if isinstance(result.get(key), str): details[key] = result[key][:limit]
                        raise InferenceProtocolError('Inference request failed: ' + json.dumps(details, ensure_ascii=False))
                    response.raise_for_status()
            current()
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

    def independent_review(operation: str) -> dict[str, Any]:
        digest = hashlib.sha256(files.read(job_id, 'model.glb')).hexdigest()
        if any(review['candidateRevision'] == revision or review['glbSha256'] == digest for review in reviews):
            raise ValueError('This candidate was already reviewed or attempted. Revise the exported model before another paid review.')
        attempt = {'candidateRevision': revision, 'glbSha256': digest, 'status': 'attempted'}
        reviews.append(attempt); trace()  # Durable before any paid critic dispatch.
        evidence = []
        for view in ['hero', 'front', 'right']:
            heartbeat('Reviewing the exported model: ' + view + '.')
            execute(render_export_view_code(view), operation + '-quality-' + view)
            evidence.append({'label': 'export-' + view, 'image': image_data(broker.download(token, reservation, 'review_' + view + '.png', 4_000_000))})
        worker_glb = broker.download(token, reservation, 'model.glb', FILE_LIMIT)
        if hashlib.sha256(worker_glb).hexdigest() != digest: raise ValueError('Candidate changed during exported model inspection.')
        verdict = inference(f'{executor}-review-{revision}', 'review', strategy=strategy, candidateRevision=revision, glbSha256=digest, images=references + evidence)
        current()
        if not quality_review_valid(verdict, digest, revision):
            raise InferenceProtocolError('Critic returned an invalid or unbound quality verdict.')
        attempt.update({'status': 'reviewed', 'verdict': verdict}); trace()
        if not verdict['accepted']:
            details = {'defects': verdict.get('defects'), 'criteria': verdict.get('criteria')}
            raise ValueError('Independent review rejected this candidate. Repair these defects before another acceptance request: ' + json.dumps(details, ensure_ascii=False)[:10000])
        return verdict

    def accept_candidate(operation: str, verdict: dict[str, Any] | None = None) -> None:
        nonlocal accepted_revision, accepted_current, accepted_review
        current()
        if quality:
            for name in ['model.glb', 'model.blend']:
                worker = broker.download(token, reservation, name, FILE_LIMIT)
                if hashlib.sha256(worker).digest() != hashlib.sha256(files.read(job_id, name)).digest():
                    raise ValueError('Candidate changed after independent review.')
        execute("import shutil\nshutil.copyfile('/workspace/artifacts/model.blend', '/workspace/artifacts/accepted.blend')\nshutil.copyfile('/workspace/artifacts/model.glb', '/workspace/artifacts/accepted.glb')", operation)
        current()
        files.accept(job_id, **({'quality_review': verdict} if quality else {})); accepted_revision = revision; accepted_current = True
        broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor, **({'qualityApproved': True} if quality else {}))
        accepted_review = verdict

    def finish_with_review(reason: str) -> None:
        nonlocal status, progress
        status, progress = ('partial' if saved else 'failed'), 'Modeling stopped to preserve independent review allowance.'
        if accepted_current and scene_matches:
            status, progress = 'completed', 'Delivered the independently accepted model within the budget.'
        elif saved and scene_matches:
            event = {'action': 'service_review', 'candidateRevision': revision, 'reason': reason}
            events.append(event)
            try:
                accept_candidate(executor + '-budget-accept', independent_review(executor + '-budget-review'))
                status, progress = 'completed', 'The final exported candidate passed independent review within the budget.'
                event['result'] = progress
            except ValueError as error:
                event['error'] = str(error)[:2500]
                progress = 'The final candidate did not pass independent review; retained available files.'
            trace()

    try:
        if row.get('referenceMode') == 'generate':
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
        if quality:
            heartbeat('Planning geometry and independent acceptance checks.')
            planned = inference(executor + '-strategy', 'strategy', images=references, **({'meshy': meshy_context} if meshy_context else {}))
            strategy = planned.get('strategy')
            if not isinstance(strategy, dict) or len(json.dumps(strategy, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) > 12000: raise ValueError('Invalid service strategy.')
            trace()
        for turn in range(MAX_ACTIONS):
            current()
            if saved and running and remaining_seconds(broker.owned(token, reservation)) <= DELIVERY_RESERVE_SECONDS:
                status, progress = 'partial', 'Stopped refining to preserve delivery time.'
                break
            heartbeat('Reviewing references and deciding the next Blender action.')
            publication_preview = asset_preview or material_preview
            visible_model_views = [image for image in rendered if not publication_preview or image['label'] != publication_preview['label']]
            try:
                step = inference(f'{executor}-studio-{turn}', 'modeling', **({'strategy': strategy} if quality else {}), **({'meshy': meshy_context} if meshy_context else {}), history=history, images=modeler_images(references, visible_model_views, publication_preview) if quality else references + visible_model_views + ([publication_preview] if publication_preview else []))
            except CorrectableModelResponse as error:
                current()
                invalid_actions += 1
                events.append({'turn': turn, 'action': 'invalid_action', 'error': str(error), 'result': 'No Blender action was executed. Return one corrected action with valid arguments.', 'candidateRevision': revision})
                trace(); history = workflow_history()
                if invalid_actions >= 3:
                    finish_with_review('modeling_correction_limit')
                    break
                continue
            except ReviewBudgetReserved:
                current()
                finish_with_review('modeling_budget_reserved')
                break
            invalid_actions = 0
            if asset_preview and prepared_asset: prepared_asset['reviewed'] = True
            if material_preview and prepared_material: prepared_material['reviewed'] = True
            if scene_matches:
                reviewed_views.update(image['label'].removeprefix('render-') for image in visible_model_views)
            action = step.get('action')
            if action not in {'prepare_generated_asset', 'generate_asset', 'inspect_scene', 'inspect_resources', 'inspect_object', 'edit', 'render_views', 'accept', 'restore', 'finish', 'search_templates', 'inspect_template', 'build_template', 'search_assets', 'load_asset', 'search_polyhaven', 'load_polyhaven', 'prepare_asset', 'publish_asset', 'search_materials', 'load_material', 'prepare_material', 'publish_material'}: raise ValueError('Unknown Blender action.')
            event = {'turn': turn, 'action': action, 'candidateRevision': revision, 'summary': str(step.get('summary', ''))[:1000], 'critique': str(step.get('critique', ''))[:2000], 'inspectedViews': sorted(reviewed_views), 'time': int(time.time())}
            events.append(event)
            operation = f'{executor}-tool-{turn}'
            try:
                if action == 'finish':
                    if not accepted_current or not scene_matches: raise ValueError('Accept the current visually inspected candidate before finishing.')
                    status, progress = 'completed', event['summary'] or 'Accepted model delivered.'
                    event['result'] = 'Finished with an accepted, inspected model.'
                    trace(); break
                if action in {'search_templates','inspect_template'}:
                    parameters=json.loads(step.get('code','{}'))
                    if action=='search_templates':
                        result=shared_assets().search_templates(parameters.get('q',''),parameters.get('cursor'))
                        result={'entries':[{'id':entry['id'],'name':entry['name'].encode()[:100].decode(errors='ignore'),'controls':entry['parameterNames']} for entry in result['entries']],'cursor':result.get('cursor')}
                    else:
                        entry=shared_assets().template(parameters['id'])
                        if parameters.get('parameter'):
                            key=parameters['parameter']
                            if key not in entry['parameters']: raise ValueError('Unknown template control.')
                            result={'id':entry['id'],'parameter':key,'definition':entry['parameters'][key]}
                        else:
                            controls={}
                            for key,spec in entry['parameters'].items():
                                controls[key]={field:spec[field] for field in ['type','min','max'] if field in spec}
                                if len(json.dumps(spec['default'],ensure_ascii=False).encode())<=80: controls[key]['default']=spec['default']
                                if 'values' in spec: controls[key]['choiceCount']=len(spec['values'])
                            result={'id':entry['id'],'name':entry['name'],'controls':controls,'license':entry['license'],'attribution':entry['attribution'],'inspectControl':'Call inspect_template with parameter to see every option.'}
                    event['result']=json.dumps(result,ensure_ascii=False)
                    trace(); history = workflow_history()
                    continue
                if action == 'search_polyhaven':
                    parameters = json.loads(step.get('code', '{}'))
                    result = polyhaven_assets().search(parameters.get('q', ''), parameters.get('cursor'))
                    event['result'] = json.dumps(result, ensure_ascii=False)
                    trace()
                    history = workflow_history()
                    continue
                if action == 'search_assets':
                    parameters = json.loads(step.get('code', '{}'))
                    result = shared_assets().search(parameters.get('q',''),parameters.get('cursor'),parameters.get('parentId'))
                    compact = {'entries':[{'id':entry['id'],'name':entry['metadata']['name'].encode()[:100].decode(errors='ignore'),'description':entry['metadata'].get('description','').encode()[:80].decode(errors='ignore')} for entry in result['entries']], 'cursor':result.get('cursor')}
                    event['result'] = json.dumps(compact,ensure_ascii=False)
                    trace()
                    history = workflow_history()
                    continue
                if action == 'search_materials':
                    parameters = json.loads(step.get('code', '{}'))
                    result = shared_materials().search(parameters.get('q',''),parameters.get('cursor'))
                    compact = {'entries':[{'id':entry['id'],'name':entry['name'].encode()[:100].decode(errors='ignore'),'tileSize':entry['tileSize'],'description':entry['description'].encode()[:80].decode(errors='ignore')} for entry in result['entries']], 'cursor':result.get('cursor')}
                    event['result'] = json.dumps(compact,ensure_ascii=False)
                    trace()
                    history = workflow_history()
                    continue
                if action == 'prepare_generated_asset':
                    if not meshy_enabled: raise ValueError('Meshy is not enabled for this managed job.')
                    parameters = json.loads(step.get('code', '{}'))
                    if not isinstance(parameters, dict): raise ValueError('Invalid generated component parameters.')
                    name = parameters.get('name') or step.get('objectName')
                    brief = parameters.get('brief')
                    if not isinstance(name, str) or not name.strip() or len(name) > 100 or not isinstance(brief, str) or not brief.strip() or len(brief.encode()) > 2000:
                        raise ValueError('Generated component name and brief are required.')
                    rigging = parameters.get('rigging', False); height_meters = parameters.get('heightMeters', 1.7)
                    if type(rigging) is not bool or not isinstance(height_meters, (int, float)) or not 0.2 <= height_meters <= 5:
                        raise ValueError('Invalid generated component rigging options.')
                    for key, value in [('location', parameters.get('location', [0, 0, 0])), ('rotation', parameters.get('rotation', [0, 0, 0])), ('scale', parameters.get('scale', [1, 1, 1]))]:
                        if not isinstance(value, (list, tuple)) or len(value) != 3 or any(not isinstance(item, (int, float)) or not math.isfinite(item) or abs(item) > 10000 for item in value) or key == 'scale' and any(item <= 0 for item in value):
                            raise ValueError('Invalid generated component transform.')
                    if rigging and not meshy_context.get('allowRigging', False): raise ValueError('Rigging is not enabled for this Meshy allowance.')
                    operation_seed = json.dumps({'name': name.strip(), 'brief': brief.strip(), 'rigging': rigging, 'heightMeters': height_meters}, sort_keys=True, separators=(',', ':'))
                    reference_operation = executor + '-asset-reference-' + hashlib.sha256(operation_seed.encode()).hexdigest()[:40]
                    reference_result = inference(reference_operation, 'asset-reference', componentBrief=brief.strip())
                    encoded = reference_result.get('image')
                    if not isinstance(encoded, str) or not encoded.startswith('data:image/jpeg;base64,'): raise ValueError('Invalid generated component reference.')
                    try: reference_payload = base64.b64decode(encoded.split(',', 1)[1], validate=True)
                    except (ValueError, UnicodeError): raise ValueError('Invalid generated component reference.') from None
                    prepared_asset = {'kind': 'generated', 'name': name.strip(), 'brief': brief.strip(), 'rigging': rigging, 'heightMeters': float(height_meters), 'location': parameters.get('location', [0, 0, 0]), 'rotation': parameters.get('rotation', [0, 0, 0]), 'scale': parameters.get('scale', [1, 1, 1]), 'reference': reference_payload, 'referenceOperation': reference_operation, 'reviewed': False, 'generated': False}
                    asset_preview = {'label': 'asset-reference', 'image': image_data(reference_payload)}
                    event['result'] = 'Prepared an isolated generated component reference. Inspect this target in the next turn before generate_asset.'
                    trace(); history = f'Candidate revision {revision}. Accepted revision {accepted_revision}. Meshy component reference is awaiting visual review.\n' + json.dumps(events[-3:], ensure_ascii=False)
                    continue
                if not running:
                    heartbeat('Starting the private Blender workspace.')
                    broker.start(token, reservation); running = True; monitor(reservation)
                heartbeat(event['summary'] or 'Operating Blender.')
                if action == 'generate_asset':
                    if not meshy_enabled: raise ValueError('Meshy is not enabled for this managed job.')
                    if not prepared_asset or prepared_asset.get('kind') != 'generated' or not asset_preview or asset_preview.get('label') != 'asset-reference' or not prepared_asset.get('reviewed'):
                        raise ValueError('Prepare and visually review an isolated component reference before generating it.')
                    if step.get('objectName') != prepared_asset['name']: raise ValueError('Generate the prepared component using its exact name.')
                    if not event['critique'].strip(): raise ValueError('Describe the visual fit and remaining component concerns before generation.')
                    if prepared_asset.get('generated'): raise ValueError('This component generation is already complete.')
                    operation = executor + '-meshy-' + hashlib.sha256(prepared_asset['referenceOperation'].encode()).hexdigest()[:40]
                    if generated_assets >= int(meshy_context.get('maxAssets', 1)) and prepared_asset.get('generationOperation') != operation:
                        raise ValueError('The Meshy asset allowance is exhausted.')
                    if not prepared_asset.get('generationStarted'):
                        generated_assets += 1; prepared_asset['generationStarted'] = True; prepared_asset['generationOperation'] = operation
                    available = remaining_seconds(broker.owned(token, reservation)) - DELIVERY_RESERVE_SECONDS
                    if available <= 0: raise ValueError('Stopped before Meshy generation to preserve delivery and review time.')
                    deadline = time.time() + min(900, available)
                    if prepared_asset.get('payload') is not None and prepared_asset.get('metadata') is not None:
                        payload, metadata = prepared_asset['payload'], prepared_asset['metadata']
                    else:
                        exchange_client = MeshyExchange(inference, heartbeat, lambda: deadline)
                        def save_generated_component(save_operation, save_payload, save_metadata):
                            files.save_component(job_id, save_operation, save_payload, prepared_asset['reference'], {**save_metadata, 'operationId': operation, 'referenceSha256': hashlib.sha256(prepared_asset['reference']).hexdigest(), 'componentName': prepared_asset['name'], 'transform': {key: prepared_asset[key] for key in ['location', 'rotation', 'scale']}})
                            broker.ledger.call('recordManagedMeshyArtifact', jobId=job_id, executorId=executor, operationId=save_operation, recovered=False)
                        try:
                            payload, metadata = exchange_client.generate(operation, 'data:image/jpeg;base64,' + base64.b64encode(prepared_asset['reference']).decode(), rigging=prepared_asset['rigging'], height_meters=prepared_asset['heightMeters'], save=save_generated_component)
                        except InterruptedError: raise
                        except Exception as error: raise ValueError(str(error)[:2000]) from error
                        prepared_asset['payload'], prepared_asset['metadata'] = payload, metadata
                    uploaded = broker.upload_material(token, reservation, payload, operation + '-upload')
                    if not isinstance(uploaded, str) or not uploaded: raise ValueError('Generated model upload failed.')
                    task_id = metadata.get('taskId')
                    if not isinstance(task_id, str): raise ValueError('Generated model has no durable provider task.')
                    transform = {key: prepared_asset[key] for key in ['location', 'rotation', 'scale']}
                    code = "import sys,json,hashlib\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.generated_components import import_generated_component\n"
                    code += "path='/workspace/artifacts/" + uploaded + "'\nassert hashlib.sha256(open(path,'rb').read()).hexdigest()==" + repr(metadata['sha256']) + "\n"
                    code += "root=import_generated_component(path," + repr(prepared_asset['name']) + ",task_id=" + repr(task_id) + ",rigged=" + repr(bool(metadata.get('rigged'))) + ",**json.loads(" + repr(json.dumps(transform)) + "))\nprint(root.name)"
                    scene_matches = accepted_current = False; rendered = []; reviewed_views.clear()
                    event['codeSha256'] = hashlib.sha256(code.encode()).hexdigest()
                    if not prepared_asset.get('imported'):
                        execute(code, operation + '-attempt-' + str(turn) + '-import')
                        prepared_asset['imported'] = True
                    result = execute(EXPORT, operation + '-attempt-' + str(turn) + '-export')
                    candidate = exported(); files.save(job_id, candidate)
                    revision_sequence += 1; revision = revision_sequence; saved = scene_matches = True
                    broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                    rendered = inspect(['hero', 'front', 'right'], '', operation + '-attempt-' + str(turn) + '-inspect')
                    delivery = 'Generated and imported the textured Meshy component with its editable hierarchy.'
                    if metadata.get('riggingFallback'):
                        delivery = 'Optional rigging was unavailable; imported the valid textured base component.'
                    elif metadata.get('animated'):
                        delivery = 'Generated and imported the textured, rigged Meshy component with its walking animation.'
                    event['result'] = delivery + ' ' + json.dumps(result)[:1000]
                    prepared_asset['generated'] = True
                    prepared_asset = asset_preview = None
                elif action == 'inspect_resources':
                    result = execute(resource_inspection_code(step.get('objectName', '')), operation)
                    event['result'] = json.dumps(result)[:12000]
                elif action in {'inspect_scene', 'inspect_object'}:
                    name = 'get_scene_info' if action == 'inspect_scene' else 'get_object_info'
                    arguments = {'user_prompt': row['brief'][:1000]}
                    if action == 'inspect_object': arguments['object_name'] = step['objectName']
                    result = mcp(name, arguments, operation)
                    event['result'] = json.dumps(result)[:5000]
                elif action in {'edit','load_material','load_asset','load_polyhaven','build_template'}:
                    if action == 'build_template':
                        parameters=json.loads(step['code'])
                        entry=shared_assets().template(parameters['id'])
                        payload=json.dumps({'definition':entry['definition'],'parameters':parameters.get('parameters',{}),'name':parameters['name'],'template_id':entry['id']},ensure_ascii=False,separators=(',',':'))
                        if len(payload.encode())>38000: raise ValueError('Template instantiation exceeds its payload limit.')
                        code="import bpy,sys,json\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.asset_templates import build_template\nfrom cloud.blender_mcp.components import assembly_manifest\n"
                        code+="root=build_template(**json.loads("+repr(payload)+"))\nroot.location="+repr(parameters['location'])+"\nroot.rotation_euler="+repr(parameters['rotation'])+"\nroot.scale="+repr(parameters['scale'])+"\nbpy.context.view_layer.update()\nprint(json.dumps(assembly_manifest()))"
                        event['templateId']=entry['id'];event['templateParameters']=parameters.get('parameters',{})
                    elif action == 'load_polyhaven':
                        parameters = json.loads(step['code'])
                        allowance = min(60, remaining_seconds(broker.owned(token, reservation)) - DELIVERY_RESERVE_SECONDS - 5)
                        entry, payload = polyhaven_assets().load(parameters['id'], timeout_seconds=allowance)
                        name = broker.upload_material(token, reservation, payload, operation + '-upload')
                        transform = {key: parameters[key] for key in ['location', 'rotation', 'scale']}
                        code = "import sys,json,hashlib\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.components import import_polyhaven,assembly_manifest\n"
                        code += "path='/workspace/artifacts/" + name + "'\nassert hashlib.sha256(open(path,'rb').read()).hexdigest()==" + repr(entry['modelId'].removeprefix('model-')) + "\n"
                        code += "root=import_polyhaven(path," + repr(parameters['name']) + ",asset_id=" + repr(entry['id']) + ",attribution=" + repr(entry['attribution']) + ",**json.loads(" + repr(json.dumps(transform)) + "))\nprint(json.dumps(assembly_manifest()))"
                        event['sourceMetadata'] = entry
                        heartbeat('Loaded a model from Poly Haven; checking its appearance.')
                    elif action == 'load_asset':
                        parameters = json.loads(step['code'])
                        entry, payload = shared_assets().load(parameters['id'])
                        # Reuse the immutable bounded GLB transfer; it carries no executable source.
                        name = broker.upload_material(token,reservation,payload,operation+'-upload')
                        transform = {key:parameters[key] for key in ['location','rotation','scale']}
                        code = "import sys,json,hashlib\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.components import import_component,assembly_manifest\n"
                        code += "path='/workspace/artifacts/"+name+"'\nassert hashlib.sha256(open(path,'rb').read()).hexdigest()=="+repr(entry['modelId'].removeprefix('model-'))+"\n"
                        code += "root=import_component(path,"+repr(parameters['name'])+",bundle_id="+repr(entry['id'])+",**json.loads("+repr(json.dumps(transform))+"))\n"
                        if entry['metadata'].get('templateId'):
                            code+="root['agarthaTemplateId']="+repr(entry['metadata']['templateId'])+"\nroot['agarthaTemplateParameters']="+repr(json.dumps(entry['metadata']['templateParameters']))+"\n"
                        code+="print(json.dumps(assembly_manifest()))"
                        event['sourceBundleId'] = entry['id']
                        event['sourceMetadata'] = entry['metadata']
                    elif action == 'load_material':
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
                    if not isinstance(code, str) or not code.strip() or len(code.encode()) > (48000 if action=='build_template' else 32000): raise ValueError('Invalid edit code.')
                    scene_matches = accepted_current = False
                    prepared_asset = asset_preview = None
                    prepared_material = material_preview = None
                    rendered = []; reviewed_views.clear()
                    event['codeSha256'] = hashlib.sha256(code.encode()).hexdigest()
                    result = execute(code + '\n' + EXPORT, operation)
                    candidate = exported(); files.save(job_id, candidate)
                    revision_sequence += 1
                    revision = revision_sequence; saved = scene_matches = True
                    broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                    # Every edit produces actual evidence; the next action can request more.
                    rendered = inspect(['hero', 'front', 'right'], '', operation + '-inspect')
                    event['result'] = 'Saved candidate and rendered hero, front, and right views. ' + json.dumps(result)[:1000]
                elif action == 'render_views':
                    if not scene_matches: raise ValueError('Repair and export the current scene before inspecting a candidate.')
                    rendered = inspect(step.get('views', []), step.get('objectName', ''), operation)
                    event['result'] = 'Rendered requested inspection views without changing the model or hero camera.'
                elif action == 'accept':
                    if not scene_matches or not quality and (len(reviewed_views) < 2 or not event['critique'].strip()): raise ValueError('Acceptance requires the current candidate, two inspected views, and a concrete visual critique.')
                    if quality:
                        accept_candidate(operation, independent_review(operation))
                        event['result'] = 'Accepted the independently reviewed exported model.'
                    else:
                        if revision not in legacy_reviews:
                            if len(legacy_reviews) >= MAX_REVIEWS:
                                stop_reason = 'Review limit reached; preserved available files.'
                                status, progress = 'partial', stop_reason
                                break
                            heartbeat('An independent reviewer is checking proportions, structure and materials.')
                            # Whole-model views only; publication swatches are never evidence for acceptance.
                            if len([image for image in rendered if image['label'] != 'render-detail']) < 2:
                                rendered = inspect(['hero', 'front', 'right'], '', operation + '-review')
                            if remaining_seconds(broker.owned(token, reservation)) <= INFERENCE_TIMEOUT_SECONDS + DELIVERY_RESERVE_SECONDS:
                                stop_reason = 'Stopped before independent review to preserve delivery time.'
                                status, progress = 'partial', stop_reason
                                break
                            review = validate_review(inference(f'{executor}-review-{revision}', 'critique', images=references + rendered))
                            legacy_reviews[revision] = {**review, 'candidateRevision': revision}
                        review = legacy_reviews[revision]
                        event['independentReview'] = review
                        if review['verdict'] != 'ready':
                            rejected = [item for item in legacy_reviews.values() if item['verdict'] == 'revise']
                            recent = rejected[-3:]
                            stalled = len(recent) == 3 and recent[-1]['score'] <= recent[0]['score'] and all(item['corrections'][0]['issueId'] == recent[0]['corrections'][0]['issueId'] for item in recent)
                            if stalled or len(legacy_reviews) >= MAX_REVIEWS:
                                stop_reason = 'Stopped after repeated reviews found no improvement.' if stalled else 'Review limit reached with unresolved corrections.'
                                status, progress = 'partial', stop_reason
                                event['result'] = stop_reason
                                break
                            repeated = len(rejected) >= 2 and rejected[-1]['score'] <= rejected[-2]['score'] and rejected[-1]['corrections'][0]['issueId'] == rejected[-2]['corrections'][0]['issueId']
                            strategy_hint = ' Change the construction approach before refining details.' if repeated else ''
                            raise ValueError('Independent review requests corrections: ' + json.dumps(review, ensure_ascii=False) + strategy_hint)
                        execute("import shutil\nshutil.copyfile('/workspace/artifacts/model.blend', '/workspace/artifacts/accepted.blend')", operation)
                        files.accept(job_id); accepted_revision = revision; accepted_current = True
                        broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor)
                        event['result'] = 'Accepted the checkpoint after independent visual review.'
                elif action == 'prepare_asset':
                    if not component_sharing: raise ValueError('Component publication was not enabled with a license for this job.')
                    if not accepted_current or not scene_matches: raise ValueError('Accept and inspect the scene before contributing components.')
                    if published_assets >= 3: raise ValueError('At most three component contributions per job.')
                    prepared_asset = asset_preview = prepared_material = material_preview = None
                    metadata = {**json.loads(step['code']), **component_sharing}
                    code = "import bpy,sys,json,shutil\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.components import export_component,component_sources\n"
                    code += "root=bpy.data.objects.get("+repr(step['objectName'])+")\nassert root and root.name in bpy.data.collections['AGARTHA_MODEL'].all_objects, 'Choose a deliverable component.'\n"
                    code += "parents=component_sources(root)\nassert len(parents)<=1, 'Review multi-source assembly licenses through deliberate asset publication.'\n"
                    code += "paths=export_component(root,'/workspace/artifacts/component-stage')\nfor key,name in [('glb','shared_component.glb'),('source','component_source.blend'),('preview','component_preview.png')]: shutil.copyfile(paths[key],'/workspace/artifacts/'+name)\n"
                    code += "open('/workspace/artifacts/component_parent.json','w').write(json.dumps(parents))\nopen('/workspace/artifacts/component_template.json','w').write(json.dumps({'templateId':root.get('agarthaTemplateId'),'templateParameters':json.loads(root.get('agarthaTemplateParameters','{}'))}))"
                    execute(code,operation)
                    component_files = {key:broker.download(token,reservation,name,2_000_000 if key=='preview' else 16_000_000) for key,name in [('glb','shared_component.glb'),('source','component_source.blend'),('preview','component_preview.png')]}
                    parents=json.loads(broker.download(token,reservation,'component_parent.json',1000))
                    from .asset_exchange import BUNDLE_ID
                    if not isinstance(parents,list) or len(parents)>1 or any(not isinstance(id,str) or not BUNDLE_ID.fullmatch(id) for id in parents): raise ValueError('Invalid component provenance.')
                    if parents: metadata['parentId']=parents[0]
                    instance=json.loads(broker.download(token,reservation,'component_template.json',5000))
                    if instance.get('templateId'):
                        import re
                        if not re.fullmatch(r'template-[a-f0-9]{64}',str(instance['templateId'])): raise ValueError('Publish the local procedural template before contributing this component.')
                        metadata.update(instance)

                    prepared_asset={'rootName':step['objectName'],'files':component_files,'metadata':metadata,'reviewed':False,'publication':{}}
                    asset_preview={'label':'render-detail','image':image_data(component_files['preview'])}
                    event['result']='Prepared an isolated component. render-detail shows this component at its local pivot. Inspect its silhouette, material scale, joins and completeness before publish_asset.'
                elif action == 'publish_asset':
                    if not component_sharing: raise ValueError('Component publication was not enabled with a license for this job.')
                    if not accepted_current or not prepared_asset or not prepared_asset['reviewed'] or not event['critique'].strip():
                        raise ValueError('Prepare a component, inspect it in a later turn, and give a concrete critique before publishing.')
                    result=shared_assets().publish(prepared_asset['files'],prepared_asset['metadata'],event['critique'],prepared_asset['publication'])
                    if not prepared_asset.get('counted'):
                        published_assets += 1
                        prepared_asset['counted']=True
                    event['result']='Published reusable component: '+json.dumps({key:result[key] for key in ['id','modelId','metadata','source','preview']})
                    trace()  # Record permanent publication even if checkpoint annotation fails.
                    code="import bpy,shutil\nfrom cloud.blender_mcp.components import mark_published_component\nroot=bpy.data.objects.get("+repr(prepared_asset['rootName'])+")\nassert root and root.get('agarthaComponent'), 'Component root changed.'\nmark_published_component(root,"+repr(result['id'])+")\nbpy.ops.wm.save_as_mainfile(filepath='/workspace/artifacts/model.blend',check_existing=False,compress=False)\nshutil.copyfile('/workspace/artifacts/model.blend','/workspace/artifacts/accepted.blend')"
                    execute(code,operation+'-provenance')
                    updated={name:files.read(job_id,name) for name in BASE_NAMES}
                    updated['model.blend']=broker.download(token,reservation,'model.blend',FILE_LIMIT)
                    files.save(job_id,updated); files.accept(job_id)
                    prepared_asset = asset_preview = None
                elif action == 'prepare_material':
                    if not accepted_current or not scene_matches: raise ValueError('Accept and inspect the model before contributing a material.')
                    if published_materials >= 3: raise ValueError('At most three material contributions per job.')
                    prepared_asset = asset_preview = None
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
                    if not sharing_enabled: raise ValueError('Material publication was not enabled for this job.')
                    if not accepted_current or not prepared_material or not prepared_material['reviewed'] or not event['critique'].strip():
                        raise ValueError('Prepare a material, inspect its swatch in a later turn, and provide a visual critique before publishing.')
                    result = shared_materials().publish(prepared_material['files'],prepared_material['metadata'],event['critique'],prepared_material['publication'])
                    published_materials += 1
                    prepared_asset = asset_preview = None
                    prepared_material = material_preview = None
                    event['result'] = 'Published reusable material: '+json.dumps({key:result[key] for key in ['id','name','files','author']})
                elif action == 'restore':
                    if accepted_revision is None: raise ValueError('There is no accepted checkpoint to restore.')
                    accepted_bytes = files.read_accepted(job_id, 'model.blend')
                    worker_bytes = broker.download(token, reservation, 'accepted.blend', FILE_LIMIT)
                    if hashlib.sha256(accepted_bytes).digest() != hashlib.sha256(worker_bytes).digest(): raise ValueError('The worker checkpoint changed after acceptance.')
                    scene_matches = accepted_current = False
                    prepared_asset = asset_preview = None
                    prepared_material = material_preview = None
                    if quality:
                        accepted_review = files.accepted_quality(job_id)
                        worker_glb = broker.download(token, reservation, 'accepted.glb', FILE_LIMIT)
                        if hashlib.sha256(worker_glb).hexdigest() != accepted_review['glbSha256']: raise ValueError('The worker accepted GLB changed.')
                    restore_code = ("import shutil\nshutil.copyfile('/workspace/artifacts/accepted.glb','/workspace/artifacts/model.glb')\nshutil.copyfile('/workspace/artifacts/accepted.blend','/workspace/artifacts/model.blend')\n" + FINAL_RENDER) if quality else EXPORT
                    execute("import bpy\nbpy.ops.wm.open_mainfile(filepath='/workspace/artifacts/accepted.blend', load_ui=False)\n" + restore_code, operation)
                    files.restore_accepted(job_id); revision = accepted_revision
                    scene_matches = accepted_current = True; reviewed_views.clear()
                    rendered = inspect(['hero', 'front', 'right'], '', operation + '-inspect')
                    current()
                    broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor, **({'qualityApproved': True} if quality else {}))
                    event['result'] = 'Restored the accepted scene and rendered it for comparison.'
            except ValueError as error:
                event['error'] = str(error)[:2500]
                if action in {'edit','load_material','load_asset','load_polyhaven','build_template'}: rendered = []; reviewed_views.clear()
            trace()
            history = workflow_history()
        else:
            if quality:
                finish_with_review('modeling_action_limit')
            else:
                status, progress = 'partial' if saved else 'failed', 'Action limit reached; preserved available files.'
    except InterruptedError:
        status, progress = 'cancelled', 'Stopped at your request or because the job is no longer active.'
    except Exception as error:
        events.append({'action': 'error', 'type': type(error).__name__, 'message': str(error)[:1500]})
        status, progress = 'partial' if saved else 'failed', 'Stopped because budget, availability, or execution limits prevented another safe step.'
    finally:
        for client in [exchange, asset_exchange, exchange_client, polyhaven]:
            if client is None: continue
            try: client.close()
            except Exception: pass  # Client cleanup must not skip compute shutdown.
        delivered_inspected = accepted_current
        try:
            if saved and accepted_revision is not None and not accepted_current:
                if quality: files.accepted_quality(job_id)
                files.restore_accepted(job_id)
                # Restore trusted ledger acceptance after a later candidate invalidated it.
                if status != 'cancelled':
                    current()
                    broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor, **({'qualityApproved': True} if quality else {}))
                delivered_inspected = True
                scene_matches = False
                progress += ' Retained the last accepted model.'
            if saved and accepted_current and scene_matches and status != 'cancelled':
                try:
                    heartbeat('Rendering the accepted model for delivery.')
                    execute(FINAL_RENDER, executor + '-final-render')
                    current()
                    delivered = {name: files.read_accepted(job_id, name) for name in BASE_NAMES}
                    delivered['preview.png'] = broker.download(token, reservation, 'preview.png', FILE_LIMIT)
                    image_data(delivered['preview.png'])
                    files.save(job_id, delivered); files.accept(job_id, **({'quality_review': accepted_review} if quality else {}))
                    broker.ledger.call('recordManagedCheckpoint', jobId=job_id, executorId=executor)
                    current()
                    broker.ledger.call('recordManagedAcceptance', jobId=job_id, executorId=executor, **({'qualityApproved': True} if quality else {}))
                except InterruptedError:
                    status, progress = 'cancelled', 'Stopped at your request; retained the accepted checkpoint.'
                except Exception:
                    progress += ' Retained the accepted checkpoint at its existing render resolution.'
                try:
                    if status == 'cancelled': raise InterruptedError('Cancelled')
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
