"""Verify the approved hosted model workflow, retaining private retry state locally."""
import hashlib
import json
from pathlib import Path
import secrets
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

BASE = 'https://agartha-dusky.vercel.app'
ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.agartha/hosted-model-verification.json'
RECOVERY = ROOT / '.agartha/hosted-model-verification-recovery.txt'
STATE.parent.mkdir(exist_ok=True)
state = json.loads(STATE.read_text()) if STATE.exists() else {'token': secrets.token_hex(32)}

def save():
    STATE.touch(mode=0o600, exist_ok=True)
    STATE.chmod(0o600)
    STATE.write_text(json.dumps(state))

save()

def request(path, body=None, auth=True):
    headers = {'Content-Type': 'application/json'}
    if auth:
        headers['Authorization'] = 'Bearer ' + state['token']
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'{path}: HTTP {error.code}: {error.read(1000).decode()}') from None

if 'agentId' not in state:
    if not RECOVERY.exists():
        RECOVERY.touch(mode=0o600)
        RECOVERY.write_text(secrets.token_hex(32))
    actor = request('/api/session', {'agentToken':state['token'], 'recoveryToken':RECOVERY.read_text(), 'name':'Agartha model verification'})
    state['agentId'] = actor['agentId']
    save()
if 'roomId' not in state:
    summary = request('/api/plots?x=42&z=42&view=summary', auth=False)
    cell = summary['empty'][0]
    room = request('/api/plots', {'x':cell['x'], 'z':cell['z'], 'name':'Model verification'})
    state['roomId'] = room['id']
    save()
model_bytes = (ROOT / 'scripts/fixtures/Fox.glb').read_bytes()
if 'modelId' not in state:
    ticket = request('/api/models/upload-ticket', {'name':'Fox','description':'Unmodified Khronos Fox sample used to verify native imports.','source':'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox','license':'CC0-1.0 / CC-BY-4.0','attribution':'Model: PixelMannen. Animation: tomkranis. glTF conversion: AsoboStudio and scurest.'})
    upload = urlparse(ticket['uploadUrl'])
    if upload.scheme != 'https' or upload.hostname != 'quaint-ladybug-283.convex.site':
        raise RuntimeError('Upload target differs from the approved Convex deployment')
    req = urllib.request.Request(ticket['uploadUrl'], data=model_bytes, headers={'Content-Type':'model/gltf-binary','Authorization':'Bearer '+ticket['uploadToken']})
    with urllib.request.urlopen(req, timeout=90) as response:
        model = json.load(response)
    state['modelId'] = model['id']
    save()
expected_id = 'model-' + hashlib.sha256(model_bytes).hexdigest()
assert state['modelId'] == expected_id
room_path = '/api/plots/' + state['roomId']
world = request(room_path)
if not any(item['id'] == 'verified-fox' for item in world['objects']):
    world = request(room_path, {'requestId':'verify-native-fox-1','issuedAt':int(time.time()*1000),'message':'Verify imported model materials and animation','expectedVersions':{'verified-fox':0},'objects':[{'id':'verified-fox','name':'Imported fox','shape':'model','modelId':state['modelId'],'position':[4,2,4],'scale':[3,3,5],'color':'#ffffff','animation':{'clip':'Survey','speed':1,'paused':False}}]})
obj = next(item for item in world['objects'] if item['id'] == 'verified-fox')
assert obj['modelId'] == expected_id and obj['animation']['clip'] == 'Survey'
with urllib.request.urlopen(BASE + '/api/models/' + expected_id + '/file', timeout=30) as response:
    assert hashlib.sha256(response.read()).hexdigest() == expected_id[6:]
previews = []
for frame in (0, 1):
    req = urllib.request.Request(BASE + room_path + f'/preview?time={frame}&focus=verified-fox',headers={'Authorization':'Bearer '+state['token']})
    with urllib.request.urlopen(req, timeout=120) as response:
        png = response.read()
        assert response.headers.get_content_type() == 'image/png' and png.startswith(b'\x89PNG\r\n\x1a\n')
        file = Path(f'/tmp/agartha-hosted-fox-{frame}.png')
        file.write_bytes(png)
        previews.append({'time':frame,'path':str(file),'sha256':hashlib.sha256(png).hexdigest(),'snapshot':response.headers.get('X-Agartha-Snapshot')})
assert previews[0]['sha256'] != previews[1]['sha256']
print(json.dumps({'roomId':state['roomId'],'modelId':expected_id,'modelCredits':world.get('modelCredits'),'previews':previews}))
