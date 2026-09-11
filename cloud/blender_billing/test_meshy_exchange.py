from __future__ import annotations

import json
import struct
import time
import unittest
import httpx
from unittest.mock import Mock, patch

from .meshy_exchange import MeshyExchange, validate_generated_glb


def textured_glb(*, rigged=False, animated=False) -> bytes:
    document = {
        'asset': {'version': '2.0'},
        'buffers': [{'byteLength': 4}],
        'bufferViews': [],
        'images': [{'bufferView': 0, 'mimeType': 'image/png'}],
        'textures': [{'source': 0}],
        'meshes': [{'primitives': []}],
        'nodes': [],
        **({'skins': [{}]} if rigged else {}),
        **({'animations': [{}]} if animated else {}),
    }
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * ((4 - len(encoded) % 4) % 4)
    return struct.pack('<4sIIII', b'glTF', 2, 20 + len(encoded), len(encoded), 0x4E4F534A) + encoded


class MeshyExchangeTests(unittest.TestCase):
    def test_wait_retries_saved_poll_without_dispatching_again(self):
        calls = []

        def inference(operation, kind):
            calls.append((operation, kind))
            if len(calls) < 3:
                raise RuntimeError('temporary gateway failure')
            return {'status': 'succeeded', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/task.glb'}}

        exchange = MeshyExchange(inference, lambda _message: None, lambda: time.time() + 100, client=Mock(), sleep=lambda _seconds: None)
        result = exchange.wait('stable-operation', {'status': 'pending'})
        self.assertEqual(result['result']['status'], 'succeeded')
        self.assertEqual(calls, [('stable-operation', 'meshy-poll')] * 3)

    def test_generated_glb_requires_embedded_texture_resources(self):
        self.assertEqual(validate_generated_glb(textured_glb())['asset']['version'], '2.0')
        bad = textured_glb().replace(b'"bufferView":0', b'"uri":"remote"', 1)
        with self.assertRaises(ValueError):
            validate_generated_glb(bad)

    def test_rigging_uses_the_returned_walking_animation(self):
        base = textured_glb()
        rigged = textured_glb(rigged=True)
        walking = textured_glb(rigged=True, animated=True)
        results = iter([
            {'status': 'succeeded', 'taskId': 'base-task', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/base.glb'}},
            {'status': 'succeeded', 'taskId': 'rig-task', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/rig.glb', 'walkingUrl': 'https://assets.meshy.ai/walk.glb'}},
        ])
        save = Mock()
        exchange = MeshyExchange(lambda *_args, **_kwargs: next(results), lambda _message: None, lambda: time.time() + 100, client=Mock())
        exchange.download = Mock(side_effect=[base, rigged, walking])
        payload, metadata = exchange.generate('stable-operation', 'data:image/jpeg;base64,/9j/', rigging=True, save=save)
        self.assertEqual(payload, walking)
        self.assertEqual(metadata['animated'], True)
        self.assertEqual(metadata['rigged'], True)
        self.assertEqual(save.call_count, 2)

    def test_rigging_failure_returns_the_saved_textured_base(self):
        base = textured_glb()
        results = iter([
            {'status': 'succeeded', 'taskId': 'base-task', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/base.glb'}},
            {'status': 'failed', 'taskId': 'rig-task', 'result': {'status': 'failed'}},
        ])
        save = Mock()
        exchange = MeshyExchange(lambda *_args, **_kwargs: next(results), lambda _message: None, lambda: time.time() + 100, client=Mock())
        exchange.download = Mock(return_value=base)
        payload, metadata = exchange.generate('stable-operation', 'data:image/jpeg;base64,/9j/', rigging=True, save=save)
        self.assertEqual(payload, base)
        self.assertEqual(metadata['riggingFallback'], 'base-model')
        self.assertEqual(save.call_count, 1)

    def test_walking_transport_failure_keeps_the_valid_rigged_model(self):
        base = textured_glb()
        rigged = textured_glb(rigged=True)
        results = iter([
            {'status': 'succeeded', 'taskId': 'base-task', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/base.glb'}},
            {'status': 'succeeded', 'taskId': 'rig-task', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/rig.glb', 'walkingUrl': 'https://assets.meshy.ai/walk.glb'}},
        ])
        save = Mock()
        exchange = MeshyExchange(lambda *_args, **_kwargs: next(results), lambda _message: None, lambda: time.time() + 100, client=Mock())
        exchange.download = Mock(side_effect=[base, rigged, httpx.ReadError('walking unavailable')])
        payload, metadata = exchange.generate('stable-operation', 'data:image/jpeg;base64,/9j/', rigging=True, save=save)
        self.assertEqual(payload, rigged)
        self.assertEqual(metadata['rigged'], True)
        self.assertEqual(metadata['animated'], False)

    def test_reconciliation_failure_does_not_abort_other_rows(self):
        broker = Mock()
        broker.ledger.call.return_value = [
            {'jobId': 'job-a', 'executorId': 'worker-a', 'operationId': 'op-a'},
            {'jobId': 'job-b', 'executorId': 'worker-b', 'operationId': 'op-b'},
        ]
        client = Mock()
        client.post.side_effect = [RuntimeError('row unavailable'), Mock()]
        context = Mock(); context.__enter__ = Mock(return_value=client); context.__exit__ = Mock(return_value=False)
        files = Mock()
        with patch('cloud.blender_billing.meshy_exchange.httpx.Client', return_value=context):
            from .meshy_exchange import reconcile_meshy
            reconcile_meshy(broker, files, 'https://example.test/inference', 'broker-key')
        self.assertEqual(client.post.call_count, 2)

    def test_reconciliation_retains_a_successful_late_artifact(self):
        row = {'jobId': 'job-a', 'executorId': 'worker-a', 'operationId': 'op-a', 'meshStage': 'image-to-3d'}
        broker = Mock()
        broker.ledger.call.side_effect = [[row], {'meshArtifactReady': True}]
        response = Mock()
        response.json.return_value = {'status': 'succeeded', 'taskId': 'task-a', 'result': {'status': 'succeeded', 'modelUrl': 'https://assets.meshy.ai/late.glb'}}
        client = Mock()
        client.post.return_value = response
        context = Mock(); context.__enter__ = Mock(return_value=client); context.__exit__ = Mock(return_value=False)
        files = Mock()
        files.save_generated_component_artifact.return_value = 'generated-image-to-3d-' + 'a' * 64 + '.glb'
        with patch('cloud.blender_billing.meshy_exchange.httpx.Client', return_value=context), patch.object(MeshyExchange, 'download', return_value=textured_glb()):
            from .meshy_exchange import reconcile_meshy
            reconcile_meshy(broker, files, 'https://example.test/inference', 'broker-key')
        files.save_generated_component_artifact.assert_called_once()
        broker.ledger.call.assert_called_with('recordManagedMeshyArtifact', jobId='job-a', executorId='worker-a', operationId='op-a', artifactName='generated-image-to-3d-' + 'a' * 64 + '.glb')

    def test_rigging_recovery_rejects_a_nonanimated_walk_and_keeps_the_rig(self):
        row = {'jobId': 'job-a', 'executorId': 'worker-a', 'operationId': 'op-rig', 'meshStage': 'rigging'}
        broker = Mock()
        broker.ledger.call.side_effect = [[row], {'meshArtifactReady': True}]
        response = Mock()
        response.json.return_value = {'status': 'succeeded', 'taskId': 'rig-task', 'result': {'status': 'succeeded', 'walkingUrl': 'https://assets.meshy.ai/walk.glb', 'modelUrl': 'https://assets.meshy.ai/rig.glb'}}
        client = Mock(); client.post.return_value = response
        context = Mock(); context.__enter__ = Mock(return_value=client); context.__exit__ = Mock(return_value=False)
        files = Mock(); files.save_generated_component_artifact.return_value = 'generated-rigging-' + 'b' * 64 + '.glb'
        rest = textured_glb(rigged=True)
        with patch('cloud.blender_billing.meshy_exchange.httpx.Client', return_value=context), patch.object(MeshyExchange, 'download', side_effect=[textured_glb(rigged=True), rest]):
            from .meshy_exchange import reconcile_meshy
            reconcile_meshy(broker, files, 'https://example.test/inference', 'broker-key')
        self.assertEqual(files.save_generated_component_artifact.call_args.args[2], rest)

    def test_rigging_recovery_transport_failure_on_walk_keeps_the_rig(self):
        row = {'jobId': 'job-a', 'executorId': 'worker-a', 'operationId': 'op-rig', 'meshStage': 'rigging'}
        broker = Mock(); broker.ledger.call.side_effect = [[row], {'meshArtifactReady': True}]
        response = Mock(); response.json.return_value = {'status': 'succeeded', 'taskId': 'rig-task', 'result': {'status': 'succeeded', 'walkingUrl': 'https://assets.meshy.ai/walk.glb', 'modelUrl': 'https://assets.meshy.ai/rig.glb'}}
        client = Mock(); client.post.return_value = response
        context = Mock(); context.__enter__ = Mock(return_value=client); context.__exit__ = Mock(return_value=False)
        files = Mock(); files.save_generated_component_artifact.return_value = 'generated-rigging-' + 'c' * 64 + '.glb'
        rest = textured_glb(rigged=True)
        with patch('cloud.blender_billing.meshy_exchange.httpx.Client', return_value=context), patch.object(MeshyExchange, 'download', side_effect=[httpx.ReadTimeout('walking unavailable'), rest]):
            from .meshy_exchange import reconcile_meshy
            reconcile_meshy(broker, files, 'https://example.test/inference', 'broker-key')
        self.assertEqual(files.save_generated_component_artifact.call_args.args[2], rest)


if __name__ == '__main__':
    unittest.main()
