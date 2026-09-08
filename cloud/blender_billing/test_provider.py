import io
import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from cloud.blender_billing.provider import ModalProvider, PROJECT_MAX_BYTES, worker_name


class FakeStream:
    def __init__(self, data=b""):
        self.data = data
    async def read(self, amount=-1):
        if amount < 0:
            data, self.data = self.data, b""
        else:
            data, self.data = self.data[:amount], self.data[amount:]
        return data


class FakeProcess:
    def __init__(self, response):
        self.stdin = SimpleNamespace(write=lambda data: None, write_eof=lambda: None, drain=lambda: None)
        self.stdout = FakeStream(response)
    def wait(self): return 0


class FakeSandbox:
    def __init__(self):
        self.calls = []
        self.files = {"/workspace/project.blend": b"project"}
    def exec(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if "-c" in args and "os.O_RDONLY" in args[args.index("-c") + 1]:
            return FakeProcess(self.files["/workspace/project.blend"])
        return FakeProcess(b'{"id":"ready","result":{"content":[{"type":"text","text":"Code executed successfully: AGARTHA_BLENDER_READY"}],"isError":false}}\n')
    def poll(self): return None
    def terminate(self, wait=False): return 0
    def open(self, path, mode):
        if "r" in mode: return io.BytesIO(self.files[path])
        target = io.BytesIO()
        original_close = target.close
        def close(): self.files[path] = target.getvalue(); original_close()
        target.close = close
        return target
    def __enter__(self): return self
    def __exit__(self, *args): pass


class FakeSDK:
    class Image:
        @staticmethod
        def from_id(image_id): return ("image", image_id)
    class App:
        @staticmethod
        def lookup(name, create_if_missing=False): return ("app", name)
    class Sandbox:
        @staticmethod
        def create(*args, **kwargs):
            FakeSDK.created = (args, kwargs)
            FakeSDK.sandbox = FakeSandbox()
            return FakeSDK.sandbox


class ProviderTests(unittest.TestCase):
    def test_a_single_readiness_probe_timeout_is_not_a_terminal_startup_failure(self):
        provider = ModalProvider(FakeSDK, "im-paid-pinned")
        with patch.object(provider, 'call', side_effect=TimeoutError('Container still booting')):
            self.assertFalse(provider.ready('sb-starting'))
    def test_blocking_worker_file_has_a_controller_deadline(self):
        provider = ModalProvider(FakeSDK, "im-paid-pinned")
        worker_id = provider.ensure_worker("r-timeout", 1, time.time(), 5)
        async def blocked_open(*_args, **_kwargs):
            await asyncio.sleep(60)
        provider._handle(worker_id).sandbox.exec = blocked_open
        started = time.monotonic()
        with patch('cloud.blender_billing.provider.FILE_TIMEOUT_SECONDS', 0.02):
            with self.assertRaises(TimeoutError):
                provider.read_checkpoint(worker_id, io.BytesIO())
        self.assertLess(time.monotonic() - started, 1)

    def test_worker_is_deterministic_and_hardened(self):
        provider = ModalProvider(FakeSDK, "im-paid-pinned")
        worker_id = provider.ensure_worker("r1", 2, time.time() + 1_000, 5)
        self.assertEqual(worker_id, worker_name("r1", 2))
        args, kwargs = FakeSDK.created
        self.assertEqual(kwargs["image"], ("image", "im-paid-pinned"))
        self.assertEqual(kwargs["cpu"], (2, 2))
        self.assertEqual(kwargs["memory"], (4096, 4096))
        self.assertTrue(kwargs["block_network"])
        self.assertEqual(kwargs["volumes"], {})
        self.assertFalse(kwargs["include_oidc_identity_token"])
        self.assertEqual(provider.ensure_worker("r1", 2, time.time() + 1_000, 5), worker_id)

    def test_expired_reservation_cannot_create_worker(self):
        provider = ModalProvider(FakeSDK, "image")
        with self.assertRaises(ValueError):
            provider.ensure_worker("expired", 1, time.time() - 200, 1)

    def test_lookup_is_recovery_only(self):
        class NotFoundError(Exception): pass
        error_type = NotFoundError
        class LookupSDK(FakeSDK):
            exception = SimpleNamespace(NotFoundError=error_type)
            class Sandbox(FakeSDK.Sandbox):
                @staticmethod
                def from_name(app_name, name):
                    raise error_type()
        provider = ModalProvider(LookupSDK, "image")
        self.assertIsNone(provider.lookup_worker("missing", 3))

    def test_call_ready_and_bounded_file_read(self):
        provider = ModalProvider(FakeSDK, "image")
        worker_id = provider.ensure_worker("r1", 1, time.time() + 1_000, 5)
        self.assertTrue(provider.ready(worker_id))
        output = io.BytesIO()
        self.assertEqual(provider.read_checkpoint(worker_id, output), 7)
        self.assertEqual(output.getvalue(), b"project")

    def test_explicit_id_and_size_checks(self):
        provider = ModalProvider(FakeSDK, "image")
        worker_id = provider.ensure_worker("r1", 1, time.time() + 1_000, 5)
        with self.assertRaises(ValueError): provider.call(worker_id, {"id": "x"}, max_bytes=PROJECT_MAX_BYTES + 1)
        with self.assertRaises(ValueError): provider.read_artifact(worker_id, "../escape", io.BytesIO())


if __name__ == "__main__": unittest.main()
