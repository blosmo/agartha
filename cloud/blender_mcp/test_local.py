import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from . import local


class LocalStudioTests(unittest.TestCase):
    def test_loopback_host_is_enforced(self):
        with self.assertRaises(SystemExit):
            with patch.object(local, "run"):
                with patch("sys.argv", ["local_studio.py", "--host", "0.0.0.0"]):
                    local.main()

    def test_run_passes_private_workspace_and_strict_service_flags(self):
        processes = []

        class Process:
            def __init__(self, argv, **kwargs):
                self.argv = argv
                self._polls = 0
                processes.append(self)
                if argv[0] == "blender":
                    (Path(directory) / ".blender-mcp-ready").write_text("ready\n")
            def poll(self):
                self._polls += 1
                return None if self._polls == 1 else 0
            def terminate(self): pass
            def wait(self, timeout=None): pass

        with tempfile.TemporaryDirectory() as directory, patch.object(local.subprocess, "Popen", Process), patch.object(local.time, "sleep"), patch.object(local, "provision_upstream", return_value=Path(directory)):
            addon = Path(directory) / "addon.py"
            addon.write_text("        if bpy.app.background:\n            return\n")
            result = local.run(workspace=Path(directory), blender="blender", addon=str(addon), token="test-token")
        self.assertEqual(result, 1)
        self.assertEqual(processes[0].argv[0], "blender")
        self.assertIn("--strict-transport", processes[1].argv)
        self.assertIn("--require-token", processes[1].argv)


if __name__ == "__main__":
    unittest.main()
