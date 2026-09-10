"""Trusted material-library transport. Credentials stay outside Blender."""
from __future__ import annotations
import hashlib
import json
import re
from typing import Any
from urllib.parse import urlsplit
import httpx

MATERIAL_ID = re.compile(r'material-[a-f0-9]{64}\Z')
MODEL_ID = re.compile(r'model-[a-f0-9]{64}\Z')


class MaterialExchange:
    def __init__(self, api_url: str, storage_origin: str, token: str, client=None):
        parsed = urlsplit(api_url)
        storage = urlsplit(storage_origin)
        if parsed.scheme != 'https' or storage.scheme != 'https' or parsed.username or storage.username:
            raise ValueError('Material services require trusted HTTPS origins.')
        self.origin = f'https://{parsed.netloc}'
        self.storage_origin = f'https://{storage.netloc}'
        self.storage_hosts = {storage.netloc, storage.netloc.removesuffix('.site')+'.cloud'} if storage.netloc.endswith('.convex.site') else {storage.netloc}
        self.token = token
        self.client = client or httpx.Client(timeout=30, follow_redirects=False)

    def _request(self, method, url, *, payload=None, data=None, credential=None, content_type='application/json', limit=100_000):
        headers = {'Content-Type': content_type}
        if credential: headers['Authorization'] = 'Bearer '+credential
        with self.client.stream(method, url, headers=headers, json=payload, content=data, follow_redirects=False) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                return response.status_code, response.headers.get('location', ''), b''
            raw = bytearray()
            for chunk in response.iter_bytes():
                raw.extend(chunk)
                if len(raw) > limit: raise ValueError('Material service response exceeds its limit.')
            if response.status_code >= 400:
                raise ValueError(f'Material service rejected the request ({response.status_code}).')
            return response.status_code, '', bytes(raw)

    def api(self, path, payload=None):
        if not path.startswith('/api/') or '?' in path or '#' in path:
            raise ValueError('Invalid material API path.')
        status, _, raw = self._request('POST' if payload is not None else 'GET', self.origin+path,
                                       payload=payload, credential=self.token if payload is not None else None)
        if status != 200: raise ValueError('Material API redirected or returned an unexpected status.')
        return json.loads(raw)

    def search(self, query='', cursor=None):
        if not isinstance(query,str) or len(query)>100 or cursor is not None and not MATERIAL_ID.fullmatch(cursor):
            raise ValueError('Invalid shared material search.')
        params = {'q': query}
        if cursor: params['cursor'] = cursor
        url = str(httpx.URL(self.origin+'/api/materials/library', params=params))
        status, _, raw = self._request('GET', url)
        if status != 200: raise ValueError('Material search redirected.')
        return json.loads(raw)

    def load(self, material_id):
        if not isinstance(material_id,str) or not MATERIAL_ID.fullmatch(material_id):
            raise ValueError('Choose a shared material ID from search_materials.')
        entry = self.api('/api/materials/library/'+material_id)
        return entry, self.download_model(entry.get('modelId'))

    def download_model(self, model_id):
        if not isinstance(model_id,str) or not MODEL_ID.fullmatch(model_id):
            raise ValueError('Material has no valid swatch.')
        status, target, raw = self._request('GET', self.origin+'/api/models/'+model_id+'/file', limit=16_000_000)
        if status == 302:
            parsed = urlsplit(target)
            if parsed.scheme != 'https' or parsed.netloc not in self.storage_hosts or parsed.username or not parsed.path.startswith('/api/storage/'):
                raise ValueError('Material download is outside trusted storage.')
            status, _, raw = self._request('GET', target, limit=16_000_000)
        if status != 200 or not raw.startswith(b'glTF') or 'model-'+hashlib.sha256(raw).hexdigest()!=model_id:
            raise ValueError('Shared material content does not match its immutable model ID.')
        return raw

    def _upload(self, url, ticket, data, content_type, expected_path):
        if url != self.storage_origin+expected_path or not re.fullmatch('[a-f0-9]{64}', ticket):
            raise ValueError('Upload ticket points outside the configured material storage.')
        status, _, raw = self._request('POST', url, data=data, credential=ticket, content_type=content_type)
        if status != 200: raise ValueError('Material upload redirected.')
        return json.loads(raw)

    def publish(self, files, metadata, review, state):
        bundle = self.publish_bundle(files,metadata,review,state)
        if 'result' not in state:
            state['result'] = self.api('/api/materials/library',{**metadata,'bundleId':bundle['id'],'review':state['review']})
        return state['result']

    def publish_bundle(self, files, metadata, review, state, *, parent_id=None):
        """Resume the same scoped upload tickets after a recoverable response failure."""
        if set(files) != {'glb','source','preview'} or any(not isinstance(v,bytes) or not v or len(v)>16_000_000 for v in files.values()):
            raise ValueError('Provide a bounded material GLB, material-only Blender source and preview.')
        if not files['glb'].startswith(b'glTF') or not files['source'].startswith(b'BLENDER') or not files['preview'].startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Invalid material bundle signatures.')
        fingerprint = hashlib.sha256(json.dumps(metadata,sort_keys=True).encode()+b''.join(hashlib.sha256(files[k]).digest() for k in sorted(files))).hexdigest()
        if state.get('fingerprint',fingerprint)!=fingerprint: raise ValueError('Publication state belongs to different material content.')
        state['fingerprint'] = fingerprint
        state.setdefault('review',review)
        if 'bundle' in state: return state['bundle']
        if 'modelTicket' not in state:
            state['modelTicket'] = self.api('/api/models/upload-ticket', {key:metadata[key] for key in ['name','description','license','attribution']})
        if 'model' not in state:
            ticket = state['modelTicket']
            state['model'] = self._upload(ticket['uploadUrl'],ticket['uploadToken'],files['glb'],'model/gltf-binary','/model-upload')
        if 'assetTicket' not in state:
            state['assetTicket'] = self.api('/api/assets/upload-ticket',{
                **{key:metadata[key] for key in ['name','description','license','attribution']},
                'modelId':state['model']['id'],
                **({'parentId':parent_id} if parent_id else {}),
                **{key:{'bytes':len(files[key]),'sha256':hashlib.sha256(files[key]).hexdigest()} for key in ['source','preview']},
            })
        ticket = state['assetTicket']
        for role,content_type in [('source','application/x-blender'),('preview','image/png')]:
            if not state.get(role+'Uploaded'):
                self._upload(ticket['uploadUrls'][role],ticket['uploadToken'],files[role],content_type,'/asset-upload/'+role)
                state[role+'Uploaded'] = True
        if 'bundle' not in state: state['bundle'] = self.api('/api/assets/finalize',{'uploadToken':ticket['uploadToken']})
        return state['bundle']

    def close(self):
        self.client.close()
