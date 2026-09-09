from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from .managed import ManagedFiles, run_managed
from .durable_storage import StorageCoordinator
from .http import create_http_app
from .ledger import LedgerError
from starlette.testclient import TestClient

class ManagedTests(unittest.TestCase):
    def test_files_are_private_bounded_and_expire(self):
        with tempfile.TemporaryDirectory() as directory:
            files = ManagedFiles(Path(directory), StorageCoordinator(), lambda: None)
            files.save('one', {'model.glb': b'glTF', 'model.blend': b'BLENDER', 'preview.png': b'png'})
            self.assertEqual(files.read('one', 'model.glb'), b'glTF')
            with self.assertRaises(FileNotFoundError): files.read('two', 'model.glb')
            with self.assertRaises(ValueError): files.read('one', '../model.glb')
            with patch('cloud.blender_billing.managed.time.time', return_value=10**12):
                with self.assertRaises(ValueError): files.read('one', 'model.glb')

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
