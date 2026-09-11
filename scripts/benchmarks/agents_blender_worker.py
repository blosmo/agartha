"""Temporary, network-isolated Blender worker for the Agents API comparison."""
from __future__ import annotations
import base64
import io
import json
from pathlib import Path
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from cloud.blender_billing.provider import ModalProvider
from cloud.blender_billing.image import build_image
from cloud.blender_billing.review import render_view_code
from cloud.blender_billing.export_review import render_export_view_code
from cloud.blender_billing.managed import EXPORT_CODE
import modal

request = json.load(sys.stdin)
output = Path(request['directory']).resolve()
allowed = (ROOT / '.agartha' / 'agents-api-benchmark').resolve()
if not output.is_relative_to(allowed):
    raise ValueError('Use the private benchmark output directory.')
output.mkdir(parents=True, exist_ok=True)
state_path = output / 'worker.json'
action = request['action']
if action == 'image':
    image = build_image()
    image.build(modal.App.lookup('agartha-paid-blender', create_if_missing=False))
    print(json.dumps({'imageId': image.object_id}))
    raise SystemExit(0)
state = json.loads(state_path.read_text()) if state_path.exists() else None
if action == 'start':
    if state is None:
        state = {'reservationId': 'agents-api-benchmark-' + str(uuid.uuid4()), 'claimedAt': time.time(), 'imageId': request['imageId']}
        state_path.write_text(json.dumps(state))
    provider = ModalProvider(modal, state['imageId'])
    state['workerId'] = provider.ensure_worker(state['reservationId'], 1, state['claimedAt'], 10)
    state_path.write_text(json.dumps(state))
    print(json.dumps({'workerId': state['workerId'], 'ready': provider.ready(state['workerId'])}))
    raise SystemExit(0)
if not state or 'workerId' not in state:
    raise ValueError('Start this run first.')
provider = ModalProvider(modal, state['imageId'])
worker = state['workerId']

def execute(code):
    if len(code.encode()) > 60_000:
        raise ValueError('Code exceeds benchmark limit.')
    response = provider.call(worker, {'jsonrpc':'2.0','id':str(uuid.uuid4()),'method':'tools/call','params':{'name':'execute_blender_code','arguments':{'code':code}}}, max_bytes=1_000_000, timeout=70)
    if response.get('error'):
        return {'isError':True,'content':[{'type':'text','text':json.dumps(response['error'])}]}
    return response['result']

if action == 'ready':
    result = {'ready': provider.ready(worker), 'exitCode': provider.poll(worker)}
elif action == 'execute':
    result = execute(request['code'])
elif action in {'render', 'review_export'}:
    view = request['view']
    if view not in ['front','right','hero']:
        raise ValueError('Invalid benchmark view.')
    name = 'review_' + view + ('.png' if action == 'review_export' else '.jpg')
    code = render_export_view_code(view) if action == 'review_export' else render_view_code(view)
    if action == 'render':
        code = code.replace("scene.render.image_settings.file_format = 'PNG'", "scene.render.image_settings.file_format = 'JPEG'\n        scene.render.image_settings.quality = 80")
        code = code.replace("args['view'] + '.png'", "args['view'] + '.jpg'")
    result = execute(code)
    if result.get('isError'):
        print(json.dumps(result)); raise SystemExit(0)
    sink = io.BytesIO(); provider.read_artifact(worker, name, sink, 8_000_000)
    data = sink.getvalue(); (output / name).write_bytes(data)
    encoded = base64.b64encode(data).decode()
    if action == 'render' and len(encoded) > 900_000:
        raise ValueError('Preview exceeds hosted tool-result payload allowance.')
    result = {'content':[{'type':'image','mimeType':'image/png' if action == 'review_export' else 'image/jpeg','data':encoded}]}
elif action == 'export':
    result = execute(EXPORT_CODE)
    if not result.get('isError'):
        saved=[]
        for name in ['model.glb','model.blend','preview.png']:
            sink=io.BytesIO(); provider.read_artifact(worker,name,sink,16_000_000)
            data=sink.getvalue(); (output/name).write_bytes(data); saved.append({'name':name,'bytes':len(data)})
        result={'content':[{'type':'text','text':json.dumps({'artifacts':saved})}]}
elif action == 'stop':
    provider.stop(worker)
    result={'exitCode':provider.poll(worker)}
    state['stopRequestedAt']=time.time();state_path.write_text(json.dumps(state))
else:
    raise ValueError('Unknown worker action.')
print(json.dumps(result))
