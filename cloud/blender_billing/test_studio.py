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
import httpx

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

    def fixture(self, actions, *, restore_failure=False, verbose_export=False, share_materials=True, share_components=None, workflow_version=None, reference_mode='generate', quality_verdicts=None, cancel_after=None, final_mutation=False, mutate_after_review=False, strategy_response=None, reviews=None, accept_seconds=None):
        directory=tempfile.TemporaryDirectory(); self.addCleanup(directory.cleanup)
        store=ManagedFiles(Path(directory.name),StorageCoordinator(),lambda:None)
        files=Mock(wraps=store)
        if restore_failure: files.restore_accepted.side_effect=OSError('storage unavailable')
        broker=Mock(); timeline=[]; requests=[]
        broker.upload_material.return_value="shared-material-test.glb"
        row={'reservationId':'r','status':'running','brief':'An observatory','referenceMode':reference_mode,'workflowVersion':workflow_version,'shareMaterials':share_materials, 'shareComponents':share_components}
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
            if 'REVISION_B' in code or final_mutation and operation == 'worker-final-render':state['model']=b'BLENDER-B'
            if 'REVISION_C' in code:state['model']=b'BLENDER-C'
            if "mark_published_component(root," in code:
                import ast
                state['parent']=ast.literal_eval(code.split("mark_published_component(root,",1)[1].split(')',1)[0])
            if "shutil.copyfile('/workspace/artifacts/model.blend'" in code:state['accepted']=state['model']
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
            if name=='component_template.json':return b'{}'
            if name=='component_parent.json':return json.dumps([state['parent']] if state['parent'] else []).encode()
            if name=='shared_component.glb':return b'glTF-component'
            if name=='component_source.blend':return b'BLENDER-component-only'
            if name=='shared_material.glb':return b'glTF-swatch'
            if name=='shared_source.blend':return b'BLENDER-material-only'
            if name=='model.blend':return state['model']
            if name=='accepted.blend':return state['accepted']
            if name=='accepted.glb':return b'glTF'+state['accepted']
            if name=='model.glb':return b'glTF'+state['model']
            return raster((64,64),'PNG')
        broker.download.side_effect=download
        review_outputs = list(reviews) if reviews is not None else None
        outputs=list(actions)
        verdicts=list(quality_verdicts or [])
        def stream(method,url,**kwargs):
            requests.append(kwargs['json']);timeline.append('inference-'+kwargs['json']['kind'])
            request=kwargs['json'];kind=request['kind']
            if kind=='reference': value={'model':REFERENCE_MODEL,'image':'data:image/jpeg;base64,'+base64.b64encode(raster()).decode(),'chargeCents':8}
            elif kind=='critique':
                value = review_outputs.pop(0) if review_outputs is not None else {'verdict':'ready','score':8,'summary':'Coherent proportions and materials across supplied views.','corrections':[]}
                if isinstance(value, Exception): raise value
            elif kind=='strategy':
                evidence='Visible coherent geometry with appropriate silhouette and structural proportions.'
                value={'strategy':strategy_response if strategy_response is not None else {'subjectClass':'architecture','styleUse':evidence,'geometryApproach':evidence,'proportions':[evidence],'stages':[evidence]*3,'acceptanceChecks':dict.fromkeys(['silhouette','proportions','construction','materials','presentation'],evidence)}}
            elif kind=='review':
                if not verdicts: raise RuntimeError('review budget exhausted')
                value=verdicts.pop(0)
                if isinstance(value,Exception): raise value
                if not isinstance(value, (bytes, httpx.Response)):
                    value={'candidateRevision':request['candidateRevision'],'glbSha256':request['glbSha256'],**value}
            else:
                if not outputs:raise RuntimeError('budget exhausted')
                value=outputs.pop(0)
                if isinstance(value,Exception): raise value
                if not isinstance(value, bytes) and value.get('action') == 'accept' and accept_seconds is not None:
                    broker.owned.return_value={'status':'running','launchClaimedAt':(time.time()+accept_seconds-1800)*1000,'reservedMinutes':30}
            if kind==cancel_after: row['cancelRequested']=True
            if kind=='review' and mutate_after_review: state['model']=b'BLENDER-B'
            if isinstance(value, httpx.Response):
                response=value
            elif isinstance(value, bytes):
                response=httpx.Response(200,content=value,request=httpx.Request(method,url))
            else:
                response=Mock();response.status_code=409 if value.get('code')=='quality_review_reserved' else 200;response.iter_bytes.return_value=[json.dumps(value).encode()]
            context=Mock();context.__enter__=Mock(return_value=response);context.__exit__=Mock(return_value=False)
            return context
        client=Mock();client.__enter__=Mock(return_value=client);client.__exit__=Mock(return_value=False);client.stream.side_effect=stream
        video=patch('cloud.blender_billing.studio.render_turnaround',return_value=b'0000ftyp'+bytes(1000))
        video_mock=video.start();self.addCleanup(video.stop)
        with patch('cloud.blender_billing.studio.httpx.Client',return_value=client):
            run_studio(broker,files,'a'*64,'job','worker',row,Mock(),'https://example.test/inference','key')
        finish=[call.kwargs for call in broker.ledger.call.call_args_list if call.args[0]=='finishManagedJob'][-1]
        return store,broker,requests,timeline,finish,video_mock

    def test_v3_gateway_failure_preserves_only_bounded_diagnostics_and_stops(self):
        error = 'The reviewer response could not be validated. ' + 'x' * 600
        failure = httpx.Response(502, json={
            'error': error, 'code': 'quality_review_invalid',
            'images': ['DO_NOT_PERSIST_IMAGE'], 'context': 'DO_NOT_PERSIST_CONTEXT',
            'body': 'DO_NOT_PERSIST_PROVIDER',
        }, request=httpx.Request('POST', 'https://example.test/inference'))
        store, broker, requests, _, finish, _ = self.fixture([
            action('edit', 'REVISION_A'), action('accept'), action('edit', 'REVISION_B'), action('accept'),
        ], workflow_version=3, reference_mode='none', quality_verdicts=[failure])
        trace = json.loads(store.read('job', 'review.json'))
        event = next(item for item in trace['actions'] if item['action'] == 'error')
        self.assertEqual(event['type'], 'InferenceProtocolError')
        details = json.loads(event['message'].removeprefix('Inference request failed: '))
        self.assertEqual(details, {
            'status': 502, 'kind': 'review', 'operationId': 'worker-review-1',
            'error': error[:500], 'code': 'quality_review_invalid',
        })
        self.assertNotIn('DO_NOT_PERSIST', json.dumps(trace))
        self.assertEqual(sum(item['kind'] == 'review' for item in requests), 1)
        self.assertEqual(requests[-1]['kind'], 'review')
        self.assertEqual(trace['reviews'][0]['status'], 'attempted')
        self.assertEqual(finish['status'], 'partial')
        self.assertFalse(finish['visuallyInspected'])
        broker.stop.assert_called_once()

    def test_independent_feedback_blocks_self_acceptance_and_is_cached_per_revision(self):
        revise={'verdict':'revise','score':5,'summary':'Floating supports.','corrections':[{'area':'structure','issueId':'front-leg-floating','evidence':'Front legs float in render-front.','change':'Extend legs to the floor.'}]}
        ready={'verdict':'ready','score':8,'summary':'Connected supports.','corrections':[]}
        store,_,requests,_,finish,_=self.fixture([action('edit','REVISION_A'),action('accept'),action('accept'),action('edit','REVISION_B'),action('accept'),action('finish')],reviews=[revise,ready])
        calls=[request for request in requests if request['kind']=='critique']
        self.assertEqual(len(calls),2)
        self.assertTrue(all('history' not in request for request in calls))
        trace=json.loads(store.read('job','review.json'))
        self.assertIn('Extend legs',trace['actions'][1]['error'])
        self.assertEqual(trace['acceptedRevision'],2)
        self.assertEqual(finish['status'],'completed')
        self.assertEqual(len(trace['quality']['reviews']),2)

    def test_stalled_reviews_stop_and_preserve_an_unaccepted_candidate_honestly(self):
        revise={'verdict':'revise','score':5,'summary':'Floating supports.','corrections':[{'area':'structure','issueId':'front-leg-floating','evidence':'Front legs float.','change':'Rebuild the supports.'}]}
        steps=[item for _ in range(5) for item in [action('edit','REVISION_A'),action('accept')]]
        store,broker,requests,_,finish,_=self.fixture(steps,reviews=[revise]*5)
        self.assertEqual(len([r for r in requests if r['kind']=='critique']),3)
        self.assertEqual(finish['status'],'partial')
        self.assertFalse(finish['visuallyInspected'])
        self.assertIn('no improvement',finish['progress'])
        self.assertIn('Change the construction approach',json.loads(store.read('job','review.json'))['actions'][3]['error'])
        broker.stop.assert_called_once()

    def test_four_review_cap_restores_accepted_files_after_improving_rejections(self):
        ready={'verdict':'ready','score':8,'summary':'Good model.','corrections':[]}
        rejected=[{'verdict':'revise','score':score,'summary':'Supports need work.','corrections':[{'area':'structure','issueId':'front-leg-floating','evidence':'Leg connection is weak.','change':'Rebuild the connection.'}]} for score in [4,5,6]]
        steps=[action('edit','REVISION_A'),action('accept')]+[item for _ in range(4) for item in [action('edit','REVISION_B'),action('accept')]]
        store,broker,requests,_,finish,_=self.fixture(steps,reviews=[ready,*rejected])
        self.assertEqual(len([r for r in requests if r['kind']=='critique']),4)
        self.assertEqual(finish['status'],'partial')
        self.assertTrue(finish['visuallyInspected'])
        self.assertEqual(store.read('job','model.blend'),b'BLENDER-A')
        self.assertIn('Review limit',finish['progress'])
        trace=json.loads(store.read('job','review.json'))
        self.assertEqual(trace['acceptedRevision'],1)
        self.assertEqual(trace['quality']['reviews'][-1]['candidateRevision'],4)
        broker.stop.assert_called_once()

    def test_different_material_defects_do_not_trigger_false_stall(self):
        rejected=[{'verdict':'revise','score':6,'summary':'Fix material.','corrections':[{'area':'materials','issueId':issue,'evidence':'Visible in front view.','change':'Correct this specific material defect.'}]} for issue in ['wood-grain-oversized','glass-opaque','metal-too-rough']]
        ready={'verdict':'ready','score':8,'summary':'Materials corrected.','corrections':[]}
        steps=[item for _ in range(4) for item in [action('edit','REVISION_A'),action('accept')]]+[action('finish')]
        store,_,requests,_,finish,_=self.fixture(steps,reviews=[*rejected,ready])
        self.assertEqual(len([r for r in requests if r['kind']=='critique']),4)
        self.assertEqual(finish['status'],'completed')
        self.assertIsNone(json.loads(store.read('job','review.json'))['quality']['stopReason'])

    def test_slow_acceptance_decision_cannot_spend_the_review_delivery_reserve(self):
        store,broker,requests,_,finish,_=self.fixture([action('edit','REVISION_A'),action('accept')],accept_seconds=300)
        self.assertEqual(len([r for r in requests if r['kind']=='critique']),0)
        self.assertEqual(finish['status'],'partial')
        self.assertFalse(finish['visuallyInspected'])
        self.assertIn('preserve delivery time',finish['progress'])
        self.assertTrue(store.read('job','model.glb').startswith(b'glTF'))
        broker.stop.assert_called_once()

    def test_malformed_review_never_approves_or_continues_spending(self):
        for review in [
            {'verdict':'ready','score':2,'summary':'Poor','corrections':[]},
            {'verdict':'revise','score':5,'summary':'Fix it','corrections':[]},
            {'verdict':'revise','score':5,'summary':'Fix it','corrections':[{'area':'structure'}]},
        ]:
            with self.subTest(review=review):
                store,broker,requests,_,finish,_=self.fixture([action('edit','REVISION_A'),action('accept'),action('finish')],reviews=[review])
                self.assertFalse(finish['visuallyInspected'])
                self.assertEqual(finish['status'],'partial')
                self.assertIsNone(json.loads(store.read('job','review.json'))['acceptedRevision'])
                self.assertEqual(len([r for r in requests if r['kind']=='critique']),1)
                broker.stop.assert_called_once()

    def test_unavailable_review_does_not_accept_or_retry(self):
        store,broker,requests,_,finish,_=self.fixture([action('edit','REVISION_A'),action('accept'),action('finish')],reviews=[RuntimeError('budget exhausted')])
        self.assertFalse(finish['visuallyInspected'])
        self.assertEqual(finish['status'],'partial')
        self.assertIsNone(json.loads(store.read('job','review.json'))['acceptedRevision'])
        self.assertEqual(len([r for r in requests if r['kind']=='critique']),1)
        broker.stop.assert_called_once()

    def test_restore_does_not_reuse_an_old_revision_review_for_a_new_edit(self):
        ready={'verdict':'ready','score':8,'summary':'Coherent model.','corrections':[]}
        steps=[action('edit','REVISION_A'),action('accept'),action('edit','REVISION_B'),action('accept'),action('restore'),action('edit','REVISION_A'),action('accept'),action('finish')]
        revise={'verdict':'revise','score':5,'summary':'Broken support.','corrections':[{'area':'structure','issueId':'front-leg-floating','evidence':'Gap in front view.','change':'Fix the gap.'}]}
        store,_,requests,_,finish,_=self.fixture(steps,reviews=[ready,revise,ready])
        self.assertEqual([r['operationId'] for r in requests if r['kind']=='critique'],['worker-review-1','worker-review-2','worker-review-3'])
        self.assertEqual(json.loads(store.read('job','review.json'))['acceptedRevision'],3)
        self.assertEqual(finish['status'],'completed')

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
        self.assertEqual([r for r in requests if r['kind'] != 'critique'][6]['images'][-1]['label'],'render-detail')
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
        self.assertEqual(len([r for r in requests if r['kind'] != 'critique'][6]['images']),8)
        self.assertEqual([r for r in requests if r['kind'] != 'critique'][6]['images'][-1]['label'],'render-detail')
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
