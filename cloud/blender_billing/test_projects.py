import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from .durable_storage import StorageCoordinator
from .projects import ProjectStore


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.row = {'reservationId': 'r1', 'launchGeneration': 1, 'projectId': 'p1', 'agentId': 'a1', 'livemode': False}
        self.grant = None
        self.lost_reply = False
        self.ledger = Mock()
        self.ledger.call.side_effect = self.call_ledger
        self.provider = Mock()
        self.provider.call.return_value = {'result': {'content': [{'type': 'text', 'text': 'Code executed successfully: saved'}], 'isError': False}}
        self.provider.read_checkpoint.side_effect = lambda _worker, sink, **_kwargs: sink.write(b'BLENDER-v405 project')
        self.store = ProjectStore(self.root, self.ledger, self.provider)

    def call_ledger(self, name, **args):
        if name == 'ensureProjectForReservation': return {}
        if name == 'reserveArtifactBytes':
            self.grant = {**args, 'status': 'held'}
            return self.grant
        if name == 'commitArtifact':
            self.grant.update(args, status='committed')
            if self.lost_reply:
                self.lost_reply = False
                raise TimeoutError('Lost commit response')
            return {'reservation': self.grant}
        if name == 'getArtifactReservation': return self.grant
        if name == 'rollbackArtifact':
            self.grant['status'] = 'released'
            return self.grant
        if name == 'getReservationForBroker': return {'status': 'running'}
        raise AssertionError(name)

    def test_lost_commit_reply_preserves_referenced_file_and_recovers_journal(self):
        self.lost_reply = True
        with self.assertRaises(TimeoutError):
            self.store.checkpoint(self.row, 'sb1')
        self.assertEqual(self.grant['status'], 'committed')
        self.assertEqual(len(list(self.root.glob('*/*.blend'))), 1)
        self.assertEqual(len(list(self.root.glob('*/*.json'))), 1)
        self.store.recover()
        self.assertEqual(len(list(self.root.glob('*/*.blend'))), 1)
        self.assertEqual(list(self.root.glob('*/*.json')), [])

    def test_incomplete_transfer_rolls_back_after_removing_partial_file(self):
        def partial(_worker, sink, **_kwargs):
            sink.write(b'partial')
            raise TimeoutError('Worker file stalled')
        self.provider.read_checkpoint.side_effect = partial
        with self.assertRaises(TimeoutError):
            self.store.checkpoint(self.row, 'sb1')
        self.assertEqual(self.grant['status'], 'released')
        self.assertEqual(list(self.root.glob('*/*.blend')), [])

    def test_recovery_does_not_delete_an_active_writer(self):
        reference = f"{'a' * 64}/{'b' * 32}.blend"
        path = self.root / reference
        path.parent.mkdir()
        path.write_bytes(b'writing')
        path.with_suffix('.json').write_text(json.dumps({'blobRef': reference, 'operationId': 'op', 'sessionId': 'r1', 'state': 'writing'}))
        self.grant = {'status': 'held'}
        self.store.recover()
        self.assertTrue(path.exists())
        self.assertEqual(self.grant['status'], 'held')

    def test_restore_refreshes_committed_files_before_opening_them(self):
        content = b'BLENDER-v405 restored'
        reference = f"{'a' * 64}/{'b' * 32}.blend"
        path = self.root / reference
        def refresh():
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(content)
        ledger = Mock()
        ledger.call.side_effect = lambda name, **_args: {} if name == 'ensureProjectForReservation' else {'version': {'blobRef': reference, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}}
        provider = Mock()
        provider.write_checkpoint.side_effect = lambda _worker, source, **_kwargs: self.assertEqual(source.read(), content)
        store = ProjectStore(self.root, ledger, provider, storage=StorageCoordinator(refresh))
        self.assertFalse(path.exists())
        store.restore(self.row, 'sb1')
        provider.write_checkpoint.assert_called_once()


if __name__ == '__main__':
    unittest.main()
