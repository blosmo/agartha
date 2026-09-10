import hashlib
import unittest
import httpx
from .asset_exchange import AssetExchange

class AssetExchangeTests(unittest.TestCase):
    def test_public_component_discovery_provenance_and_verified_download(self):
        payload=b'glTF-component'
        bundle='bundle-'+'a'*64
        model='model-'+hashlib.sha256(payload).hexdigest()
        def handler(request):
            self.assertNotIn('authorization',request.headers)
            if request.url.path=='/api/assets':
                self.assertEqual(request.url.params['parentId'],bundle)
                return httpx.Response(200,json={'entries':[],'cursor':bundle})
            if request.url.path.endswith(bundle):return httpx.Response(200,json={'id':bundle,'modelId':model,'metadata':{'name':'Window','parentId':bundle}})
            if request.url.path.endswith('/file'):return httpx.Response(302,headers={'location':'https://test.convex.cloud/api/storage/component'})
            return httpx.Response(200,content=payload)
        exchange=AssetExchange('https://app.example','https://test.convex.site','secret',httpx.Client(transport=httpx.MockTransport(handler)))
        self.addCleanup(exchange.close)
        self.assertEqual(exchange.search('window',parent_id=bundle)['cursor'],bundle)
        entry,data=exchange.load(bundle)
        self.assertEqual(entry['metadata']['parentId'],bundle)
        self.assertEqual(data,payload)
        for value in ['https://evil.invalid','material-'+'a'*64]:
            with self.assertRaises(ValueError):exchange.load(value)

if __name__=='__main__': unittest.main()

class ComponentPublicationTests(unittest.TestCase):
    def test_unknown_template_rejected_before_any_upload_request(self):
        seen=[]
        def handler(request):
            seen.append(request)
            if request.url.path.endswith('/templates/'+'template-'+'a'*64): return httpx.Response(404)
            return httpx.Response(500)
        exchange=AssetExchange('https://app.example','https://test.convex.site','secret',httpx.Client(transport=httpx.MockTransport(handler)))
        self.addCleanup(exchange.close)
        files={'glb':b'glTF-bytes','source':b'BLENDER-bytes','preview':b'\x89PNG\r\n\x1a\nbytes'}
        metadata={'name':'Chair','license':'MIT','attribution':'Author','templateId':'template-'+'a'*64,'templateParameters':{}}
        with self.assertRaises(ValueError): exchange.publish(files,metadata,'Reviewed',{})
        self.assertFalse(any(r.url.path.endswith('/upload-ticket') or r.url.path.endswith('/model-upload') for r in seen))

    def test_template_parameters_and_license_are_checked_before_upload(self):
        import json
        template='template-'+'a'*64; seen=[]
        definition={'version':1,'name':'Chair','description':'','parameters':{'arms':{'type':'boolean','default':True},'width':{'type':'number','default':2,'min':1,'max':3}},'materials':{'wood':{'color':'#ffffff','roughness':.5,'metallic':0}},'parts':[{'kind':'box','name':'seat','position':[0,0,0],'size':[1,1,1],'material':'wood'}]}
        def handler(request):
            seen.append(request)
            if request.url.path.endswith('/templates/'+template): return httpx.Response(200,json={'id':template,'definition':definition,'license':'MIT','attribution':'Original author'})
            return httpx.Response(500)
        exchange=AssetExchange('https://app.example','https://test.convex.site','secret',httpx.Client(transport=httpx.MockTransport(handler)))
        self.addCleanup(exchange.close)
        files={'glb':b'glTF-bytes','source':b'BLENDER-bytes','preview':b'\x89PNG\r\n\x1a\nbytes'}
        base={'name':'Chair','license':'CC0-1.0','attribution':'','templateId':template,'templateParameters':{'arms':True,'width':2}}
        with self.assertRaisesRegex(ValueError,'license'): exchange.publish(files,base,'Reviewed',{})
        with self.assertRaisesRegex(ValueError,'resolved'): exchange.publish(files,{**base,'license':'MIT','attribution':'Original author','templateParameters':{'arms':True}},'Reviewed',{})
        self.assertFalse(any(r.url.path.endswith('/upload-ticket') or r.url.path.endswith('/model-upload') for r in seen))

    def test_parent_license_is_checked_and_preserved_on_bundle_ticket(self):
        import json
        parent='bundle-'+'a'*64
        seen=[]
        def handler(request):
            seen.append(request)
            if request.url.path.endswith(parent):return httpx.Response(200,json={'metadata':{'license':'MIT','attribution':'Original author'}})
            if request.url.path=='/api/models/upload-ticket':return httpx.Response(200,json={'uploadToken':'d'*64,'uploadUrl':'https://test.convex.site/model-upload'})
            if request.url.path=='/model-upload':return httpx.Response(200,json={'id':'model-'+'b'*64})
            if request.url.path=='/api/assets/upload-ticket':
                self.assertEqual(json.loads(request.content)['parentId'],parent)
                return httpx.Response(200,json={'uploadToken':'d'*64,'uploadUrls':{role:'https://test.convex.site/asset-upload/'+role for role in ['source','preview']}})
            if request.url.path=='/api/assets/finalize':return httpx.Response(200,json={'id':'bundle-'+'c'*64})
            return httpx.Response(200,json={'ok':True})
        exchange=AssetExchange('https://app.example','https://test.convex.site','secret',httpx.Client(transport=httpx.MockTransport(handler)))
        self.addCleanup(exchange.close)
        files={'glb':b'glTF-bytes','source':b'BLENDER-bytes','preview':b'\x89PNG\r\n\x1a\nbytes'}
        metadata={'name':'Window','description':'Variant','license':'CC0-1.0','attribution':'','parentId':parent}
        with self.assertRaisesRegex(ValueError,'Preserve'):exchange.publish(files,metadata,'Reviewed',{})
        self.assertEqual(len(seen),1)
        result=exchange.publish(files,{**metadata,'license':'MIT','attribution':'Original author; variant author'},'Reviewed',{})
        self.assertEqual(result['id'],'bundle-'+'c'*64)
        self.assertFalse(any(r.url.path=='/api/materials/library' for r in seen))
