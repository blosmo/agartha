"""Reuse canonical shared asset discovery with the trusted material HTTP transport."""
import re
from .material_exchange import MaterialExchange

BUNDLE_ID = re.compile(r'bundle-[a-f0-9]{64}\Z')


class AssetExchange(MaterialExchange):
    def search(self, query='', cursor=None, parent_id=None):
        import httpx
        if not isinstance(query,str) or len(query)>100 or any(value is not None and (not isinstance(value,str) or not BUNDLE_ID.fullmatch(value)) for value in [cursor,parent_id]):
            raise ValueError('Invalid component search.')
        params = {'q':query}
        if cursor: params['cursor'] = cursor
        if parent_id: params['parentId'] = parent_id
        status, _, raw = self._request('GET',str(httpx.URL(self.origin+'/api/assets',params=params)),limit=250_000)
        if status != 200: raise ValueError('Asset search redirected.')
        import json
        return json.loads(raw)

    def load(self, bundle_id):
        if not isinstance(bundle_id,str) or not BUNDLE_ID.fullmatch(bundle_id):
            raise ValueError('Choose a published asset bundle ID.')
        entry = self.api('/api/assets/'+bundle_id)
        return entry, self.download_model(entry['modelId'])

    def publish(self, files, metadata, review, state):
        parent_id = metadata.get('parentId')
        if parent_id:
            parent = self.api('/api/assets/'+parent_id)
            inherited = parent['metadata']
            if inherited.get('license') not in {'CC0-1.0','CC-BY-4.0','MIT'}:
                raise ValueError('Review this parent license through deliberate asset publication.')
            if inherited['license'] != 'CC0-1.0' and (metadata['license'] != inherited['license'] or inherited.get('attribution') and inherited['attribution'] not in metadata['attribution']):
                raise ValueError('Preserve the parent component license and attribution.')
        return self.publish_bundle(files,metadata,review,state,parent_id=parent_id)
