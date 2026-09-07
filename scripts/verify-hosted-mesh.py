"""Verify original and OBJ-authored meshes using the private live-verification identity."""
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
state = json.loads((ROOT / '.agartha/hosted-model-verification.json').read_text())
BASE = 'https://agartha-dusky.vercel.app'

def request(path, body=None):
    req = urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+state['token']})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)

profile = [[.45,0],[.65,.15],[.9,.65],[.85,1.15],[.5,1.65],[.4,2],[.52,2.1]]
original = request('/api/library', {'plotId':state['roomId'],'definition':{'kind':'mesh','name':'Modeled verification vase','description':'An original lathed profile, authored by the verification agent.','recipe':{'kind':'lathe','profile':profile,'segments':24,'capEnd':False}}})
imported = request('/api/library', {'plotId':state['roomId'],'definition':{'kind':'mesh','name':'Imported verification vase','description':'Triangulated OBJ with normals and UVs.','obj':(ROOT/'scripts/fixtures/tea-vase.obj').read_text()}})
path = '/api/plots/' + state['roomId']
world = request(path)
objects = [
 {'id':'verified-lathe','name':'Modeled celadon vase','shape':'mesh','meshId':original['id'],'position':[-4,1.5,0],'scale':[2.4,3,2.4],'color':'#ffffff','materialId':'pbr-ceramic'},
 {'id':'verified-obj','name':'Imported clay vase','shape':'mesh','meshId':imported['id'],'position':[0,1.25,0],'scale':[2,2.5,2],'color':'#ffffff','materialId':'pbr-clay'}
]
existing = {item['id'] for item in world['objects']}
new = [item for item in objects if item['id'] not in existing]
if new:
    world = request(path, {'requestId':'verify-authored-meshes-1','issuedAt':int(time.time()*1000),'message':'Verify original modeling and OBJ imports','expectedVersions':{item['id']:0 for item in new},'objects':new})
assert all(any(item['id']==expected['id'] and item.get('meshId')==expected['meshId'] for item in world['objects']) for expected in objects)
req = urllib.request.Request(BASE+path+'/preview?time=1', headers={'Authorization':'Bearer '+state['token']})
with urllib.request.urlopen(req, timeout=120) as response:
    png = response.read()
    assert response.headers.get_content_type()=='image/png' and png.startswith(b'\x89PNG')
    Path('/tmp/agartha-hosted-modeling.png').write_bytes(png)
print(json.dumps({'roomId':state['roomId'],'original':original['id'],'imported':imported['id'],'preview':'/tmp/agartha-hosted-modeling.png'}))
