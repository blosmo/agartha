import hashlib
import json
import unittest
import httpx
from .material_exchange import MaterialExchange


class MaterialExchangeTests(unittest.TestCase):
    def client(self,handler):
        client=httpx.Client(transport=httpx.MockTransport(handler))
        exchange=MaterialExchange('https://app.example/api/blender/inference','https://test.convex.site','private-agent-token',client)
        self.addCleanup(exchange.close)
        return exchange

    def test_public_search_and_verified_download_do_not_forward_credentials(self):
        payload=b'glTF-material'
        model='model-'+hashlib.sha256(payload).hexdigest()
        material='material-'+'a'*64
        requests=[]
        def handler(request):
            requests.append(request)
            self.assertNotIn('authorization',request.headers)
            if request.url.path=='/api/materials/library': return httpx.Response(200,json={'entries':[],'cursor':material})
            if request.url.path.endswith(material): return httpx.Response(200,json={'id':material,'modelId':model,'tileSize':2})
            if request.url.path.endswith('/file'): return httpx.Response(302,headers={'location':'https://test.convex.cloud/api/storage/id'})
            return httpx.Response(200,content=payload)
        exchange=self.client(handler)
        self.assertEqual(exchange.search('wood')['cursor'],material)
        self.assertEqual(exchange.load(material)[1],payload)
        self.assertEqual(len(requests),4)

    def test_rejects_untrusted_redirect_and_changed_content(self):
        material='material-'+'a'*64
        for redirect,payload in [('https://private.invalid/secret',b'glTF'),('https://test.convex.cloud/api/storage/id',b'glTF-bad')]:
            requests=[]
            def handler(request):
                requests.append(request)
                if request.url.path.endswith(material):return httpx.Response(200,json={'modelId':'model-'+'b'*64})
                if request.url.path.endswith('/file'):return httpx.Response(302,headers={'location':redirect})
                return httpx.Response(200,content=payload)
            with self.assertRaises(ValueError):self.client(handler).load(material)
            self.assertFalse(any(r.url.host=='private.invalid' for r in requests))

    def test_resumes_scoped_uploads_without_republishing_or_changing_review(self):
        requests=[];fail_preview=True
        def handler(request):
            nonlocal fail_preview
            requests.append(request)
            if request.url.host=='app.example':self.assertEqual(request.headers['authorization'],'Bearer private-agent-token')
            else:self.assertEqual(request.headers['authorization'],'Bearer '+'d'*64)
            path=request.url.path
            if path=='/api/models/upload-ticket':return httpx.Response(200,json={'uploadToken':'d'*64,'uploadUrl':'https://test.convex.site/model-upload'})
            if path=='/model-upload':return httpx.Response(200,json={'id':'model-'+'b'*64})
            if path=='/api/assets/upload-ticket':return httpx.Response(200,json={'uploadToken':'d'*64,'uploadUrls':{role:'https://test.convex.site/asset-upload/'+role for role in ['source','preview']}})
            if path=='/asset-upload/preview' and fail_preview:
                fail_preview=False
                return httpx.Response(503,json={'error':'temporary'})
            if path.startswith('/asset-upload/'):return httpx.Response(200,json={'ok':True})
            if path=='/api/assets/finalize':return httpx.Response(200,json={'id':'bundle-'+'c'*64})
            body=json.loads(request.content)
            self.assertEqual(body['review'],'Reviewed seams')
            return httpx.Response(200,json={'id':'material-'+'a'*64})
        exchange=self.client(handler)
        files={'glb':b'glTF-bytes','source':b'BLENDER-bytes','preview':b'\x89PNG\r\n\x1a\nbytes'}
        metadata={'name':'Oak','description':'Boards','license':'CC0-1.0','attribution':'','tags':['wood'],'recipe':'Native nodes','tileSize':2}
        state={}
        with self.assertRaises(ValueError):exchange.publish(files,metadata,'Reviewed seams',state)
        result=exchange.publish(files,metadata,'Different retry critique',state)
        count=len(requests)
        self.assertEqual(exchange.publish(files,metadata,'Third retry',state),result)
        self.assertEqual(len(requests),count)
        self.assertEqual(sum(r.url.path=='/api/models/upload-ticket' for r in requests),1)
        self.assertEqual(sum(r.url.path=='/asset-upload/source' for r in requests),1)
        with self.assertRaises(ValueError):exchange.publish(files,{**metadata,'name':'Changed'},'review',state)

    def test_rejects_upload_tickets_for_arbitrary_origins(self):
        def handler(request):return httpx.Response(200,json={'uploadToken':'d'*64,'uploadUrl':'https://evil.example/model-upload'})
        exchange=self.client(handler)
        with self.assertRaisesRegex(ValueError,'outside'):
            exchange.publish({'glb':b'glTF','source':b'BLENDER','preview':b'\x89PNG\r\n\x1a\n'}, {'name':'Oak','description':'Boards','license':'CC0-1.0','attribution':''},'review',{})


if __name__=='__main__':unittest.main()
