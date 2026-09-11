from __future__ import annotations

import hashlib
import io
import json
import struct
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
from PIL import Image

from .polyhaven import PolyHaven, pack_glb, main


def fixture():
    image = io.BytesIO()
    Image.new('RGB', (2, 2), 'red').save(image, format='PNG')
    resources = {'mesh.bin': struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0), 'textures/color.png': image.getvalue()}
    document = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
                'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
                'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'}],
                'buffers': [{'uri': 'mesh.bin', 'byteLength': 36}],
                'bufferViews': [{'buffer': 0, 'byteLength': 36}], 'images': [{'uri': 'textures/color.png'}]}
    return document, resources


class PolyHavenTests(unittest.TestCase):
    def provider(self, *, catalog=None, mutate=None, handler=None):
        document, resources = fixture()
        responses = {}

        def descriptor(name, raw):
            url = 'https://dl.polyhaven.org/file/ph-assets/' + name
            responses[url] = raw
            return {'url': url, 'size': len(raw), 'md5': hashlib.md5(raw).hexdigest()}

        main = descriptor('ball.gltf', json.dumps(document).encode())
        main['include'] = {key: descriptor(key, raw) for key, raw in resources.items()}
        manifest = {'gltf': {'1k': {'gltf': main}}}
        if mutate:
            mutate(manifest, responses)
        catalog = catalog if catalog is not None else {'ball': {'name': 'Soccer Ball', 'type': 2, 'tags': ['sports'], 'authors': {'Artist': 'All'}}}
        responses['https://api.polyhaven.com/assets?t=models'] = json.dumps(catalog).encode()
        responses['https://api.polyhaven.com/files/ball'] = json.dumps(manifest).encode()
        requests = []

        def respond(request):
            requests.append(request)
            if handler:
                return handler(request)
            return httpx.Response(200, content=responses[str(request.url)])

        provider = PolyHaven(httpx.Client(transport=httpx.MockTransport(respond)))
        self.addCleanup(provider.close)
        return provider, requests

    def test_download_embeds_geometry_and_images_and_preserves_credit_without_credentials(self):
        provider, requests = self.provider()
        entry, payload = provider.load('ball')
        magic, version, length = struct.unpack_from('<III', payload)
        self.assertEqual((magic, version, length), (0x46546C67, 2, len(payload)))
        size = struct.unpack_from('<I', payload, 12)[0]
        document = json.loads(payload[20:20 + size])
        self.assertNotIn('uri', document['buffers'][0])
        self.assertNotIn('uri', document['images'][0])
        self.assertEqual(document['images'][0]['mimeType'], 'image/png')
        self.assertIn('Poly Haven', document['asset']['copyright'])
        self.assertEqual(entry['source'], 'https://polyhaven.com/a/ball')
        self.assertEqual(entry['modelId'], 'model-' + hashlib.sha256(payload).hexdigest())
        for request in requests:
            self.assertEqual(request.headers['User-Agent'], 'Agartha-3DForAgents/1.0')
            self.assertNotIn('Authorization', request.headers)

    def test_search_paginates_deterministically_and_caches_the_catalog(self):
        rows = {f'ball_{i:02}': {'type': 2, 'name': 'Soccer ball'} for i in range(23)}
        rows.update({'texture': {'type': 1, 'name': 'Soccer ball'}, '../bad': {'type': 2}})
        provider, requests = self.provider(catalog=rows)
        first = provider.search('soccer ball')
        second = provider.search('soccer ball', first['cursor'])
        third = provider.search('soccer ball', second['cursor'])
        self.assertEqual([len(page['entries']) for page in [first, second, third]], [10, 10, 3])
        self.assertIsNone(third['cursor'])
        self.assertEqual(len({row['id'] for page in [first, second, third] for row in page['entries']}), 23)
        self.assertEqual(len(requests), 1)
        self.assertEqual(provider.search('does not exist')['entries'], [])

    def test_invalid_ids_and_cursors_do_not_issue_requests(self):
        provider, requests = self.provider()
        for value in ['../ball', 'https://example.com/file', 'ball?x=1', 'ball\n', None]:
            with self.assertRaises(ValueError):
                provider.load(value)
        with self.assertRaises(ValueError):
            provider.search('ball', '../ball')
        self.assertEqual(requests, [])

    def test_redirects_and_provider_errors_are_not_followed(self):
        for status in [302, 429, 503]:
            provider, requests = self.provider(handler=lambda request: httpx.Response(status, headers={'location': 'https://private.invalid/'}))
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                provider.search('ball')
            self.assertEqual(len(requests), 1)

    def test_download_rejects_untrusted_hosts_sizes_and_checksum_mismatches(self):
        for replacement in [
            {'url': 'https://dl.polyhaven.org.evil.test/file/ph-assets/x'},
            {'url': 'https://api.polyhaven.com/file/ph-assets/x'},
            {'url': 'https://dl.polyhaven.org/file/ph-assets/x?redirect=evil'},
            {'size': 16_000_001}, {'size': True}, {'md5': '0' * 32},
        ]:
            def mutate(manifest, responses):
                manifest['gltf']['1k']['gltf'].update(replacement)
            provider, _ = self.provider(mutate=mutate)
            with self.assertRaises(ValueError):
                provider.load('ball')

    def test_dependency_bytes_are_checked_against_manifest(self):
        def mutate(manifest, responses):
            responses['https://dl.polyhaven.org/file/ph-assets/mesh.bin'] = b'corrupt'
        provider, _ = self.provider(mutate=mutate)
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            provider.load('ball')

    def test_only_manifest_listed_resources_are_downloaded(self):
        def mutate(manifest, responses):
            del manifest['gltf']['1k']['gltf']['include']['textures/color.png']
        provider, requests = self.provider(mutate=mutate)
        with self.assertRaisesRegex(ValueError, 'unlisted resource'):
            provider.load('ball')
        self.assertFalse(any(str(request.url).endswith('color.png') for request in requests))

    def test_unsupported_formats_do_not_fall_back_to_executable_blender_sources(self):
        def mutate(manifest, responses):
            manifest['blend'] = manifest.pop('gltf')
        provider, requests = self.provider(mutate=mutate)
        with self.assertRaisesRegex(ValueError, 'no supported 1K glTF'):
            provider.load('ball')
        self.assertEqual(len(requests), 2)

    def test_pack_preserves_offsets_across_multiple_buffers(self):
        document, resources = fixture()
        document['buffers'].append({'uri': 'other.bin', 'byteLength': 3})
        document['bufferViews'].append({'buffer': 1, 'byteLength': 3})
        resources['other.bin'] = b'abc'
        payload = pack_glb(document, resources)
        size = struct.unpack_from('<I', payload, 12)[0]
        packed = json.loads(payload[20:20 + size])
        binary = payload[28 + size:]
        self.assertEqual(packed['bufferViews'][1]['buffer'], 0)
        offset = packed['bufferViews'][1]['byteOffset']
        self.assertEqual(binary[offset:offset + 3], b'abc')
        self.assertEqual(packed['bufferViews'][2]['byteOffset'] % 4, 0)

    def test_pack_rejects_animation_unsupported_extensions_and_bad_views(self):
        for changes in [{'animations': [{}]}, {'skins': [{}]}, {'extensionsUsed': ['KHR_draco_mesh_compression']},
                        {'bufferViews': [{'buffer': 0, 'byteLength': 9999}]}]:
            document, resources = fixture()
            with self.assertRaises(ValueError):
                pack_glb({**document, **changes}, resources)

    def test_transport_timeout_is_a_recoverable_asset_error(self):
        def timeout(request):
            raise httpx.ReadTimeout('slow response', request=request)
        provider, _ = self.provider(handler=timeout)
        with self.assertRaisesRegex(ValueError, 'network request failed'):
            provider.load('ball')

    def test_malformed_upstream_manifest_and_image_are_recoverable(self):
        for malformed in [None, [], {'gltf': None}]:
            def mutate(manifest, responses):
                manifest.clear()
                manifest['gltf'] = malformed
            provider, _ = self.provider(mutate=mutate)
            with self.assertRaises(ValueError):
                provider.load('ball')
        def corrupt_image(manifest, responses):
            descriptor = manifest['gltf']['1k']['gltf']['include']['textures/color.png']
            raw = b'not an image'
            descriptor.update({'size': len(raw), 'md5': hashlib.md5(raw).hexdigest()})
            responses[descriptor['url']] = raw
        provider, _ = self.provider(mutate=corrupt_image)
        with self.assertRaisesRegex(ValueError, 'invalid model data'):
            provider.load('ball')

    def test_slow_stream_hits_total_deadline_even_while_receiving_bytes(self):
        clock = [0.0]
        class SlowStream(httpx.SyncByteStream):
            def __iter__(self):
                for _ in range(100):
                    clock[0] += 1
                    yield b' '
        provider, requests = self.provider(handler=lambda request: httpx.Response(200, stream=SlowStream()))
        with patch('cloud.blender_billing.polyhaven.time.monotonic', side_effect=lambda: clock[0]):
            with self.assertRaisesRegex(ValueError, 'deadline reached'):
                provider.load('ball', timeout_seconds=3)
        self.assertEqual(clock[0], 3)
        self.assertEqual(len(requests), 1)
        self.assertIsNone(provider.deadline)

    def test_cancellation_remains_an_interruption(self):
        provider, requests = self.provider()
        provider.check_active = Mock(side_effect=InterruptedError('Cancelled'))
        with self.assertRaises(InterruptedError):
            provider.load('ball')
        self.assertEqual(requests, [])

    def test_texture_and_total_byte_limits(self):
        for size, fmt in [((2049, 1), 'PNG'), ((2, 2), 'BMP')]:
            document, resources = fixture()
            sink = io.BytesIO()
            Image.new('RGB', size).save(sink, format=fmt)
            resources['textures/color.png'] = sink.getvalue()
            with self.assertRaisesRegex(ValueError, 'PNG/JPEG up to 2K'):
                pack_glb(document, resources)
        document, resources = fixture()
        sink = io.BytesIO()
        Image.new('RGB', (2048, 2048)).save(sink, format='PNG')
        resources['textures/color.png'] = sink.getvalue()
        document['images'] *= 3
        with self.assertRaisesRegex(ValueError, 'texture budget'):
            pack_glb(document, resources)
        document, resources = fixture()
        # Alignment makes a buffer that fitted before embedding exceed the bound.
        with patch('cloud.blender_billing.polyhaven.MAX_BYTES', 36):
            with self.assertRaisesRegex(ValueError, 'exceeds 16 MB'):
                pack_glb(document, resources)

    def test_cli_search_download_and_existing_file_preservation(self):
        provider = Mock()
        provider.search.return_value = {'entries': [], 'cursor': None, 'provider': 'Powered by Poly Haven'}
        output = io.StringIO()
        with patch('cloud.blender_billing.polyhaven.PolyHaven', return_value=provider), patch('sys.argv', ['polyhaven', 'search', 'ball']), redirect_stdout(output):
            main()
        self.assertEqual(json.loads(output.getvalue())['entries'], [])
        provider.search.assert_called_once_with('ball', None)
        provider.close.assert_called_once()
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'ball'
            provider.reset_mock()
            provider.load.return_value = ({'id': 'ball', 'attribution': 'Powered by Poly Haven'}, b'glTF-test')
            args = ['polyhaven', 'download', 'ball', '--output', str(folder)]
            with patch('cloud.blender_billing.polyhaven.PolyHaven', return_value=provider), patch('sys.argv', args), redirect_stdout(io.StringIO()):
                main()
            self.assertEqual((folder / 'model.glb').read_bytes(), b'glTF-test')
            self.assertEqual(json.loads((folder / 'metadata.json').read_text())['id'], 'ball')
            provider.reset_mock()
            errors = io.StringIO()
            with patch('cloud.blender_billing.polyhaven.PolyHaven', return_value=provider), patch('sys.argv', args), redirect_stderr(errors), self.assertRaises(SystemExit) as result:
                main()
            self.assertEqual(result.exception.code, 1)
            self.assertIn('preserved', json.loads(errors.getvalue())['error'])
            provider.load.assert_not_called()
            self.assertEqual((folder / 'model.glb').read_bytes(), b'glTF-test')

    def test_cli_invalid_arguments_are_json_errors(self):
        for args in [[], ['unknown'], ['download', 'ball']]:
            errors = io.StringIO()
            with patch('sys.argv', ['polyhaven', *args]), redirect_stderr(errors), self.assertRaises(SystemExit) as result:
                main()
            self.assertEqual(result.exception.code, 2)
            self.assertIsInstance(json.loads(errors.getvalue())['error'], str)

    def test_cli_write_failure_leaves_no_partial_output_and_returns_json(self):
        provider = Mock()
        provider.load.return_value = ({'id': 'ball'}, b'glTF-test')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'ball'
            errors = io.StringIO()
            with patch('cloud.blender_billing.polyhaven.PolyHaven', return_value=provider), patch('sys.argv', ['polyhaven', 'download', 'ball', '--output', str(folder)]), patch.object(Path, 'write_text', side_effect=OSError('disk full')), redirect_stderr(errors), self.assertRaises(SystemExit) as result:
                main()
            self.assertEqual(result.exception.code, 1)
            self.assertEqual(json.loads(errors.getvalue())['error'], 'disk full')
            self.assertFalse(folder.exists())
            self.assertEqual(list(Path(temporary).iterdir()), [])
            provider.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
