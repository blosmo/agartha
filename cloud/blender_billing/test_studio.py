from __future__ import annotations
import base64
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image

from .managed import ManagedFiles, preview_image
from .studio import run_studio, reference_views, REFERENCE_MODEL
from .durable_storage import StorageCoordinator


def raster(size=(1536,1536), fmt='JPEG'):
    stream=io.BytesIO(); Image.new('RGB',size,'#6d9ca6').save(stream,format=fmt); return stream.getvalue()


def action(name, code='', views=None):
    return {'action': name, 'code': code, 'objectName': 'Body', 'views': views or [], 'summary': name, 'critique': 'The silhouette and supports are coherent in the front and side renders.'}


class StudioTests(unittest.TestCase):
    def test_legacy_preview_does_not_change_reference_image_limits(self):
        limit = Image.MAX_IMAGE_PIXELS
        preview_image(raster((512, 512)))
        self.assertEqual(Image.MAX_IMAGE_PIXELS, limit)
        with tempfile.TemporaryDirectory() as directory:
            store = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            store.save_reference('job', raster(), REFERENCE_MODEL)
            self.assertEqual(len(reference_views(raster())), 4)

    def fixture(self, actions, *, restore_failure=False, verbose_export=False, share_materials=True, share_components=None):
        directory=tempfile.TemporaryDirectory(); self.addCleanup(directory.cleanup)
        store=ManagedFiles(Path(directory.name),StorageCoordinator(),lambda:None)
        files=Mock(wraps=store)
        if restore_failure: files.restore_accepted.side_effect=OSError('storage unavailable')
        broker=Mock(); timeline=[]; requests=[]
        broker.upload_material.return_value="shared-material-test.glb"
        row={'reservationId':'r','status':'running','brief':'An observatory','referenceMode':'generate','shareMaterials':share_materials, 'shareComponents':share_components}
        def ledger(name, **kwargs):
            timeline.append(name)
            if name=='heartbeatManagedJob': return {'active':True}
            return row.copy()
        broker.ledger.call.side_effect=ledger
        broker.owned.return_value={'status':'running','launchClaimedAt':time.time()*1000,'reservedMinutes':30}
        broker.start.side_effect=lambda *args:timeline.append('start')
        state={'model':b'BLENDER-A','accepted':None,'parent':None}
        def call(token,reservation,request,operation,limit):
            params=request['params'];code=params['arguments'].get('code','')
            if 'BROKEN' in code:return {'result':{'isError':True,'content':[{'text':'Geometry edit failed'}]}}
            if 'REVISION_B' in code:state['model']=b'BLENDER-B'
            if "mark_published_component(root," in code:
                import ast
                state['parent']=ast.literal_eval(code.split("mark_published_component(root,",1)[1].split(')',1)[0])
            if 'shutil.copyfile' in code:state['accepted']=state['model']
            if 'open_mainfile' in code:state['model']=state['accepted']
            output = 'STUDIO_OK:' + operation
            if verbose_export and 'bpy.ops.export_scene.gltf' in code:
                output += '\nExporting named mesh and material. ' * 2500
            result = {'result':{'content':[{'text':output}], 'structuredContent':{'objects':[{'name':'Body'}]}}}
            if len(json.dumps(result).encode()) > limit:
                raise ValueError('Worker response exceeds the configured limit')
            return result
        broker.call.side_effect=call
        def download(token,reservation,name,limit):
            if name=='component_parent.json':return json.dumps([state['parent']] if state['parent'] else []).encode()
            if name=='shared_component.glb':return b'glTF-component'
            if name=='component_source.blend':return b'BLENDER-component-only'
            if name=='shared_material.glb':return b'glTF-swatch'
            if name=='shared_source.blend':return b'BLENDER-material-only'
            if name=='model.blend':return state['model']
            if name=='accepted.blend':return state['accepted']
            if name=='model.glb':return b'glTF'+state['model']
            return raster((64,64),'PNG')
        broker.download.side_effect=download
        outputs=[{'model':REFERENCE_MODEL,'image':'data:image/jpeg;base64,'+base64.b64encode(raster()).decode(),'chargeCents':8},*actions]
        def stream(method,url,**kwargs):
            requests.append(kwargs['json']);timeline.append('inference-'+kwargs['json']['kind'])
            if not outputs:raise RuntimeError('budget exhausted')
            value=outputs.pop(0)
            response=Mock();response.iter_bytes.return_value=[json.dumps(value).encode()]
            context=Mock();context.__enter__=Mock(return_value=response);context.__exit__=Mock(return_value=False)
            return context
        client=Mock();client.__enter__=Mock(return_value=client);client.__exit__=Mock(return_value=False);client.stream.side_effect=stream
        video=patch('cloud.blender_billing.studio.render_turnaround',return_value=b'0000ftyp'+bytes(1000))
        video_mock=video.start();self.addCleanup(video.stop)
        with patch('cloud.blender_billing.studio.httpx.Client',return_value=client):
            run_studio(broker,files,'a'*64,'job','worker',row,Mock(),'https://example.test/inference','key')
        finish=[call.kwargs for call in broker.ledger.call.call_args_list if call.args[0]=='finishManagedJob'][-1]
        return store,broker,requests,timeline,finish,video_mock

    def test_component_search_keeps_all_ids_and_loads_a_reviewable_candidate(self):
        exchange=Mock()
        ids=['bundle-'+format(i,'064x') for i in range(25)]
        cursor='bundle-'+'f'*64
        exchange.search.return_value={'entries':[{'id':id,'modelId':'model-'+'b'*64,'metadata':{'name':'Window','description':'木'*500,'attribution':'作'*500}} for id in ids],'cursor':cursor}
        exchange.load.return_value=({'id':ids[0],'modelId':'model-'+'b'*64,'metadata':{'name':'Window','license':'CC0-1.0'}},b'glTF-component')
        steps=[action('search_assets',code='{"q":"window"}'),action('load_asset',code=json.dumps({'id':ids[0],'name':'Window A','location':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]})),action('accept'),action('finish')]
        with patch('cloud.blender_billing.asset_exchange.AssetExchange',return_value=exchange):
            store,broker,requests,timeline,finish,_=self.fixture(steps)
        history=requests[2]['history']
        for id in [*ids,cursor]: self.assertIn(id,history)
        self.assertLess(len(history.encode()),15000)
        self.assertLess(timeline.index('inference-modeling'),timeline.index('start'))
        self.assertEqual(finish['status'],'completed')
        self.assertTrue(finish['visuallyInspected'])
        codes=[call.args[2]['params']['arguments'].get('code','') for call in broker.call.call_args_list]
        self.assertTrue(any('import_component(path' in code for code in codes))
        self.assertFalse(any('open_mainfile' in code for code in codes))
        exchange.close.assert_called_once()

    def test_component_publication_requires_licensed_job_and_later_visual_review(self):
        metadata={'name':'Window','description':'Reusable oak frame'}
        share={'license':'MIT','attribution':'Example author'}
        exchange=Mock()
        exchange.publish.return_value={'id':'bundle-'+'a'*64,'modelId':'model-'+'b'*64,'metadata':{**metadata,**share},'source':{},'preview':{}}
        steps=[action('edit','REVISION_A'),action('prepare_asset',json.dumps(metadata)),action('publish_asset'),action('accept'),action('prepare_asset',json.dumps(metadata)),action('publish_asset'),action('finish')]
        with patch('cloud.blender_billing.asset_exchange.AssetExchange',return_value=exchange):
            store,_,requests,_,finish,_=self.fixture(steps,share_components=share)
        trace=json.loads(store.read('job','review.json'))
        self.assertIn('Accept and inspect',trace['actions'][1]['error'])
        self.assertIn('Prepare a component',trace['actions'][2]['error'])
        self.assertEqual(requests[6]['images'][-1]['label'],'render-detail')
        exchange.publish.assert_called_once()
        self.assertEqual(exchange.publish.call_args.args[1],{**metadata,**share})
        self.assertEqual(exchange.publish.call_args.args[0]['source'],b'BLENDER-component-only')
        self.assertEqual(finish['status'],'completed')
        self.assertNotIn('uploadToken',json.dumps(trace))
        exchange.reset_mock()
        with patch('cloud.blender_billing.asset_exchange.AssetExchange',return_value=exchange):
            self.fixture(steps)
        exchange.publish.assert_not_called()

    def test_new_component_publication_retains_parent_for_later_variants(self):
        first='bundle-'+'a'*64
        exchange=Mock()
        exchange.publish.side_effect=[{'id':id,'modelId':'model-'+'b'*64,'metadata':{},'source':{},'preview':{}} for id in [first,'bundle-'+'c'*64]]
        steps=[action('edit','REVISION_A'),action('accept'),action('prepare_asset','{"name":"Window","description":"Original"}'),action('publish_asset'),action('restore'),action('prepare_asset','{"name":"Window variant","description":"Variant"}'),action('publish_asset'),action('finish')]
        with patch('cloud.blender_billing.asset_exchange.AssetExchange',return_value=exchange):
            _,broker,_,_,finish,_=self.fixture(steps,share_components={'license':'MIT','attribution':'Author'})
        self.assertEqual(exchange.publish.call_args_list[1].args[1]['parentId'],first)
        codes=[call.args[2]['params']['arguments'].get('code','') for call in broker.call.call_args_list]
        self.assertTrue(any("mark_published_component(root,'"+first+"')" in code and 'save_as_mainfile' in code for code in codes))
        self.assertEqual(finish['status'],'completed')

    def test_component_edit_invalidates_prepared_publication(self):
        exchange=Mock()
        with patch('cloud.blender_billing.asset_exchange.AssetExchange',return_value=exchange):
            store,_,_,_,_,_=self.fixture([action('edit','REVISION_A'),action('accept'),action('prepare_asset','{"name":"Window","description":"Frame"}'),action('edit','REVISION_B'),action('publish_asset')],share_components={'license':'CC0-1.0','attribution':''})
        exchange.publish.assert_not_called()
        self.assertIn('Prepare a component',json.loads(store.read('job','review.json'))['actions'][4]['error'])

    def test_material_publication_requires_accepted_model_and_a_later_swatch_review(self):
        metadata={'name':'Original stone','description':'Fine joints','tags':['stone'],'license':'CC0-1.0','attribution':'','recipe':'Brick and Noise nodes','tileSize':2,'resolution':256}
        exchange=Mock()
        exchange.publish.return_value={'id':'material-'+'a'*64,'name':'Original stone','files':{},'author':'Agent'}
        with patch('cloud.blender_billing.material_exchange.MaterialExchange',return_value=exchange):
            store,_,requests,_,finish,_=self.fixture([
                action('edit','REVISION_A'), action('prepare_material',json.dumps(metadata)),
                action('publish_material'), action('accept'), action('prepare_material',json.dumps(metadata)),
                action('publish_material'), action('finish'),
            ])
        trace=json.loads(store.read('job','review.json'))
        self.assertIn('Accept and inspect',trace['actions'][1]['error'])
        self.assertIn('Prepare a material',trace['actions'][2]['error'])
        self.assertEqual(len(requests[6]['images']),8)
        self.assertEqual(requests[6]['images'][-1]['label'],'render-detail')
        exchange.publish.assert_called_once()
        self.assertEqual(exchange.publish.call_args.args[0]['source'],b'BLENDER-material-only')
        self.assertEqual(finish['status'],'completed')
        self.assertNotIn('uploadToken',json.dumps(trace))

    def test_edit_invalidates_a_prepared_material(self):
        metadata={'name':'Stone','description':'Fine joints','tags':['stone'],'license':'CC0-1.0','attribution':'','recipe':'Brick nodes','tileSize':2,'resolution':256}
        exchange=Mock()
        with patch('cloud.blender_billing.material_exchange.MaterialExchange',return_value=exchange):
            store,_,_,_,_,_=self.fixture([action('edit','REVISION_A'),action('accept'),action('prepare_material',json.dumps(metadata)),action('edit','REVISION_B'),action('publish_material'),action('accept'),action('finish')])
        exchange.publish.assert_not_called()
        self.assertIn('Prepare a material',json.loads(store.read('job','review.json'))['actions'][4]['error'])

    def test_material_search_does_not_start_compute(self):
        exchange=Mock()
        exchange.search.return_value={'entries':[],'cursor':'material-'+'a'*64}
        with patch('cloud.blender_billing.material_exchange.MaterialExchange',return_value=exchange):
            _,broker,requests,timeline,finish,_=self.fixture([action('search_materials','{"q":"wood"}'),action('edit','REVISION_A'),action('accept'),action('finish')])
        self.assertEqual(timeline[:timeline.index('start')].count('inference-modeling'),2)
        self.assertIn('material-'+'a'*64,requests[2]['history'])
        exchange.search.assert_called_once_with('wood',None)
        self.assertEqual(finish['status'],'completed')

    def test_private_job_cannot_publish_and_client_cleanup_cannot_skip_shutdown(self):
        exchange=Mock()
        exchange.search.return_value={'entries':[],'cursor':None}
        exchange.close.side_effect=RuntimeError('client cleanup failed')
        with patch('cloud.blender_billing.material_exchange.MaterialExchange',return_value=exchange):
            store,broker,_,_,finish,_=self.fixture([action('search_materials','{}'),action('edit','REVISION_A'),action('accept'),action('publish_material'),action('finish')],share_materials=False)
        self.assertIn('not enabled',json.loads(store.read('job','review.json'))['actions'][3]['error'])
        exchange.publish.assert_not_called()
        broker.stop.assert_called_once()
        self.assertEqual(finish['status'],'completed')

    def test_references_precede_compute_and_remain_on_every_action(self):
        store,broker,requests,timeline,finish,_=self.fixture([action('inspect_scene'),action('edit','REVISION_A'),action('accept'),action('finish')])
        self.assertLess(timeline.index('inference-reference'),timeline.index('start'))
        for request in requests[1:]:
            self.assertEqual([image['label'] for image in request['images'][:4]],['reference-front','reference-right','reference-rear','reference-hero'])
        self.assertEqual([image['label'] for image in requests[3]['images'][4:]],['render-hero','render-front','render-right'])
        self.assertEqual(finish['status'],'completed');self.assertTrue(finish['visuallyInspected'])
        self.assertTrue(store.read('job','model.glb').startswith(b'glTF'))
        self.assertEqual(json.loads(store.read('job','review.json'))['acceptedRevision'],1)
        broker.stop.assert_called_once()

    def test_finish_requires_acceptance_of_the_reviewed_candidate(self):
        store,_,_,_,finish,_=self.fixture([action('edit','REVISION_A'),action('finish'),action('accept'),action('finish')])
        trace=json.loads(store.read('job','review.json'))
        self.assertIn('Accept the current',trace['actions'][1]['error'])
        self.assertEqual(finish['status'],'completed')

    def test_verbose_export_can_checkpoint_without_expanding_model_context(self):
        store, broker, requests, _, finish, _ = self.fixture([
            action('edit', 'REVISION_A'), action('accept'), action('finish'),
        ], verbose_export=True)
        self.assertEqual(finish['status'], 'completed')
        self.assertTrue(finish['visuallyInspected'])
        self.assertTrue(store.read('job', 'model.glb').startswith(b'glTF'))
        self.assertLess(len(requests[2]['history'].encode()), 5000)
        self.assertTrue(all(call.args[-1] <= 1_000_000 for call in broker.call.call_args_list))

    def test_failed_later_edit_preserves_accepted_model_and_omits_wrong_video(self):
        store,broker,requests,_,finish,video=self.fixture([action('edit','REVISION_A'),action('accept'),action('edit','BROKEN')])
        self.assertEqual(store.read('job','model.blend'),b'BLENDER-A')
        self.assertTrue(finish['visuallyInspected']);self.assertEqual(finish['status'],'partial')
        video.assert_not_called();broker.stop.assert_called_once()
        self.assertEqual(len(requests[-1]['images']),4)  # no stale render evidence after failed mutation

    def test_storage_failure_during_cleanup_still_stops_compute(self):
        _,broker,_,_,finish,_=self.fixture([action('edit','REVISION_A'),action('accept'),action('edit','REVISION_B')],restore_failure=True)
        broker.stop.assert_called_once();self.assertEqual(finish['status'],'partial');self.assertFalse(finish['visuallyInspected'])

    def test_unaccepted_successful_edit_restores_accepted_delivery(self):
        store, broker, _, _, finish, video = self.fixture([
            action('edit', 'REVISION_A'), action('accept'), action('edit', 'REVISION_B'),
        ])
        self.assertEqual(store.read('job', 'model.blend'), b'BLENDER-A')
        self.assertEqual(store.read('job', 'model.glb'), b'glTFBLENDER-A')
        self.assertTrue(finish['visuallyInspected'])
        self.assertEqual(finish['status'], 'partial')
        video.assert_not_called()
        broker.stop.assert_called_once()

    def test_reference_quadrants_are_distinct_and_correctly_labeled(self):
        image=Image.new('RGB',(1536,1536));colors=['red','green','blue','yellow']
        for color,box in zip(colors,[(0,0,768,768),(768,0,1536,768),(0,768,768,1536),(768,768,1536,1536)]):image.paste(color,box)
        stream=io.BytesIO();image.save(stream,format='JPEG')
        results=reference_views(stream.getvalue())
        samples=[]
        for result in results:
            with Image.open(io.BytesIO(base64.b64decode(result['image'].split(',')[1]))) as part:samples.append(part.getpixel((200,200)))
        self.assertGreater(samples[0][0],240);self.assertGreater(samples[1][1],100);self.assertGreater(samples[2][2],240);self.assertGreater(samples[3][0],240)

    def test_accepted_files_and_reference_survive_new_candidates_and_video(self):
        with tempfile.TemporaryDirectory() as directory:
            files=ManagedFiles(Path(directory),StorageCoordinator(),lambda:None)
            files.save_reference('job',raster(),REFERENCE_MODEL)
            files.save('job',{'model.glb':b'glTF-A','model.blend':b'BLENDER-A','preview.png':b'A'});files.accept('job')
            files.save('job',{'model.glb':b'glTF-B','model.blend':b'BLENDER-B','preview.png':b'B'})
            self.assertEqual(files.read_accepted('job','model.blend'),b'BLENDER-A')
            files.restore_accepted('job');self.assertEqual(files.read('job','model.blend'),b'BLENDER-A')
            files.add_video('job',b'0000ftyp'+bytes(1000));files.restore_accepted('job')
            self.assertEqual(files.read('job','turnaround.mp4')[4:8],b'ftyp')
            self.assertTrue(files.read('job','reference.jpg').startswith(b'\xff\xd8'))
            with self.assertRaises(ValueError):files.read('job','../reference.jpg')
            with patch('cloud.blender_billing.managed.time.time',return_value=10**12):
                with self.assertRaises(ValueError):files.read('job','reference.jpg')
