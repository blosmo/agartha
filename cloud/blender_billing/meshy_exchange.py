"""Trusted Meshy task orchestration. Blender receives embedded GLB bytes, never credentials."""
from __future__ import annotations

import hashlib
import json
import struct
import time
from typing import Any, Callable
from urllib.parse import urlsplit

import httpx

MAX_GLB_BYTES = 16_000_000


def validate_asset_url(url: str) -> str:
    if not isinstance(url, str) or len(url) > 2048:
        raise ValueError('Invalid generated asset URL.')
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'assets.meshy.ai' or parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Generated asset URL is outside Meshy storage.')
    return url


def validate_generated_glb(payload: bytes) -> dict[str, Any]:
    if not isinstance(payload, bytes) or not 20 <= len(payload) <= MAX_GLB_BYTES:
        raise ValueError('Generated GLB exceeds the 16 MB import limit.')
    magic, version, total, length, kind = struct.unpack_from('<4sIIII', payload)
    if magic != b'glTF' or version != 2 or total != len(payload) or kind != 0x4E4F534A or length > 2_000_000 or 20 + length > total:
        raise ValueError('Invalid generated GLB container.')
    document = json.loads(payload[20:20 + length])
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0' or not document.get('meshes'):
        raise ValueError('Generated GLB has no model geometry.')
    for key in ['buffers', 'images']:
        entries = document.get(key, [])
        if not isinstance(entries, list) or any(not isinstance(item, dict) or 'uri' in item for item in entries):
            raise ValueError('Generated GLB must embed all buffers and textures.')
    if not document.get('images') or not document.get('textures'):
        raise ValueError('Meshy must deliver a textured model.')
    if len(document.get('images', [])) > 16 or len(document.get('nodes', [])) > 4096:
        raise ValueError('Generated model exceeds import resource limits.')
    return document


class MeshyExchange:
    def __init__(self, inference: Callable[..., dict[str, Any]], heartbeat: Callable[[str], None], deadline: Callable[[], float], *, client=None, sleep=time.sleep):
        self.inference, self.heartbeat, self.deadline = inference, heartbeat, deadline
        self.client = client or httpx.Client(timeout=30, follow_redirects=False)
        self.sleep = sleep

    def wait(self, operation: str, initial: dict[str, Any]) -> dict[str, Any]:
        result, failures = initial, 0
        while result.get('status') == 'pending':
            if time.time() >= self.deadline():
                raise RuntimeError('Generated component is still processing; its saved task will be reconciled without a new purchase.')
            self.heartbeat('Waiting for the saved Meshy component task.')
            self.sleep(min(5, max(0, self.deadline() - time.time())))
            try:
                result = self.inference(operation, 'meshy-poll')
                failures = 0
            except (httpx.TransportError, httpx.HTTPStatusError, RuntimeError):
                failures += 1
                if failures >= 3:
                    raise RuntimeError('Meshy status is unavailable; the saved task remains available for reconciliation.') from None
        if result.get('status') != 'succeeded' or result.get('result', {}).get('status') != 'succeeded':
            raise ValueError('Meshy could not generate this component. Its failed provider task was refunded.')
        return result

    def download(self, url: str) -> bytes:
        url = validate_asset_url(url)
        # Deliberately no authorization, cookies, or redirect following on storage downloads.
        with self.client.stream('GET', url, follow_redirects=False) as response:
            if response.status_code != 200:
                raise ValueError('Generated model download was unavailable.')
            raw = bytearray()
            for chunk in response.iter_bytes():
                raw.extend(chunk)
                if len(raw) > MAX_GLB_BYTES: raise ValueError('Generated GLB exceeds the 16 MB import limit.')
        payload = bytes(raw)
        validate_generated_glb(payload)
        return payload

    def generate(self, operation: str, reference: str, *, rigging=False, height_meters=1.7, save: Callable[[str, bytes, dict[str, Any]], None]) -> tuple[bytes, dict[str, Any]]:
        initial = self.inference(operation, 'meshy-start', stage='image-to-3d', image=reference, humanoid=rigging)
        result = self.wait(operation, initial)
        payload = self.download(result['result']['modelUrl'])
        metadata = {'provider': 'meshy', 'model': 'meshy-7', 'taskId': result.get('taskId'), 'rigged': False, 'sha256': hashlib.sha256(payload).hexdigest()}
        save(operation, payload, metadata)
        if rigging:
            rig_operation = operation + '-rig'
            base_payload, base_metadata = payload, metadata
            try:
                initial = self.inference(rig_operation, 'meshy-start', stage='rigging', parentOperationId=operation, heightMeters=height_meters)
                result = self.wait(rig_operation, initial)
                rigged = self.download(result['result']['modelUrl'])
                if not validate_generated_glb(rigged).get('skins'):
                    raise ValueError('The generated character has no skin or armature binding.')
                payload = rigged
                animated = False
                if result['result'].get('walkingUrl'):
                    try:
                        walking = self.download(result['result']['walkingUrl'])
                        walking_document = validate_generated_glb(walking)
                        if not walking_document.get('skins') or not walking_document.get('animations'):
                            raise ValueError('The generated walking model has no skin or animation.')
                        payload, animated = walking, True
                    except ValueError:
                        pass  # The validated rigged rest model remains useful.
                metadata = {**base_metadata, 'generationTaskId': base_metadata['taskId'], 'taskId': result.get('taskId'), 'rigged': True, 'animated': animated, 'sha256': hashlib.sha256(payload).hexdigest()}
                save(rig_operation, payload, metadata)
            except ValueError:
                # Optional rigging must not strand a valid paid textured base.
                payload, metadata = base_payload, {**base_metadata, 'riggingFallback': 'base-model'}
        return payload, metadata

    def close(self):
        self.client.close()


def reconcile_meshy(broker: Any, files: Any, inference_url: str, broker_key: str) -> None:
    """Poll known tasks and retain a successful late artifact without new spend."""
    rows = broker.ledger.call('listPendingMeshyOperations')
    with httpx.Client(timeout=8, follow_redirects=False) as client:
        for row in rows:
            try:
                response = client.post(inference_url, headers={'x-agartha-broker-key': broker_key}, json={'protocol': 3, 'kind': 'meshy-poll', **{key: row[key] for key in ['jobId', 'executorId', 'operationId']}})
                response.raise_for_status()
                outcome = response.json()
                response.close()
                result = outcome.get('result') if isinstance(outcome, dict) else None
                if outcome.get('status') != 'succeeded' or not isinstance(result, dict) or result.get('status') != 'succeeded':
                    continue
                urls = [result.get('walkingUrl'), result.get('modelUrl')] if row.get('meshStage') == 'rigging' else [result.get('modelUrl')]
                exchange = MeshyExchange(lambda *_args, **_kwargs: {}, lambda _message: None, time.time, client=client)
                payload = None
                for url in urls:
                    if not url: continue
                    try:
                        payload = exchange.download(url)
                        break
                    except ValueError:
                        continue
                if payload is None: continue
                name = files.save_recovered_component(row['jobId'], row['operationId'], payload, {'provider': 'meshy', 'taskId': outcome.get('taskId'), 'stage': row.get('meshStage')})
                broker.ledger.call('recordManagedMeshyArtifact', jobId=row['jobId'], executorId=row['executorId'], operationId=row['operationId'], recovered=True, artifactName=name)
            except Exception:
                pass  # The same known task remains pending for the next recovery pass.
