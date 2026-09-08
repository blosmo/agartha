import asyncio
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from cloud.blender_mcp.bootstrap import build_bootstrap_script
from cloud.blender_mcp.config import CORE_TOOLS, MAX_BLEND_BYTES, MAX_SCRIPT_BYTES
from cloud.blender_mcp.service import Activity, SessionStore, _call_upstream, wrap_execute_tool


class RuntimeTests(unittest.TestCase):
    def test_bootstrap_disables_scripts_and_reasserts_policy_after_load(self):
        source = build_bootstrap_script(Path("/workspace/project.blend"), Path("/workspace/ready"))
        self.assertIn("use_scripts=False", source)
        self.assertIn("bpy.app.handlers.load_post", source)
        self.assertIn("bpy.app.timers.register", source)
        self.assertIn('DISABLE_TELEMETRY', source)

    def test_artifacts_are_bounded_and_cannot_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SessionStore(Path(directory))
            with self.assertRaises(ValueError):
                store.artifact("../escape", ".glb")
            (store.workspace / "project.blend").write_bytes(b"ok")
            self.assertEqual(store.checkpoint()["bytes"], 2)
            (store.workspace / "project.blend").write_bytes(b"x" * (MAX_BLEND_BYTES + 1))
            with self.assertRaises(ValueError):
                store.checkpoint()

    def test_activity_is_tool_request_based(self):
        activity = Activity()
        before = activity.idle_for()
        time.sleep(0.002)
        self.assertGreater(activity.idle_for(), before)
        activity.touch()
        self.assertLess(activity.idle_for(), 0.01)

    def test_nested_busy_activity_stays_busy_until_outer_call_finishes(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "activity"
            activity = Activity(marker)
            activity.begin(); activity.begin(); activity.end()
            self.assertTrue(marker.read_text().startswith("busy:"))
            activity.end()
            self.assertFalse(marker.read_text().startswith("busy:"))

    def test_direct_execute_wrapper_raises_upstream_error(self):
        class Tool:
            _agartha_wrapped = False
            async def fn(self, ctx, code, user_prompt=""):
                return "Error executing code: socket failed"
        tool = Tool()
        manager = type("Manager", (), {"get_tool": lambda _self, _name: tool})()
        mcp = type("MCP", (), {"_tool_manager": manager})()
        wrap_execute_tool(mcp, Activity())
        with self.assertRaises(RuntimeError):
            asyncio.run(tool.fn(ctx=object(), code="bpy.context.scene"))

    def test_upstream_tool_manager_is_used(self):
        class Tool:
            run = AsyncMock(return_value={"ok": True})
        tool = Tool()
        manager = type("Manager", (), {"get_tool": lambda _self, _name: tool})()
        mcp = type("MCP", (), {"_tool_manager": manager})()
        result = asyncio.run(_call_upstream(mcp, "execute_blender_code", {"code": "pass"}))
        self.assertEqual(result, {"ok": True})
        self.assertEqual(tool.run.await_count, 1)
        self.assertEqual(tool.run.await_args_list[0].args[0], {"code": "pass"})

    def test_core_tool_contract_and_script_limit_are_explicit(self):
        self.assertIn("execute_blender_code", CORE_TOOLS)
        self.assertEqual(MAX_SCRIPT_BYTES, 65_536)


if __name__ == "__main__":
    unittest.main()
