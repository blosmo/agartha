import json
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from . import app


PROJECT = "12345678-1234-5678-1234-567812345678"


class FakeVolume:
    def __init__(self):
        self.sub_path = None

    def with_mount_options(self, *, sub_path):
        self.sub_path = sub_path
        return self


class FakeSandbox:
    def __init__(self):
        self.terminated = False
        self.kwargs = None

    def wait_until_ready(self, *, timeout):
        self.ready_timeout = timeout

    def create_connect_token(self, metadata, *, port):
        self.metadata = metadata
        self.port = port
        return SimpleNamespace(url="https://sandbox.invalid", token="secret")

    def terminate(self):
        self.terminated = True


class FakeModal:
    class Volume:
        @staticmethod
        def from_name(name, *, create_if_missing, version):
            FakeModal.volume_name = name
            FakeModal.volume_version = version
            return FakeModal.volume

    class Probe:
        @staticmethod
        def with_tcp(port):
            return ("tcp", port)

        @staticmethod
        def with_exec(*argv):
            return ("exec", argv)

    class Sandbox:
        @staticmethod
        def create(*args, **kwargs):
            FakeModal.sandbox.kwargs = kwargs
            return FakeModal.sandbox

    class App:
        @staticmethod
        def lookup(name, *, create_if_missing):
            return "fake-app"

    volume = FakeVolume()
    sandbox = FakeSandbox()


class AppTests(unittest.TestCase):
    def test_session_options_validate_bounds(self):
        self.assertEqual(app.SessionOptions(PROJECT).project, PROJECT.replace("-", ""))
        with self.assertRaises(ValueError):
            app.SessionOptions(PROJECT, timeout=119)
        with self.assertRaises(ValueError):
            app.SessionOptions(PROJECT, cpu_limit=3)

    def test_project_mount_uses_validated_project_subpath(self):
        with patch.object(app, "modal", FakeModal):
            mount, volume = app.project_mount(PROJECT)
        self.assertEqual(mount, "/workspace")
        self.assertEqual(volume.sub_path, "projects/12345678123456781234567812345678")
        self.assertEqual(FakeModal.volume_version, 2)

    def test_create_session_is_network_isolated_and_cleans_up_contract(self):
        options = app.SessionOptions(PROJECT, timeout=200, cpu_limit=2)
        with patch.object(app, "modal", FakeModal), patch.object(app, "build_image", return_value="image"):
            session = app.create_session(options)
        kwargs = FakeModal.sandbox.kwargs
        self.assertEqual(session.url, "https://sandbox.invalid")
        self.assertEqual(kwargs["cpu"], (0.125, 2.0))
        self.assertEqual(kwargs["memory"], (1024, 4096))
        self.assertFalse(kwargs["block_network"])
        self.assertEqual(kwargs["outbound_cidr_allowlist"], [])
        self.assertEqual(kwargs["outbound_domain_allowlist"], [])
        self.assertFalse(kwargs["include_oidc_identity_token"])
        self.assertNotIn("encrypted_ports", kwargs)
        self.assertEqual(kwargs["timeout"], 200)
        self.assertEqual(kwargs["readiness_probe"][0], "exec")

    def test_failed_start_terminates_sandbox(self):
        class FailingSandbox(FakeSandbox):
            def wait_until_ready(self, *, timeout):
                raise TimeoutError("not ready")

        old = FakeModal.sandbox
        FakeModal.sandbox = FailingSandbox()
        try:
            with patch.object(app, "modal", FakeModal), patch.object(app, "build_image", return_value="image"):
                with self.assertRaises(TimeoutError):
                    app.create_session(app.SessionOptions(PROJECT))
            self.assertTrue(FakeModal.sandbox.terminated)
        finally:
            FakeModal.sandbox = old

    def test_client_config_is_owner_only(self):
        session = app.Session(SimpleNamespace(), PROJECT, "https://sandbox.invalid", "secret")
        with tempfile.TemporaryDirectory() as directory:
            target = app.write_client_config(session, Path(directory) / "agent.json")
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            data = json.loads(target.read_text())
            self.assertEqual(data["url"], session.url)
            self.assertEqual(data["token"], session.token)
            self.assertEqual(data["mcpServers"]["agartha-blender"]["url"], session.url + "/mcp")


if __name__ == "__main__":
    unittest.main()
