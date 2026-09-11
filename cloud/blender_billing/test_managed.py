from __future__ import annotations
import json
import time
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from .managed import ManagedFiles, run_managed, recover_managed_files
from .durable_storage import StorageCoordinator
from .http import create_http_app
from .ledger import LedgerError
from .test_meshy_exchange import textured_glb
from starlette.testclient import TestClient

class ManagedTests(unittest.TestCase):
    def setUp(self):
        self.video = patch('cloud.blender_billing.managed.render_turnaround', return_value=b'0000ftyp' + bytes(1000))
        self.video_mock = self.video.start()
        self.addCleanup(self.video.stop)

    def test_files_are_private_bounded_and_expire(self):
        with tempfile.TemporaryDirectory() as directory:
            files = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            files.save('one', {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'})
            self.assertEqual(files.read('one', 'model.glb'), b'glTF')
            with self.assertRaises(FileNotFoundError): files.read('two', 'model.glb')
            with self.assertRaises(ValueError): files.read('one', '../model.glb')
            with patch('cloud.blender_billing.managed.time.time', return_value=10**12):
                with self.assertRaises(ValueError): files.read('one', 'model.glb')

    def test_recovered_component_is_private_bounded_and_addressed_by_operation(self):
        with tempfile.TemporaryDirectory() as directory:
            files = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            payload = textured_glb()
            name = files.save_recovered_component('one', 'meshy-operation', payload, {'provider': 'meshy'})
            self.assertRegex(name, r'^recovered-[a-f0-9]{64}\.glb$')
            self.assertEqual(files.read('one', name), payload)
            with self.assertRaises(ValueError):
                files.save_recovered_component('one', '../other', payload, {})

    def test_duplicate_claim_never_runs_inference_or_compute(self):
        broker = Mock(); broker.ledger.call.return_value = {'claimed': False}
        with patch('cloud.blender_billing.managed.httpx.Client') as client:
            run_managed(broker, Mock(), 'a'*64, 'job', Mock(), 'https://example.test', 'key')
        client.assert_not_called(); broker.start.assert_not_called()

    def test_cancelled_job_stops_without_inference(self):
        broker = Mock()
        broker.ledger.call.side_effect = lambda op, **kw: {'claimed': True} if op == 'claimManagedJob' else {'reservationId': 'r', 'status': 'cancelled', 'cancelled': True}
        with patch('cloud.blender_billing.managed.httpx.Client') as client:
            run_managed(broker, Mock(), 'a'*64, 'job', Mock(), 'https://example.test', 'key')
        client.assert_not_called(); broker.stop.assert_called_once()
        finish = [call.kwargs for call in broker.ledger.call.call_args_list if call.args[0] == 'finishManagedJob'][0]
        self.assertEqual(finish['status'], 'cancelled')

    def test_failed_checkpoint_does_not_claim_review_or_delivery(self):
        broker, files = Mock(), Mock()
        broker.ledger.call.side_effect = lambda name, **kw: {'claimed': True} if name == 'claimManagedJob' else {'reservationId': 'r', 'status': 'running'}
        broker.call.side_effect = lambda token, reservation, request, operation, limit: {'result': {'content': [{'text': f"MANAGED_EXPORT_OK:executor:{request['id']}"}]}}
        broker.download.side_effect = lambda token, reservation, name, limit: {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'}[name]
        files.save.side_effect = OSError('Checkpoint could not be committed')
        response = Mock()
        response.content = b'{}'
        response.json.return_value = {'summary': 'Build', 'code': 'import bpy', 'done': False}
        with patch('cloud.blender_billing.managed.uuid.uuid4', return_value=Mock(hex='executor')), patch('cloud.blender_billing.managed.preview_image', return_value='data:image/jpeg;base64,AA=='), patch('cloud.blender_billing.managed.httpx.Client') as client:
            client.return_value.__enter__.return_value.post.return_value = response
            run_managed(broker, files, 'a'*64, 'job', Mock(), 'https://example.test', 'key')
            self.assertTrue(all('image' not in call.kwargs['json'] for call in client.return_value.__enter__.return_value.post.call_args_list))
        finish = [call.kwargs for call in broker.ledger.call.call_args_list if call.args[0] == 'finishManagedJob'][-1]
        self.assertEqual(finish['status'], 'failed')
        self.assertFalse(finish['artifactsReady'])
        self.assertFalse(finish['visuallyInspected'])
        self.assertNotIn('delivered', finish['progress'])
        broker.stop.assert_called_once()

    def test_unauthorized_job_cannot_spawn_or_read_files(self):
        broker = Mock(); broker.ledger.call.side_effect = LedgerError(401)
        start, files = Mock(), Mock()
        client = TestClient(create_http_app(broker, Mock(), start, files))
        headers = {'Authorization': 'Bearer ' + 'a'*64}
        self.assertEqual(client.post('/jobs/job/start', headers=headers).status_code, 401)
        self.assertEqual(client.get('/jobs/job/artifacts/model.blend', headers=headers).status_code, 401)
        start.assert_not_called(); files.read.assert_not_called()

    def test_saved_checkpoint_published_before_worker_can_finish(self):
        broker = Mock(); events = []
        broker.owned.return_value = {'status': 'running', 'launchClaimedAt': time.time() * 1000, 'reservedMinutes': 10}
        def ledger(op, **kw):
            events.append(op)
            if op == 'claimManagedJob': return {'claimed': True}
            return {'reservationId': 'r', 'status': 'running'}
        broker.ledger.call.side_effect = ledger
        broker.call.return_value = {'result': {'content': [{'text': 'MANAGED_EXPORT_OK:executor:0'}]}}
        broker.download.side_effect = lambda token, reservation, name, limit: {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'}[name]
        files = Mock(); files.save.side_effect = lambda *args: events.append('files_saved')
        first = Mock(); first.content = b'{}'; first.json.return_value = {'summary': 'Build', 'code': 'import bpy', 'done': False}
        second = Mock(); second.content = b'{}'; second.json.return_value = {'summary': 'Inspected', 'code': '', 'done': True}
        with patch('cloud.blender_billing.managed.uuid.uuid4', return_value=Mock(hex='executor')), patch('cloud.blender_billing.managed.preview_image', return_value='data:image/jpeg;base64,AA=='), patch('cloud.blender_billing.managed.httpx.Client') as client:
            client.return_value.__enter__.return_value.post.side_effect = [first, second]
            run_managed(broker, files, 'a'*64, 'job', Mock(), 'https://example.test', 'key')
        self.assertLess(events.index('files_saved'), events.index('recordManagedCheckpoint'))
        self.assertLess(events.index('recordManagedCheckpoint'), events.index('finishManagedJob'))
        finish = [call.kwargs for call in broker.ledger.call.call_args_list if call.args[0] == 'finishManagedJob'][0]
        self.assertTrue(finish['artifactsReady']); self.assertTrue(finish['visuallyInspected']); self.assertEqual(finish['status'], 'completed')

    def test_new_checkpoint_does_not_inherit_previous_inspection_after_record_failure(self):
        broker, files = Mock(), Mock()
        broker.owned.return_value = {'status': 'running', 'launchClaimedAt': time.time() * 1000, 'reservedMinutes': 10}
        recorded = 0
        def ledger(op, **kw):
            nonlocal recorded
            if op == 'claimManagedJob': return {'claimed': True}
            if op == 'recordManagedCheckpoint':
                recorded += 1
                if recorded == 2: raise RuntimeError('ledger unavailable')
            return {'reservationId': 'r', 'status': 'running'}
        broker.ledger.call.side_effect = ledger
        broker.call.side_effect = [{'result': {'content': [{'text': f'MANAGED_EXPORT_OK:executor:{turn}'}]}} for turn in range(2)]
        broker.download.side_effect = lambda token, reservation, name, limit: {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'}[name]
        response = Mock(); response.content = b'{}'; response.json.return_value = {'summary': 'Revise', 'code': 'import bpy', 'done': False}
        with patch('cloud.blender_billing.managed.uuid.uuid4', return_value=Mock(hex='executor')), patch('cloud.blender_billing.managed.preview_image', return_value='data:image/jpeg;base64,AA=='), patch('cloud.blender_billing.managed.httpx.Client') as client:
            client.return_value.__enter__.return_value.post.side_effect = [response, response, RuntimeError('budget exhausted')]
            run_managed(broker, files, 'a'*64, 'job', Mock(), 'https://example.test', 'key')
        finish = [call.kwargs for call in broker.ledger.call.call_args_list if call.args[0] == 'finishManagedJob'][0]
        self.assertEqual(files.save.call_count, 2)
        self.assertTrue(finish['artifactsReady']); self.assertFalse(finish['visuallyInspected'])

    def test_recovery_discovers_video_saved_before_metadata_publication(self):
        broker, files = Mock(), Mock()
        files.read.side_effect = lambda job, name: b'png' if name == 'preview.png' else b'0000ftyp' + bytes(1000)
        recover_managed_files(broker, files, {'jobId': 'job', 'executorId': 'worker'})
        self.assertEqual([call.args[0] for call in broker.ledger.call.call_args_list], ['recordManagedCheckpoint', 'recordManagedVideo'])

    def test_video_never_depicts_an_edit_that_failed_after_the_saved_model(self):
        broker, files = Mock(), Mock()
        broker.owned.return_value = {'status': 'running', 'launchClaimedAt': time.time() * 1000, 'reservedMinutes': 10}
        broker.ledger.call.side_effect = lambda op, **kw: {'claimed': True} if op == 'claimManagedJob' else {'reservationId': 'r', 'status': 'running'}
        broker.call.side_effect = [{'result': {'content': [{'text': 'MANAGED_EXPORT_OK:executor:0'}]}}, {'result': {'isError': True, 'content': [{'text': 'Edit failed after changing geometry'}]}}]
        broker.download.side_effect = lambda token, reservation, name, limit: {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'}[name]
        response = Mock(); response.content = b'{}'; response.json.return_value = {'summary': 'Revise', 'code': 'import bpy', 'done': False}
        with patch('cloud.blender_billing.managed.uuid.uuid4', return_value=Mock(hex='executor')), patch('cloud.blender_billing.managed.preview_image', return_value='data:image/jpeg;base64,AA=='), patch('cloud.blender_billing.managed.httpx.Client') as client:
            client.return_value.__enter__.return_value.post.side_effect = [response, response, RuntimeError('budget exhausted')]
            run_managed(broker, files, 'a'*64, 'job', Mock(), 'https://example.test', 'key')
        self.assertEqual(files.save.call_count, 1)
        self.video_mock.assert_not_called()
        finish = [call.kwargs for call in broker.ledger.call.call_args_list if call.args[0] == 'finishManagedJob'][0]
        self.assertEqual(finish['status'], 'partial'); self.assertFalse(finish['videoReady'])

class ManagedDownloadTests(unittest.TestCase):
    def test_broker_reserves_actual_size_before_read_and_denies_bad_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            files = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            files.save('one', {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'})
            authorize = Mock(return_value={'bytes': 4})
            self.assertEqual(files.read('one', 'model.glb', authorize), b'glTF')
            authorize.assert_called_once_with(4)
            with self.assertRaises(ValueError): files.read('one', 'model.glb', Mock(return_value={'bytes':3}))
            denied = Mock(side_effect=LedgerError(403))
            with self.assertRaises(LedgerError): files.read('one', 'model.glb', denied)
            with self.assertRaises(ValueError): files.read('one', '../model.glb', authorize)

    def test_http_download_requires_broker_quota_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            files = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            files.save('one', {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'})
            broker = Mock()
            broker.ledger.call.side_effect = lambda action, **kwargs: {'bytes': kwargs['bytes']} if action == 'authorizeManagedDownload' else {'status':'completed'}
            client = TestClient(create_http_app(broker, Mock(), managed_files=files))
            result = client.get('/jobs/one/artifacts/model.glb', headers={'Authorization':'Bearer ' + 'a' * 64})
            self.assertEqual(result.status_code, 200)
            broker.ledger.call.assert_any_call('authorizeManagedDownload', token='a' * 64, jobId='one', bytes=4)

    def test_oversize_and_growth_never_return_unreserved_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            files = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            files.save('one', {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'})
            metadata = json.loads((files.directory('one') / 'current.json').read_text())
            path = files.directory('one') / metadata['revision'] / 'model.glb'
            authorize = Mock(return_value={'bytes':4})
            with path.open('wb') as artifact: artifact.truncate(16 * 1024 * 1024 + 1)
            with self.assertRaises(ValueError): files.read('one', 'model.glb', authorize)
            authorize.assert_not_called()
            path.write_bytes(b'glTF')
            def grow(size):
                path.write_bytes(b'glTFextra')
                return {'bytes':size}
            with self.assertRaises(ValueError): files.read('one', 'model.glb', grow)
