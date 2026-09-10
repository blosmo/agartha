"""Reuse canonical shared asset discovery with the trusted material HTTP transport."""
import re
import math
from .material_exchange import MaterialExchange

BUNDLE_ID = re.compile(r'bundle-[a-f0-9]{64}\Z')


class AssetExchange(MaterialExchange):
    def _validate_template_metadata(self, metadata):
        template_id = metadata.get('templateId')
        if template_id is None:
            if 'templateParameters' in metadata: raise ValueError('Template parameters require a template ID.')
            return
        if not isinstance(template_id, str) or not re.fullmatch(r'template-[a-f0-9]{64}', template_id):
            raise ValueError('Choose a shared template ID.')
        template = self.template(template_id)
        definition = template.get('definition')
        if not isinstance(definition, dict) or definition.get('version') != 1 or not isinstance(definition.get('parameters'), dict):
            raise ValueError('Published template definition is invalid.')
        supplied = metadata.get('templateParameters')
        if not isinstance(supplied, dict) or set(supplied) != set(definition['parameters']):
            raise ValueError('Publish resolved template parameters, including defaults.')
        for key, spec in definition['parameters'].items():
            if not isinstance(key, str) or not isinstance(spec, dict): raise ValueError('Published template definition is invalid.')
            value = supplied[key]; typ = spec.get('type')
            if typ == 'number':
                valid = isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
            elif typ == 'integer': valid = isinstance(value, int) and not isinstance(value, bool)
            elif typ == 'boolean': valid = isinstance(value, bool)
            elif typ == 'color': valid = isinstance(value, str) and re.fullmatch(r'#[a-fA-F0-9]{6}', value) is not None
            elif typ == 'enum': valid = isinstance(spec.get('values'), list) and value in spec['values']
            else: valid = False
            if not valid or 'default' not in spec: raise ValueError('Invalid resolved template parameter.')
            if typ in {'number', 'integer'} and (value < spec.get('min') or value > spec.get('max')): raise ValueError('Invalid resolved template parameter.')
        if template.get('license') != 'CC0-1.0':
            if metadata.get('license') != template.get('license') or not metadata.get('attribution') or template.get('attribution') not in metadata['attribution']:
                raise ValueError('Preserve the procedural template license and attribution.')

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
        self._validate_template_metadata(metadata)
        parent_id = metadata.get('parentId')
        if parent_id:
            parent = self.api('/api/assets/'+parent_id)
            inherited = parent['metadata']
            if inherited.get('license') not in {'CC0-1.0','CC-BY-4.0','MIT'}:
                raise ValueError('Review this parent license through deliberate asset publication.')
            if inherited['license'] != 'CC0-1.0' and (metadata['license'] != inherited['license'] or inherited.get('attribution') and inherited['attribution'] not in metadata['attribution']):
                raise ValueError('Preserve the parent component license and attribution.')
        return self.publish_bundle(files,metadata,review,state,parent_id=parent_id)

    def search_templates(self, query='', cursor=None):
        import httpx,json
        if not isinstance(query,str) or len(query)>100 or cursor is not None and (not isinstance(cursor,str) or not re.fullmatch(r'template-[a-f0-9]{64}',cursor)):
            raise ValueError('Invalid template search.')
        params={'q':query}
        if cursor: params['cursor']=cursor
        status,_,raw=self._request('GET',str(httpx.URL(self.origin+'/api/assets/templates',params=params)),limit=250_000)
        if status!=200: raise ValueError('Template search redirected.')
        return json.loads(raw)

    def template(self, template_id):
        if not isinstance(template_id,str) or not re.fullmatch(r'template-[a-f0-9]{64}',template_id): raise ValueError('Choose a shared template ID.')
        return self.api('/api/assets/templates/'+template_id)
