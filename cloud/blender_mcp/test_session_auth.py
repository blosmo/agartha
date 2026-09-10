import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from .service import SessionASGI, Activity, SessionStore

class SessionAuthTests(unittest.TestCase):
    def test_required_token_fails_closed_at_construction(self):
        with tempfile.TemporaryDirectory() as directory:
            for token in (None, '', '   '):
                with self.subTest(token=token), patch.dict(os.environ, {}, clear=True):
                    if token is not None: os.environ['MCP_CONNECT_TOKEN'] = token
                    with self.assertRaisesRegex(RuntimeError, 'MCP_CONNECT_TOKEN'):
                        SessionASGI(AsyncMock(), Activity(), SessionStore(Path(directory)), require_token=True)

    def test_authentication_and_explicit_outer_auth(self):
        with tempfile.TemporaryDirectory() as directory:
            for expected, supplied, status in [('valid-token', 'valid-token', 200), ('valid-token', 'None', 401), (None, None, 200)]:
                with self.subTest(expected=expected, supplied=supplied), patch.dict(os.environ, {}, clear=True):
                    if expected: os.environ['MCP_CONNECT_TOKEN'] = expected
                    app = SessionASGI(AsyncMock(), Activity(), SessionStore(Path(directory)), require_token=expected is not None)
                    send = AsyncMock()
                    headers = [(b'authorization', f'Bearer {supplied}'.encode())] if supplied else []
                    asyncio.run(app({'type':'http','path':'/healthz','headers':headers}, AsyncMock(), send))
                    self.assertEqual(send.call_args_list[0].args[0]['status'], status)
