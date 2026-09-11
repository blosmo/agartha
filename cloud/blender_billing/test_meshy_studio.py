from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from .test_meshy_exchange import textured_glb
from .test_studio import StudioTests, action


def generated_action(name: str, code: str = '') -> dict:
    value = action(name, code)
    value['objectName'] = 'Garden visitor'
    return value


class MeshyStudioTests(StudioTests):
    def test_prepares_reference_then_generates_and_exports_component(self):
        ready = {
            'accepted': True,
            'criteria': {key: {'pass': True, 'evidence': 'The exported component is clearly visible and coherent in the supplied review render.'} for key in ['silhouette', 'proportions', 'construction', 'materials', 'presentation']},
            'defects': [],
        }
        steps = [
            generated_action('prepare_generated_asset', json.dumps({'name': 'Garden visitor', 'brief': 'A fully clothed humanoid visitor in a neutral A-pose with a slate coat and olive trousers.', 'rigging': False, 'heightMeters': 1.7})),
            generated_action('generate_asset'),
            action('accept'),
            action('finish'),
        ]
        with patch('cloud.blender_billing.meshy_exchange.time.sleep', return_value=None):
            store, broker, requests, _timeline, finish, _ = self.fixture(steps, workflow_version=3, reference_mode='none', quality_verdicts=[ready], meshy=True, meshy_payload=textured_glb())
        kinds = [request['kind'] for request in requests]
        self.assertIn('asset-reference', kinds)
        self.assertIn('meshy-start', kinds)
        self.assertIn('meshy-poll', kinds)
        trace = json.loads(store.read('job', 'review.json'))
        self.assertTrue(any(item.get('action') == 'generate_asset' and 'Generated and imported' in item.get('result', '') for item in trace['actions']))
        self.assertEqual(finish['status'], 'completed')
        self.assertTrue(any(path.name.startswith('component-') and path.suffix == '.glb' for path in store.directory('job').iterdir()))
        self.assertTrue(any(path.name.startswith('recovered-') and path.suffix == '.glb' for path in store.directory('job').iterdir()))
        self.assertTrue(any(call.args[0] == 'recordManagedMeshyArtifact' and call.kwargs.get('recovered') is True for call in broker.ledger.call.call_args_list))
        self.assertEqual(broker.upload_material.call_count, 1)

    def test_asset_reference_response_over_100kb_is_accepted(self):
        steps = [generated_action('prepare_generated_asset', json.dumps({'name': 'Garden visitor', 'brief': 'An isolated visitor component.', 'rigging': False}))]
        _store, _broker, requests, _timeline, _finish, _ = self.fixture(steps, workflow_version=3, reference_mode='none', meshy=True, meshy_payload=textured_glb())
        self.assertEqual([request['kind'] for request in requests].count('asset-reference'), 1)

    def test_generation_without_a_reviewed_reference_is_rejected(self):
        store, _broker, requests, _timeline, finish, _ = self.fixture([generated_action('generate_asset')], workflow_version=3, reference_mode='none', meshy=True, meshy_payload=textured_glb())
        trace = json.loads(store.read('job', 'review.json'))
        self.assertIn('visually review', json.dumps(trace))
        self.assertNotIn('meshy-start', [request['kind'] for request in requests])
        self.assertNotEqual(finish['status'], 'completed')

    def test_cancelled_reference_does_not_start_meshy(self):
        store, _broker, requests, _timeline, finish, _ = self.fixture([generated_action('prepare_generated_asset', json.dumps({'name': 'Garden visitor', 'brief': 'An isolated visitor component.', 'rigging': False}))], workflow_version=3, reference_mode='none', meshy=True, meshy_payload=textured_glb(), cancel_after='asset-reference')
        self.assertEqual([request['kind'] for request in requests].count('asset-reference'), 1)
        self.assertNotIn('meshy-start', [request['kind'] for request in requests])
        self.assertEqual(finish['status'], 'cancelled')
        self.assertIn('cancel', store.read('job', 'review.json').decode().lower())

    def test_provider_failure_is_recorded_without_uploading_or_retrying(self):
        steps = [
            generated_action('prepare_generated_asset', json.dumps({'name': 'Garden visitor', 'brief': 'An isolated visitor component.', 'rigging': False})),
            generated_action('generate_asset'),
            generated_action('finish'),
        ]
        store, broker, requests, _timeline, finish, _ = self.fixture(steps, workflow_version=3, reference_mode='none', meshy=True, meshy_payload=textured_glb(), meshy_failure=True)
        self.assertEqual([request['kind'] for request in requests].count('meshy-start'), 1)
        self.assertEqual(broker.upload_material.call_count, 0)
        self.assertNotEqual(finish['status'], 'completed')
        self.assertIn('provider unavailable', store.read('job', 'review.json').decode())

    def test_export_retry_reuses_generated_bytes_without_second_meshy_start(self):
        steps = [
            generated_action('prepare_generated_asset', json.dumps({'name': 'Garden visitor', 'brief': 'An isolated visitor component.', 'rigging': False})),
            generated_action('generate_asset'),
            generated_action('generate_asset'),
        ]
        with patch('cloud.blender_billing.meshy_exchange.time.sleep', return_value=None):
            _store, broker, requests, _timeline, finish, _ = self.fixture(steps, workflow_version=3, reference_mode='none', meshy=True, meshy_payload=textured_glb(), export_failure_once=True, cache_tool_results=True)
        kinds = [request['kind'] for request in requests]
        self.assertEqual(kinds.count('meshy-start'), 1)
        self.assertEqual(kinds.count('meshy-poll'), 1)
        self.assertEqual(broker.upload_material.call_count, 2)
        self.assertNotEqual(finish['status'], 'failed')


    def test_confirmed_import_failure_reuses_paid_bytes_with_fresh_tool_attempt(self):
        steps = [
            generated_action('prepare_generated_asset', json.dumps({'name': 'Garden visitor', 'brief': 'An isolated visitor component.', 'rigging': False})),
            generated_action('generate_asset'), generated_action('generate_asset'),
        ]
        _store, broker, requests, _timeline, finish, _ = self.fixture(steps, workflow_version=3, reference_mode='none', meshy=True, meshy_payload=textured_glb(), import_failure_once=True, cache_tool_results=True)
        self.assertEqual(sum(request['kind'] == 'meshy-start' for request in requests), 1)
        imports = [call.args[3] for call in broker.call.call_args_list if call.args[3].endswith('-import')]
        self.assertEqual(len(set(imports)), 2)
        self.assertNotEqual(finish['status'], 'failed')

if __name__ == '__main__':
    unittest.main()
