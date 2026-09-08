import asyncio
import json
import unittest
from cloud.blender_billing.worker_bridge import BridgeProtocolError, WorkerBridge, decode_frame, encode_frame


class BridgeTests(unittest.TestCase):
    def test_real_fastmcp_structured_string_result_preserves_both_parts(self):
        try:
            from mcp.server.fastmcp import FastMCP
        except ImportError:
            self.skipTest('MCP runtime is installed in the worker/client environment')
        server = FastMCP('bridge-regression')
        @server.tool()
        def execute_blender_code(code: str) -> str:
            return 'Code executed successfully: AGARTHA_BLENDER_READY'
        result = asyncio.run(WorkerBridge(server).dispatch({'method': 'tools/call', 'params': {'name': 'execute_blender_code', 'arguments': {'code': 'probe'}}}))
        wire = json.loads(encode_frame(result))
        self.assertEqual(wire['structuredContent']['result'], 'Code executed successfully: AGARTHA_BLENDER_READY')
        self.assertTrue(wire['content'][0]['text'].startswith('Code executed successfully:'))
        self.assertFalse(wire['isError'])

    def test_frames_are_bounded_and_round_trip(self):
        frame = encode_frame({"id": 1, "result": {"ok": True}})
        self.assertEqual(decode_frame(frame), {"id": 1, "result": {"ok": True}})
        with self.assertRaises(BridgeProtocolError):
            decode_frame(b"x" * 10, max_bytes=9)

    def test_tools_list_and_call_preserve_result_fields(self):
        class Tool:
            def model_dump(self, mode="json"):
                return {"name": "demo", "inputSchema": {"type": "object"}}

        class Server:
            async def list_tools(self):
                return [Tool()]

            async def call_tool(self, name, arguments):
                return {"x": 1}

        bridge = WorkerBridge(Server())
        listed = asyncio.run(bridge.dispatch({"method": "tools/list", "id": "a"}))
        self.assertEqual(listed["tools"][0]["name"], "demo")
        called = json.loads(encode_frame(asyncio.run(bridge.dispatch({"method": "tools/call", "params": {"name": "demo", "arguments": {}}}))))
        self.assertEqual(called["structuredContent"], {"x": 1})
        self.assertFalse(called["isError"])


if __name__ == "__main__":
    unittest.main()
