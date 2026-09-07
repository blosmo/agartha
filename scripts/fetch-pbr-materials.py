"""Download a bounded, attributed CC0 material selection. Never called at runtime."""
import hashlib
import json
import pathlib
import subprocess
import tempfile
import urllib.request

assets = ['dark_wood','rosewood_veneer1','marble_01','grey_plaster','brown_leather','quatrefoil_jacquard_fabric','metal_plate','patterned_clay_plaster','fabric_pattern_05']
root = pathlib.Path(__file__).resolve().parents[1] / 'apps/web/public/materials'
root.mkdir(parents=True, exist_ok=True)
manifest = []
previous = {entry['id']:entry for entry in json.loads((root/'sources.json').read_text())} if (root/'sources.json').exists() else {}
def get(url):
    request = urllib.request.Request(url, headers={'User-Agent':'Agartha-MaterialLibrary/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()
for asset in assets:
    if asset in previous and all((root/asset/(channel+'.png')).exists() for channel in ['albedo','normal','arm']):
        manifest.append(previous[asset]); continue
    files = json.loads(get('https://api.polyhaven.com/files/' + asset))
    folder = root / asset
    folder.mkdir(exist_ok=True)
    sources = {}
    for channel, source in [('albedo','Diffuse'),('normal','nor_gl'),('arm','arm')]:
        entry = files['col_01' if source == 'Diffuse' and 'Diffuse' not in files else source]['1k']['jpg']
        url = entry['url']
        if not url.startswith('https://dl.polyhaven.org/'): raise ValueError('Unexpected asset host')
        raw = get(url)
        if hashlib.md5(raw).hexdigest() != entry['md5']: raise ValueError('Asset checksum mismatch')
        with tempfile.NamedTemporaryFile(suffix='.jpg') as temp:
            temp.write(raw); temp.flush()
            subprocess.run(['sips','-s','format','png',temp.name,'--out',str(folder / (channel + '.png'))], check=True, stdout=subprocess.DEVNULL)
        sources[channel] = {'url':url,'sourceMd5':entry['md5'],'sha256':hashlib.sha256((folder/(channel+'.png')).read_bytes()).hexdigest()}
    manifest.append({'id':asset,'source':'https://polyhaven.com/a/'+asset,'license':'CC0-1.0','resolution':1024,'maps':sources})
    print('Downloaded',asset,flush=True)
(root/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
