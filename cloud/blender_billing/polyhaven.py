"""Bounded Poly Haven model discovery and portable glTF packaging.

Public requests never carry Agartha credentials. Only manifest-listed resources
from Poly Haven's download host are fetched; Blender source is never opened.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import struct
import time
import math
from collections.abc import Callable
from typing import Any, NotRequired, TypedDict
from urllib.parse import urlsplit

import httpx
from PIL import Image

ASSET_ID = re.compile(r'[a-z0-9][a-z0-9_-]{0,99}\Z')
MAX_BYTES = 16_000_000
CREDIT = 'Powered by Poly Haven'


class ModelEntry(TypedDict):
    id: str
    name: str
    description: str
    source: str
    license: str
    attribution: str
    previewUrl: str
    modelId: NotRequired[str]
    bytes: NotRequired[int]
    resolution: NotRequired[str]


class SearchResults(TypedDict):
    provider: str
    entries: list[ModelEntry]
    cursor: str | None


class PolyHaven:
    def __init__(self, client: httpx.Client | None = None, *, check_active: Callable[[], object] | None = None) -> None:
        self.client = client or httpx.Client(timeout=5, follow_redirects=False)
        self.catalog: dict[str, dict[str, Any]] | None = None
        self.deadline: float | None = None
        self.check_active = check_active or (lambda: None)

    def close(self) -> None:
        self.client.close()

    def _get(self, url: str, limit: int) -> bytes:
        parts = urlsplit(url)
        if (parts.scheme != 'https' or parts.netloc not in {'api.polyhaven.com', 'dl.polyhaven.org'}
                or parts.username or parts.fragment):
            raise ValueError('Poly Haven request is outside the trusted hosts.')
        deadline = min(self.deadline or time.monotonic() + 30, time.monotonic() + 30)
        self.check_active()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('Poly Haven download deadline reached; continue modeling.')
        try:
            with self.client.stream('GET', url, headers={'User-Agent': 'Agartha-3DForAgents/1.0'},
                                    timeout=min(5, remaining), follow_redirects=False) as response:
                if response.status_code != 200:
                    raise ValueError(f'Poly Haven is unavailable ({response.status_code}); try another asset or continue modeling.')
                raw = bytearray()
                last_check = time.monotonic()
                for chunk in response.iter_bytes():
                    now = time.monotonic()
                    if now >= deadline:
                        raise ValueError('Poly Haven download deadline reached; continue modeling.')
                    if now - last_check >= 1:
                        self.check_active()
                        last_check = now
                    raw.extend(chunk)
                    if len(raw) > limit:
                        raise ValueError('Poly Haven response exceeds the download limit.')
                return bytes(raw)
        except httpx.HTTPError as error:
            raise ValueError('Poly Haven network request failed; choose another asset or continue modeling.') from error

    def _models(self) -> dict[str, dict[str, Any]]:
        if self.catalog is None:
            value = json.loads(self._get('https://api.polyhaven.com/assets?t=models', 8_000_000))
            if not isinstance(value, dict):
                raise ValueError('Invalid Poly Haven catalog.')
            self.catalog = {key: row for key, row in value.items()
                            if ASSET_ID.fullmatch(key) and isinstance(row, dict) and row.get('type') == 2}
        return self.catalog

    def _entry(self, asset_id: str) -> ModelEntry:
        if not isinstance(asset_id, str) or not ASSET_ID.fullmatch(asset_id):
            raise ValueError('Choose a Poly Haven asset ID, not a URL.')
        row = self._models().get(asset_id)
        if row is None:
            raise ValueError('Choose a model from the Poly Haven catalog.')
        authors = row.get('authors', {})
        return {'id': asset_id, 'name': str(row.get('name', asset_id))[:100],
                'description': str(row.get('description') or '')[:250],
                'source': 'https://polyhaven.com/a/' + asset_id, 'license': 'CC0-1.0',
                'attribution': CREDIT + ('; ' + ', '.join(authors)[:300] if isinstance(authors, dict) and authors else ''),
                'previewUrl': 'https://cdn.polyhaven.com/asset_img/thumbs/' + asset_id + '.png?width=256'}

    def search(self, query: str = '', cursor: str | None = None) -> SearchResults:
        if not isinstance(query, str) or len(query) > 100 or cursor is not None and (not isinstance(cursor, str) or not ASSET_ID.fullmatch(cursor)):
            raise ValueError('Invalid Poly Haven search.')
        terms = query.casefold().split()
        matches = []
        for asset_id, row in sorted(self._models().items()):
            if cursor and asset_id <= cursor:
                continue
            text = ' '.join([asset_id.replace('_', ' '), str(row.get('name', '')),
                             str(row.get('description', '')), str(row.get('tags', [])),
                             str(row.get('categories', [])), str(row.get('category', ''))]).casefold()
            if all(term in text for term in terms):
                matches.append(asset_id)
            if len(matches) == 11:
                break
        return {'provider': CREDIT, 'entries': [self._entry(key) for key in matches[:10]],
                'cursor': matches[9] if len(matches) > 10 else None}

    def load(self, asset_id: str, *, timeout_seconds: float = 60) -> tuple[ModelEntry, bytes]:
        if type(timeout_seconds) not in {int, float} or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 60:
            raise ValueError('Insufficient time for Poly Haven reuse; continue modeling.')
        self.deadline = time.monotonic() + timeout_seconds
        try:
            return self._load(asset_id)
        except InterruptedError:
            raise
        except (KeyError, TypeError, AttributeError, IndexError, OSError, Image.DecompressionBombError) as error:
            raise ValueError('Poly Haven returned invalid model data; choose another asset or continue modeling.') from error
        finally:
            self.deadline = None

    def _load(self, asset_id: str) -> tuple[ModelEntry, bytes]:
        entry = self._entry(asset_id)
        manifest = json.loads(self._get('https://api.polyhaven.com/files/' + asset_id, 1_000_000))
        descriptor = manifest.get('gltf', {}).get('1k', {}).get('gltf')
        if not isinstance(descriptor, dict):
            raise ValueError('This model has no supported 1K glTF; choose another asset or model it locally.')
        includes = descriptor.get('include', {})
        if not isinstance(includes, dict) or len(includes) > 32:
            raise ValueError('Poly Haven model has too many dependencies.')
        remaining = MAX_BYTES

        def download(item: dict[str, Any]) -> bytes:
            nonlocal remaining
            if not isinstance(item, dict):
                raise ValueError('Invalid Poly Haven file descriptor.')
            size, digest, url = item.get('size'), item.get('md5'), item.get('url')
            if (type(size) is not int or not 0 < size <= remaining or not isinstance(digest, str)
                    or not re.fullmatch(r'[a-f0-9]{32}', digest) or not isinstance(url, str)):
                raise ValueError('Poly Haven file exceeds the budget or lacks a checksum.')
            parts = urlsplit(url)
            if parts.scheme != 'https' or parts.netloc != 'dl.polyhaven.org' or not parts.path.startswith('/file/ph-assets/') or parts.query or parts.fragment:
                raise ValueError('Poly Haven file is outside the trusted download host.')
            raw = self._get(url, size)
            if len(raw) != size or hashlib.md5(raw).hexdigest() != digest:
                raise ValueError('Poly Haven file size or checksum mismatch.')
            remaining -= size
            return raw

        document = json.loads(download(descriptor))
        resources = {}
        if not isinstance(document, dict):
            raise ValueError('Invalid Poly Haven glTF.')
        for group in ['buffers', 'images']:
            items = document.get(group, [])
            if not isinstance(items, list) or len(items) > 16:
                raise ValueError('Poly Haven glTF has too many resources.')
            for item in items:
                uri = item.get('uri') if isinstance(item, dict) else None
                if not isinstance(uri, str) or uri not in includes:
                    raise ValueError('Poly Haven glTF has an unlisted resource.')
                if uri not in resources:
                    resources[uri] = download(includes[uri])
        document.setdefault('asset', {})['copyright'] = entry['attribution'] + '; CC0-1.0; ' + entry['source']
        glb = pack_glb(document, resources)
        entry.update({'modelId': 'model-' + hashlib.sha256(glb).hexdigest(), 'bytes': len(glb), 'resolution': '1k'})
        return entry, glb


def pack_glb(document: dict[str, Any], resources: dict[str, bytes]) -> bytes:
    """Embed a static glTF's buffers and PNG/JPEG textures without executing it."""
    document = json.loads(json.dumps(document))
    if document.get('asset', {}).get('version') != '2.0' or document.get('animations') or document.get('skins'):
        raise ValueError('Poly Haven import requires static glTF 2.0 geometry.')
    allowed = {'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_specular', 'KHR_materials_ior'}
    if any(ext not in allowed for ext in document.get('extensionsUsed', []) + document.get('extensionsRequired', [])):
        raise ValueError('Poly Haven model uses an unsupported extension.')
    binary = bytearray()

    def append(raw):
        binary.extend(b'\0' * (-len(binary) % 4))
        offset = len(binary)
        if offset + len(raw) > MAX_BYTES:
            raise ValueError('Poly Haven model exceeds 16 MB; choose a lighter asset.')
        binary.extend(raw)
        return offset

    offsets = []
    buffers = document.get('buffers', [])
    if not buffers or len(buffers) > 16:
        raise ValueError('Invalid Poly Haven buffers.')
    for buffer in buffers:
        raw = resources[buffer['uri']]
        if len(raw) != buffer.get('byteLength'):
            raise ValueError('Poly Haven buffer length mismatch.')
        offsets.append(append(raw))
    views = document.setdefault('bufferViews', [])
    for view in views:
        index, offset, length = view.get('buffer'), view.get('byteOffset', 0), view.get('byteLength')
        if (type(index) is not int or not 0 <= index < len(buffers) or type(offset) is not int or offset < 0
                or type(length) is not int or length < 1 or offset + length > buffers[index]['byteLength']):
            raise ValueError('Invalid Poly Haven buffer view.')
        view.update({'buffer': 0, 'byteOffset': offsets[index] + offset})
    pixels = 0
    for item in document.get('images', []):
        raw = resources[item.pop('uri')]
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in {'PNG', 'JPEG'} or max(image.size) > 2048:
                raise ValueError('Poly Haven textures must be PNG/JPEG up to 2K.')
            pixels += image.width * image.height
            if pixels > 8_388_608:
                raise ValueError('Poly Haven model exceeds the texture budget.')
            mime = 'image/png' if image.format == 'PNG' else 'image/jpeg'
            image.verify()
        offset = append(raw)
        item.update({'bufferView': len(views), 'mimeType': mime})
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw)})
    document['buffers'] = [{'byteLength': len(binary)}]
    document['asset'].setdefault('copyright', CREDIT + '; CC0-1.0')
    header = json.dumps(document, separators=(',', ':'), allow_nan=False).encode()
    header += b' ' * (-len(header) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    total = 28 + len(header) + len(binary)
    if len(header) > 2_000_000 or total > MAX_BYTES:
        raise ValueError('Poly Haven GLB exceeds the import budget.')
    return (struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(header), 0x4E4F534A)
            + header + struct.pack('<II', len(binary), 0x004E4942) + binary)


def main() -> None:
    """Also available to local agents and people without a managed job."""
    import argparse
    import tempfile
    from pathlib import Path
    class JsonArgumentParser(argparse.ArgumentParser):
        def error(self, message: str) -> None:
            self.exit(2, json.dumps({'error': message}) + '\n')

    parser = JsonArgumentParser(description='Search and prepare Poly Haven models for Agartha.')
    commands = parser.add_subparsers(dest='command', required=True)
    search = commands.add_parser('search')
    search.add_argument('query', nargs='?', default='')
    search.add_argument('--cursor')
    download = commands.add_parser('download')
    download.add_argument('id')
    download.add_argument('--output', required=True, help='New output directory for model.glb and metadata.json')
    args = parser.parse_args()
    provider = PolyHaven()
    try:
        if args.command == 'search':
            result = provider.search(args.query, args.cursor)
        else:
            output = Path(args.output)
            if output.exists():
                raise ValueError('Choose a new output directory; existing files are preserved.')
            result, glb = provider.load(args.id)
            output.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.polyhaven-', dir=output.parent) as temporary:
                staging = Path(temporary) / 'asset'
                staging.mkdir()
                (staging / 'model.glb').write_bytes(glb)
                (staging / 'metadata.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
                if output.exists():
                    raise ValueError('Output directory appeared during download; existing files are preserved.')
                staging.rename(output)
            result = {**result, 'file': str((output / 'model.glb').resolve())}
        print(json.dumps(result, indent=2))
    except (ValueError, KeyError, TypeError, OSError, UnicodeError, httpx.HTTPError) as error:
        parser.exit(1, json.dumps({'error': str(error)}) + '\n')
    finally:
        provider.close()


if __name__ == '__main__':
    main()
