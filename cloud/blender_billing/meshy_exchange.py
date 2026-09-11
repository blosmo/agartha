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
            initial = self.inference(rig_operation, 'meshy-start', stage='rigging', parentOperationId=operation, heightMeters=height_meters)
            result = self.wait(rig_operation, initial)
            # Use the rigged rest model. Custom animation selection remains a separate operation.
            payload = self.download(result['result']['modelUrl'])
            if not validate_generated_glb(payload).get('skins'):
                raise ValueError('The generated character has no skin or armature binding.')
            metadata = {**metadata, 'generationTaskId': metadata['taskId'], 'taskId': result.get('taskId'), 'rigged': True, 'sha256': hashlib.sha256(payload).hexdigest()}
            save(rig_operation, payload, metadata)
        return payload, metadata

    def close(self):
        self.client.close()


def reconcile_meshy(broker: Any, inference_url: str, broker_key: str) -> None:
    """Only poll already-created tasks; recovery never dispatches a paid generation."""
    rows = broker.ledger.call('listPendingMeshyOperations')
    with httpx.Client(timeout=8, follow_redirects=False) as client:
        for row in rows:
            try:
                response = client.post(inference_url, headers={'x-agartha-broker-key': broker_key}, json={'protocol': 3, 'kind': 'meshy-poll', **{key: row[key] for key in ['jobId', 'executorId', 'operationId']}})
                response.close()
            except Exception:
                pass  # The same known task remains pending for the next recovery pass.
