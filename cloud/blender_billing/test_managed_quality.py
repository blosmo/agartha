from __future__ import annotations
import hashlib
import httpx
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from .managed import ManagedFiles, recover_managed_files, run_managed, quality_approved
from .durable_storage import StorageCoordinator
from . import test_studio
from .test_studio import action, raster
from .studio import FINAL_RENDER


def verdict(accepted=True, **overrides):
    evidence='The front and right views show continuous profiles and coherent connected forms.'
    return {'accepted':accepted,'criteria':{key:{'pass':accepted,'evidence':evidence} for key in ['silhouette','proportions','construction','materials','presentation']},'defects':[] if accepted else [{'severity':'major','criterion':'proportions','description':'The front legs are too short compared with the body height in the front view.'}],**overrides}


class ManagedQualityTests(unittest.TestCase):
    fixture = test_studio.StudioTests.fixture

    def run_quality(self, actions, **options):
        return self.fixture(actions,workflow_version=3,reference_mode='none',**options)

    def test_strategy_precedes_compute_without_reference_and_review_omits_history(self):
        store,broker,requests,timeline,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('finish')],quality_verdicts=[verdict()])
        self.assertNotIn('inference-reference',timeline)
        self.assertLess(timeline.index('inference-strategy'),timeline.index('start'))
        critic=next(item for item in requests if item['kind']=='review')
        self.assertNotIn('history',critic)
        self.assertEqual([image['label'] for image in critic['images']],['export-hero','export-front','export-right'])
        self.assertEqual(critic['glbSha256'],hashlib.sha256(b'glTFBLENDER-A').hexdigest())
        self.assertTrue(all(item['protocol']==3 for item in requests))
        self.assertTrue(all('strategy' in item for item in requests if item['kind']=='modeling'))
        trace=json.loads(store.read('job','review.json'))
        self.assertEqual(trace['protocol'],3);self.assertIsNone(trace['referenceModel'])
        self.assertEqual(trace['reviews'][0]['status'],'reviewed')
        self.assertEqual(store.accepted_quality('job')['candidateRevision'],1)
        self.assertEqual(finish['status'],'completed');self.assertTrue(finish['visuallyInspected'])
        self.assertTrue(all(call.kwargs['qualityApproved'] for call in broker.ledger.call.call_args_list if call.args[0]=='recordManagedAcceptance'))
        codes=[call.args[2]['params']['arguments'].get('code','') for call in broker.call.call_args_list]
        self.assertEqual(sum('bpy.ops.import_scene.gltf' in code for code in codes),3)

    def test_invalid_settled_model_action_gets_a_new_bounded_correction(self):
        failure = httpx.Response(502, json={'code': 'inference_action_invalid', 'error': 'Invalid component parameters for search_templates.'}, request=httpx.Request('POST', 'https://example.test/inference'))
        store, broker, requests, _, finish, _ = self.run_quality([failure, action('edit', 'REVISION_A'), action('accept'), action('finish')], quality_verdicts=[verdict()])
        modeling = [item for item in requests if item['kind'] == 'modeling']
        self.assertEqual(finish['status'], 'completed')
        self.assertEqual(modeling[0]['operationId'], 'worker-studio-0')
        self.assertEqual(modeling[1]['operationId'], 'worker-studio-1')
        self.assertIn('search_templates', modeling[1]['history'])
        self.assertEqual(json.loads(store.read('job', 'review.json'))['actions'][0]['action'], 'invalid_action')
        self.assertFalse(any(call.args[3] == 'worker-tool-0' for call in broker.call.call_args_list))

    def test_ambiguous_and_unrecognized_model_failures_never_invite_correction(self):
        for status, code in [(503, 'inference_action_invalid'), (503, 'inference_usage_reconciliation'), (502, 'inference_incomplete')]:
            failure = httpx.Response(status, json={'code': code, 'error': 'Stopped'}, request=httpx.Request('POST', 'https://example.test/inference'))
            _, broker, requests, _, finish, _ = self.run_quality([failure, action('edit', 'REVISION_A')])
            self.assertEqual([item['kind'] for item in requests], ['strategy', 'modeling'])
            self.assertEqual(finish['status'], 'failed')
            broker.start.assert_not_called()

    def test_repeated_invalid_model_actions_stop_after_two_corrections(self):
        failures = [httpx.Response(502, json={'code': 'inference_action_invalid', 'error': 'Invalid action'}, request=httpx.Request('POST', 'https://example.test/inference')) for _ in range(3)]
        _, broker, requests, _, finish, _ = self.run_quality([*failures, action('edit', 'REVISION_A')])
        self.assertEqual(sum(item['kind'] == 'modeling' for item in requests), 3)
        self.assertEqual(finish['status'], 'failed'); broker.start.assert_not_called()

    def test_asset_search_preserves_prior_scene_inspection_in_history(self):
        with patch('cloud.blender_billing.asset_exchange.AssetExchange') as exchange:
            exchange.return_value.search.return_value = {'entries': [], 'cursor': None}
            _, _, requests, _, finish, _ = self.run_quality([action('inspect_scene'), action('search_assets', '{"q":"elephant"}'), action('edit', 'REVISION_A'), action('accept'), action('finish')], quality_verdicts=[verdict()])
        modeling = [item for item in requests if item['kind'] == 'modeling']
        self.assertIn('inspect_scene', modeling[2]['history'])
        self.assertIn('search_assets', modeling[2]['history'])
        self.assertEqual(finish['status'], 'completed')

    def test_escaped_search_metadata_keeps_ids_cursor_and_recent_inspection(self):
        ids = ['bundle-' + format(i, '064x') for i in range(25)]
        cursor = 'bundle-' + 'f' * 64
        entries = [{'id': key, 'metadata': {'name': '"' * 80, 'description': '"' * 80}} for key in ids]
        with patch('cloud.blender_billing.asset_exchange.AssetExchange') as exchange:
            exchange.return_value.search.return_value = {'entries': entries, 'cursor': cursor}
            _, _, requests, _, finish, _ = self.run_quality([action('inspect_scene'), action('search_assets', '{"q":"elephant"}'), action('edit', 'REVISION_A'), action('accept'), action('finish')], quality_verdicts=[verdict()])
        history = [item for item in requests if item['kind'] == 'modeling'][2]['history']
        self.assertTrue(history.startswith('Candidate revision 0.'))
        self.assertIn('inspect_scene', history)
        for identifier in [*ids, cursor]: self.assertIn(identifier, history)
        json.loads(history.split('\n', 1)[1])
        self.assertLessEqual(len(history.encode()), 15000)
        self.assertEqual(finish['status'], 'completed')

    def test_resource_inspection_does_not_export_or_change_candidate(self):
        inspect = {**action('inspect_resources'), 'objectName': 'advanced_kit'}
        _, broker, requests, _, finish, _ = self.run_quality([inspect, action('edit', 'REVISION_A'), action('accept'), action('finish')], quality_verdicts=[verdict()])
        self.assertEqual(finish['status'], 'completed')
        resource_call = next(call for call in broker.call.call_args_list if call.args[3] == 'worker-tool-0')
        code = resource_call.args[2]['params']['arguments']['code']
        self.assertIn('/opt/agartha/toolkit/advanced_kit.py', code)
        self.assertNotIn('bpy.ops.export_scene', code)
        self.assertNotIn('save_as_mainfile', code)
        self.assertIn('Candidate revision 0.', next(item for item in requests if item['operationId'] == 'worker-studio-1')['history'])

    def test_modeler_sheets_do_not_replace_full_resolution_independent_evidence(self):
        _, _, requests, _, finish, _ = self.fixture([action('edit', 'REVISION_A'), action('accept'), action('finish')], workflow_version=3, reference_mode='generate', quality_verdicts=[verdict()])
        planning = next(item for item in requests if item['kind'] == 'strategy')
        review = next(item for item in requests if item['kind'] == 'review')
        modeler = [item for item in requests if item['kind'] == 'modeling'][1]
        self.assertEqual([item['label'] for item in modeler['images']], ['reference-sheet', 'render-sheet'])
        self.assertEqual(review['images'][:4], planning['images'])
        self.assertEqual([item['label'] for item in review['images'][4:]], ['export-hero', 'export-front', 'export-right'])
        self.assertEqual(finish['status'], 'completed')

    def test_known_incomplete_edits_are_corrected_then_final_review_uses_the_saved_model(self):
        failures = [httpx.Response(502, json={'code': 'inference_output_incomplete', 'error': 'No action executed. Return a smaller edit.'}, request=httpx.Request('POST', 'https://example.test/inference')) for _ in range(3)]
        store, broker, requests, _, finish, _ = self.run_quality([action('edit', 'REVISION_A'), *failures], quality_verdicts=[verdict()])
        self.assertEqual(finish['status'], 'completed')
        self.assertEqual(sum(item['kind'] == 'review' for item in requests), 1)
        self.assertEqual([item['operationId'] for item in requests if item['kind'] == 'modeling'], ['worker-studio-0', 'worker-studio-1', 'worker-studio-2', 'worker-studio-3'])
        self.assertTrue(any(event.get('reason') == 'modeling_correction_limit' for event in json.loads(store.read('job', 'review.json'))['actions']))
        self.assertFalse(any(call.args[3] in ['worker-tool-1', 'worker-tool-2', 'worker-tool-3'] for call in broker.call.call_args_list))

    def test_failed_edit_does_not_send_a_stale_render_sheet(self):
        _, _, requests, _, finish, _ = self.run_quality([action('edit', 'REVISION_A'), action('edit', 'BROKEN'), action('inspect_scene')])
        modeling = [item for item in requests if item['kind'] == 'modeling']
        self.assertEqual([item['label'] for item in modeling[1]['images']], ['render-sheet'])
        self.assertEqual(modeling[2]['images'], [])
        self.assertEqual(finish['status'], 'partial')

    def test_action_limit_still_reviews_the_saved_candidate_once(self):
        with patch('cloud.blender_billing.studio.MAX_ACTIONS', 2):
            store, _, requests, _, finish, _ = self.run_quality([action('edit', 'REVISION_A'), action('inspect_scene')], quality_verdicts=[verdict()])
        self.assertEqual(finish['status'], 'completed')
        self.assertEqual(sum(item['kind'] == 'review' for item in requests), 1)
        self.assertTrue(any(event.get('reason') == 'modeling_action_limit' for event in json.loads(store.read('job', 'review.json'))['actions']))

    def test_rejection_requires_changed_export_then_repair_can_pass(self):
        store,_,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('accept'),action('edit','REVISION_B'),action('accept'),action('finish')],quality_verdicts=[verdict(False),verdict()])
        critics=[item for item in requests if item['kind']=='review']
        self.assertEqual([item['candidateRevision'] for item in critics],[1,2])
        self.assertNotEqual(critics[0]['glbSha256'],critics[1]['glbSha256'])
        trace=json.loads(store.read('job','review.json'))
        self.assertIn('already reviewed',trace['actions'][2]['error'])
        self.assertTrue(any('front legs are too short' in item.get('history','') for item in requests if item['kind']=='modeling'))
        self.assertEqual(finish['status'],'completed')

    def test_noop_edit_cannot_buy_another_review_of_same_glb(self):
        store,_,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('edit','REVISION_A'),action('accept'),action('finish')],quality_verdicts=[verdict(False)])
        self.assertEqual(sum(item['kind']=='review' for item in requests),1)
        self.assertIn('already reviewed',json.loads(store.read('job','review.json'))['actions'][3]['error'])
        self.assertEqual(finish['status'],'partial');self.assertFalse(finish['visuallyInspected'])

    def test_claims_missing_evidence_and_stale_binding_never_accept(self):
        for result in [dict(accepted=True),verdict(candidateRevision=50),verdict(glbSha256='a'*64),verdict(criteria={})]:
            with self.subTest(result=result):
                store,broker,_,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('finish')],quality_verdicts=[result])
                self.assertFalse(finish['visuallyInspected']);self.assertEqual(finish['status'],'partial')
                self.assertFalse(any(call.args[0]=='recordManagedAcceptance' for call in broker.ledger.call.call_args_list))

    def test_reviewer_failure_stops_once_and_durably_records_attempt(self):
        for failure in [RuntimeError('budget exhausted'),RuntimeError('uncertain response')]:
            store,broker,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('accept')],quality_verdicts=[failure])
            self.assertEqual(sum(item['kind']=='review' for item in requests),1)
            self.assertEqual(requests[-1]['kind'],'review')
            self.assertEqual(json.loads(store.read('job','review.json'))['reviews'][0]['status'],'attempted')
            self.assertEqual(finish['status'],'partial');self.assertFalse(finish['visuallyInspected']);broker.stop.assert_called_once()

    def test_malformed_or_oversized_successful_critic_http_body_stops_inference(self):
        bodies={'malformed':b'{"accepted":','oversized':b'{'+b' '*100_000+b'}','invalid_utf8':b'\xff','non_object':b'[]'}
        for label,body in bodies.items():
            with self.subTest(body=label):
                store,broker,requests,_,finish,_=self.run_quality([
                    action('edit','REVISION_A'),action('accept'),action('edit','REVISION_B'),action('accept'),
                ],quality_verdicts=[body,verdict()])
                self.assertEqual([request['kind'] for request in requests],['strategy','modeling','modeling','review'])
                self.assertEqual(finish['status'],'partial');self.assertFalse(finish['visuallyInspected'])
                trace=json.loads(store.read('job','review.json'))
                self.assertEqual(trace['reviews'][0]['status'],'attempted')
                self.assertEqual(next(event['type'] for event in trace['actions'] if event['action']=='error'),'InferenceProtocolError')
                broker.stop.assert_called_once()

    def test_unusable_structured_critic_verdict_stops_inference(self):
        invalid_unicode=verdict();invalid_unicode['criteria']['materials']['evidence']='x'*30+'\ud800'
        for result in [dict(accepted=True),verdict(candidateRevision=50),verdict(criteria={}),invalid_unicode,verdict(defects=[{'severity':['major'],'criterion':'materials','description':'A visibly missing portable material requires correction.'}])]:
            with self.subTest(result=result):
                store,_,requests,_,finish,_=self.run_quality([
                    action('edit','REVISION_A'),action('accept'),action('edit','REVISION_B'),action('accept'),
                ],quality_verdicts=[result,verdict()])
                self.assertEqual(requests[-1]['kind'],'review')
                self.assertEqual(sum(request['kind']=='review' for request in requests),1)
                self.assertFalse(finish['visuallyInspected'])
                self.assertEqual(json.loads(store.read('job','review.json'))['reviews'][0]['status'],'attempted')

    def test_strategy_size_matches_gateway_compact_utf8_bound(self):
        def strategy(text):
            return {'subjectClass':'organic','styleUse':text,'geometryApproach':text,'proportions':[text],'stages':[text]*3,'acceptanceChecks':dict.fromkeys(['silhouette','proportions','construction','materials','presentation'],text)}
        unicode_strategy=strategy('形'*350)
        boundary_strategy=strategy('x'*1072);boundary_strategy['styleUse']+='x'*2
        self.assertEqual(len(json.dumps(unicode_strategy).encode()),23328)
        for value,expected_bytes in [(unicode_strategy,11756),(boundary_strategy,12000)]:
            with self.subTest(expected_bytes=expected_bytes):
                self.assertEqual(len(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')),expected_bytes)
                store,broker,requests,_,finish,_=self.run_quality([
                    action('edit','REVISION_A'),action('accept'),action('finish'),
                ],quality_verdicts=[verdict()],strategy_response=value)
                self.assertEqual(finish['status'],'completed');broker.start.assert_called_once()
                self.assertEqual(next(request['strategy'] for request in requests if request['kind']=='review'),value)
                self.assertEqual(json.loads(store.read('job','review.json'))['strategy'],value)
        boundary_strategy['styleUse']+='x'
        _,broker,requests,_,finish,_=self.run_quality([action('edit','REVISION_A')],strategy_response=boundary_strategy)
        self.assertEqual(finish['status'],'failed');broker.start.assert_not_called()
        self.assertEqual([request['kind'] for request in requests],['strategy'])

    def test_cancellation_after_review_or_strategy_stops_before_acceptance(self):
        for kind in ['strategy','review']:
            store,broker,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept')],quality_verdicts=[verdict()],cancel_after=kind)
            self.assertEqual(requests[-1]['kind'],kind);self.assertEqual(finish['status'],'cancelled')
            self.assertFalse(any(call.args[0]=='recordManagedAcceptance' for call in broker.ledger.call.call_args_list));broker.stop.assert_called_once()
            if kind=='strategy': broker.start.assert_not_called()

    def test_changed_candidate_falls_back_to_trusted_accepted_geometry(self):
        for last in ['REVISION_B','BROKEN']:
            store,broker,_,_,finish,video=self.run_quality([action('edit','REVISION_A'),action('accept'),action('edit',last)],quality_verdicts=[verdict()])
            self.assertEqual(store.read('job','model.glb'),b'glTFBLENDER-A');self.assertEqual(store.read('job','model.blend'),b'BLENDER-A')
            self.assertTrue(finish['visuallyInspected']);self.assertEqual(finish['status'],'partial')
            self.assertEqual(store.accepted_quality('job')['candidateRevision'],1);video.assert_not_called()

    def test_geometry_drift_after_critic_response_cannot_be_accepted(self):
        store,broker,_,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept')],quality_verdicts=[verdict()],mutate_after_review=True)
        self.assertFalse(finish['visuallyInspected'])
        self.assertIn('changed after independent review',json.loads(store.read('job','review.json'))['actions'][1]['error'])
        self.assertFalse(any(call.args[0]=='recordManagedAcceptance' for call in broker.ledger.call.call_args_list))

    def test_restore_reuses_only_the_verified_accepted_source_and_verdict(self):
        store,_,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('edit','REVISION_B'),action('restore'),action('finish')],quality_verdicts=[verdict()])
        self.assertEqual(sum(item['kind']=='review' for item in requests),1)
        self.assertEqual(store.read('job','model.glb'),b'glTFBLENDER-A')
        self.assertEqual(store.accepted_quality('job')['candidateRevision'],1)
        self.assertEqual(finish['status'],'completed')

    def test_restore_then_edit_allocates_a_fresh_candidate_and_review_operation(self):
        store,_,requests,_,finish,_=self.run_quality([
            action('edit','REVISION_A'),action('accept'),
            action('edit','REVISION_B'),action('accept'),
            action('restore'),action('edit','REVISION_C'),action('accept'),action('finish'),
        ],quality_verdicts=[verdict(),verdict(False),verdict()])
        reviews=[request for request in requests if request['kind']=='review']
        self.assertEqual([request['candidateRevision'] for request in reviews],[1,2,3])
        self.assertEqual([request['operationId'] for request in reviews],['worker-review-1','worker-review-2','worker-review-3'])
        self.assertEqual(len({request['glbSha256'] for request in reviews}),3)
        self.assertEqual(store.read('job','model.glb'),b'glTFBLENDER-C')
        self.assertEqual(store.read('job','model.blend'),b'BLENDER-C')
        self.assertEqual(store.accepted_quality('job')['candidateRevision'],3)
        self.assertEqual(finish['status'],'completed');self.assertTrue(finish['visuallyInspected'])

    def test_final_render_cannot_replace_reviewed_geometry_or_source(self):
        store,_,_,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),action('finish')],quality_verdicts=[verdict()],final_mutation=True)
        self.assertEqual(store.read('job','model.glb'),b'glTFBLENDER-A');self.assertEqual(store.read('job','model.blend'),b'BLENDER-A')
        self.assertEqual(finish['status'],'completed')
        self.assertNotIn('export_scene',FINAL_RENDER);self.assertNotIn('save_as_mainfile',FINAL_RENDER)

    def test_reserved_budget_runs_one_service_review_without_a_modeler_accept(self):
        reserved={'code':'quality_review_reserved','error':'Remaining budget is reserved for delivery.'}
        for approved in [True,False]:
            store,broker,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),reserved],quality_verdicts=[verdict(approved)])
            self.assertEqual([item['kind'] for item in requests],['strategy','modeling','modeling','review'])
            self.assertEqual(finish['status'],'completed' if approved else 'partial')
            self.assertEqual(finish['visuallyInspected'],approved)
            trace=json.loads(store.read('job','review.json'))
            self.assertEqual(trace['actions'][1]['action'],'service_review')
            broker.stop.assert_called_once()

    def test_reserved_budget_does_not_repeat_a_rejected_candidate_review(self):
        reserved={'code':'quality_review_reserved','error':'Remaining budget is reserved for delivery.'}
        store,_,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),action('accept'),reserved],quality_verdicts=[verdict(False)])
        self.assertEqual(sum(item['kind']=='review' for item in requests),1)
        self.assertEqual(finish['status'],'partial');self.assertFalse(finish['visuallyInspected'])
        self.assertIn('already reviewed',json.loads(store.read('job','review.json'))['actions'][2]['error'])

    def test_uncertain_modeler_result_does_not_trigger_a_service_review(self):
        _,broker,requests,_,finish,_=self.run_quality([action('edit','REVISION_A'),RuntimeError('uncertain modeling outcome')],quality_verdicts=[verdict()])
        self.assertFalse(any(item['kind']=='review' for item in requests));self.assertFalse(finish['visuallyInspected'])
        broker.stop.assert_called_once()

    def test_v3_none_routes_to_studio(self):
        broker=Mock();broker.ledger.call.side_effect=[{'claimed':True},{'workflowVersion':3,'referenceMode':'none'}]
        with patch('cloud.blender_billing.studio.run_studio') as studio:
            run_managed(broker,Mock(),'token','job',Mock(),'https://example.test','key')
            studio.assert_called_once()

    def test_recovery_requires_durable_passing_marker_not_trace_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            files=ManagedFiles(Path(directory),StorageCoordinator(),lambda:None)
            files.save('job',{'model.glb':b'glTF-A','model.blend':b'BLENDER-A','preview.png':b'A'})
            files.save_review('job',{'accepted':True})
            files.accept('job')
            broker=Mock();job={'jobId':'job','executorId':'worker','workflowVersion':3,'referenceMode':'none'}
            recover_managed_files(broker,files,job)
            self.assertFalse(any(call.args[0]=='recordManagedAcceptance' for call in broker.ledger.call.call_args_list))
            approved=verdict(candidateRevision=1,glbSha256=hashlib.sha256(b'glTF-A').hexdigest())
            files.accept('job',quality_review=approved)
            files.save('job',{'model.glb':b'glTF-B','model.blend':b'BLENDER-B','preview.png':b'B'})
            broker.reset_mock();recover_managed_files(broker,files,job)
            broker.ledger.call.assert_any_call('recordManagedAcceptance',jobId='job',executorId='worker',qualityApproved=True)
            self.assertEqual(files.read('job','model.glb'),b'glTF-A')
            marker=files.directory('job')/'accepted.json'
            value=json.loads(marker.read_text());value['qualityReview']['glbSha256']='a'*64;marker.write_text(json.dumps(value))
            broker.reset_mock();recover_managed_files(broker,files,job)
            self.assertFalse(any(call.args[0]=='recordManagedAcceptance' for call in broker.ledger.call.call_args_list))

    def test_no_reference_review_has_bounded_authorized_seven_day_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            files=ManagedFiles(Path(directory),StorageCoordinator(),lambda:None)
            with patch('cloud.blender_billing.managed.time.time',return_value=100): files.save_review('job',{'strategy':'planned'})
            authorize=Mock(side_effect=lambda size:{'bytes':size})
            with patch('cloud.blender_billing.managed.time.time',return_value=101):
                self.assertEqual(json.loads(files.read('job','review.json',authorize)),{'strategy':'planned'})
                authorize.assert_called_once()
                files.save_review('job',{'strategy':'updated'})
            with patch('cloud.blender_billing.managed.time.time',return_value=100+7*86400+1):
                with self.assertRaisesRegex(ValueError,'expired'):files.read('job','review.json')
            (files.directory('job')/'review.json').write_bytes(b'x'*1_000_001)
            with patch('cloud.blender_billing.managed.time.time',return_value=102):
                with self.assertRaisesRegex(ValueError,'limit'): files.read('job','review.json')

    def test_legacy_reference_review_metadata_still_works(self):
        with tempfile.TemporaryDirectory() as directory:
            files=ManagedFiles(Path(directory),StorageCoordinator(),lambda:None)
            files.save_reference('job',raster(),'legacy')
            self.assertEqual(json.loads(files.read('job','review.json'))['referenceModel'],'legacy')
            self.assertFalse((files.directory('job')/'review-meta.json').exists())
            files.save_review('job',{'actions':[]})
            self.assertTrue((files.directory('job')/'review-meta.json').exists())
