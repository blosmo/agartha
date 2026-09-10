from __future__ import annotations
import hashlib
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
