"""Real MCP transport regression; run with requirements-client.txt installed."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from mcp.server.fastmcp import FastMCP

from . import service
from .config import CORE_TOOLS


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_remote_host_can_initialize(self):
        mcp = FastMCP("transport-test", instructions="Existing upstream guidance.")

        async def fixture() -> str:
            return "fixture"

        for name in CORE_TOOLS:
            mcp.tool(name=name)(fixture)
        with tempfile.TemporaryDirectory() as directory:
            store = service.SessionStore(Path(directory))
            with patch.object(service, "load_upstream", return_value=mcp), patch.object(
                service, "SessionStore", return_value=store
            ):
                application, _, _ = service.create_app()
            async with mcp.session_manager.run():
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=application),
                    base_url="https://remote.example",
                ) as client:
                    response = await client.post(
                        "/mcp",
                        headers={"Accept": "application/json, text/event-stream"},
                        json={
                            "jsonrpc": "2.0", "id": 1, "method": "initialize",
                            "params": {
                                "protocolVersion": "2025-11-25", "capabilities": {},
                                "clientInfo": {"name": "test", "version": "1"},
                            },
                        },
                    )
                    self.assertEqual(response.status_code, 200)
                    self.assertIn('"serverInfo"', response.text)
                    self.assertIn('Existing upstream guidance.', response.text)
                    self.assertIn('bundled Essentials', response.text)
