from __future__ import annotations

import json
import struct
import time
import unittest
from unittest.mock import Mock, patch

from .meshy_exchange import MeshyExchange, validate_generated_glb


def textured_glb() -> bytes:
    document = {
        'asset': {'version': '2.0'},
        'buffers': [{'byteLength': 4}],
        'bufferViews': [],
        'images': [{'bufferView': 0, 'mimeType': 'image/png'}],
        'textures': [{'source': 0}],
        'meshes': [{'primitives': []}],
        'nodes': [],
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

    def test_reconciliation_failure_does_not_abort_other_rows(self):
        broker = Mock()
        broker.ledger.call.return_value = [
            {'jobId': 'job-a', 'executorId': 'worker-a', 'operationId': 'op-a'},
            {'jobId': 'job-b', 'executorId': 'worker-b', 'operationId': 'op-b'},
        ]
        client = Mock()
        client.post.side_effect = [RuntimeError('row unavailable'), Mock()]
        context = Mock(); context.__enter__ = Mock(return_value=client); context.__exit__ = Mock(return_value=False)
        with patch('cloud.blender_billing.meshy_exchange.httpx.Client', return_value=context):
            from .meshy_exchange import reconcile_meshy
            reconcile_meshy(broker, 'https://example.test/inference', 'broker-key')
        self.assertEqual(client.post.call_count, 2)


if __name__ == '__main__':
    unittest.main()
