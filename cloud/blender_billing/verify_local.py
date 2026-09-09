"""Credential-independent broker exercise against a real Convex-test HTTP ledger."""
from __future__ import annotations

import json
import os
import tempfile
import time
import urllib.request
from pathlib import Path

from .broker import Broker, ResultStore
from .projects import ProjectStore


class LocalLedger:
    def call(self, operation, **arguments):
        url = os.environ['BILLING_FIXTURE_URL']
        if not url.startswith('http://127.0.0.1:'):
            raise ValueError('The local verification ledger must use loopback.')
        request = urllib.request.Request(f'{url}/billing/api/{operation}', data=json.dumps(arguments).encode(), headers={'Content-Type': 'application/json', 'x-agartha-billing-key': 'fixture-gateway', 'x-agartha-broker-key': 'fixture-broker'}, method='POST')
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)


class SimulatedProvider:
    def __init__(self):
        self.workers = {}
        self.creations = 0
        self.restored = None
        self.lose_next_create_reply = False

    def ensure_worker(self, reservation_id, generation, claimed_at, reserved_minutes):
        key = f'sb-{reservation_id}-{generation}'
        if key not in self.workers:
            self.creations += 1
            self.workers[key] = {'exit': None, 'project': b'BLENDER-v405 simulated editable cube'}
        if self.lose_next_create_reply:
            self.lose_next_create_reply = False
            raise TimeoutError('Simulated lost provider creation response')
        return key

    def lookup_worker(self, reservation_id, generation):
        key = f'sb-{reservation_id}-{generation}'
        return key if key in self.workers else None

    def ready(self, worker_id): return self.workers[worker_id]['exit'] is None
    def poll(self, worker_id): return self.workers[worker_id]['exit']
    def stop(self, worker_id): self.workers[worker_id]['exit'] = 0
    def call(self, worker_id, request, max_bytes, timeout):
        return {'id': request['id'], 'result': {'content': [{'type': 'text', 'text': 'Code executed successfully: simulated cube'}], 'isError': False}}
    def read_checkpoint(self, worker_id, sink, max_bytes):
        data = self.workers[worker_id]['project']
        assert len(data) <= max_bytes
        sink.write(data)
        return len(data)
    def write_checkpoint(self, worker_id, source, max_bytes):
        self.restored = source.read(max_bytes + 1)
        assert len(self.restored) <= max_bytes
        self.workers[worker_id]['project'] = self.restored
    def read_artifact(self, worker_id, name, sink, max_bytes):
        raise FileNotFoundError('Simulated missing export')


def main():
    ledger = LocalLedger()
    provider = SimulatedProvider()
    token = 'a' * 64
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        projects = ProjectStore(root / 'projects', ledger, provider)
        broker = Broker(ledger, provider, ResultStore(root / 'results'), projects)
        ledger.call('createQuote', token=token, quoteId='q-flow', minutes=5, livemode=False, requestId='q-flow')
        ledger.call('reserveSession', token=token, quoteId='q-flow', reservationId='r-flow', requestId='r-flow')
        first = broker.start(token, 'r-flow')
        assert first['status'] == 'running'
        request = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'execute_blender_code', 'arguments': {'code': 'create cube'}}}
        result = broker.call(token, 'r-flow', request, 'cube')
        assert result == broker.call(token, 'r-flow', request, 'cube')
        try:
            broker.download(token, 'r-flow', 'missing.glb')
            raise AssertionError('Expected a missing export')
        except FileNotFoundError:
            pass
        stopped = broker.stop(token, 'r-flow')
        assert stopped['status'] == 'settled' and stopped['chargedCents'] == 40
        ledger.call('createQuote', token=token, quoteId='q-resume', minutes=5, livemode=False, requestId='q-resume', projectId='r-flow')
        ledger.call('reserveSession', token=token, quoteId='q-resume', reservationId='r-resume', requestId='r-resume')
        resumed = broker.start(token, 'r-resume')
        assert resumed['status'] == 'running' and provider.restored == b'BLENDER-v405 simulated editable cube'
        # The broker and the atomic ledger idle check must see the same elapsed time.
        request = urllib.request.Request(f"{os.environ['BILLING_FIXTURE_URL']}/fixture/advance-clock", data=b'{}', method='POST')
        with urllib.request.urlopen(request, timeout=10) as response:
            offset = json.load(response)['offsetSeconds']
        broker.clock = lambda: time.time() + offset
        idle_stopped = broker.reconcile('r-resume')
        assert idle_stopped['status'] == 'settled' and idle_stopped['chargedCents'] == 40
        ledger.call('createQuote', token=token, quoteId='q-lost', minutes=5, livemode=False, requestId='q-lost')
        ledger.call('reserveSession', token=token, quoteId='q-lost', reservationId='r-lost', requestId='r-lost')
        provider.lose_next_create_reply = True
        try:
            broker.start(token, 'r-lost')
            raise AssertionError('Expected the simulated lost response')
        except TimeoutError:
            pass
        assert ledger.call('getReservation', token=token, reservationId='r-lost')['status'] == 'unknown'
        recovered = broker.reconcile('r-lost')
        assert recovered['status'] == 'failed' and recovered['releasedCents'] == 40
        assert provider.creations == 3 and all(worker['exit'] == 0 for worker in provider.workers.values())
        print(json.dumps({'simulatedProvider': True, 'realConvexMutations': True, 'launches': provider.creations, 'chargedCents': 80, 'checkpointRestored': True, 'idleStopped': True, 'lostLaunchRecovered': True, 'allWorkersStopped': True}))


if __name__ == '__main__':
    main()
