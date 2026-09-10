from __future__ import annotations

import unittest
from unittest.mock import Mock

from starlette.testclient import TestClient

from .http import create_http_app
from .ledger import LedgerError


class HttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.broker = Mock()
        self.monitor = Mock()
        self.client = TestClient(create_http_app(self.broker, self.monitor))
        self.headers = {"Authorization": f"Bearer {'a' * 64}"}
        self.broker.owned.return_value = {"reservationId": "r1", "status": "running"}

    def test_unauthorized_start_never_spawns_monitor(self):
        self.broker.owned.side_effect = LedgerError(401)
        response = self.client.post('/sessions/r1/start', headers=self.headers)
        self.assertEqual(response.status_code, 401)
        self.monitor.assert_not_called()
        self.broker.start.assert_not_called()

    def test_initialize_and_real_mcp_tool_envelopes(self):
        response = self.client.post('/mcp/r1', headers=self.headers, json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['result']['protocolVersion'], '2025-03-26')
        tool_result = {"content": [{"type": "text", "text": "created"}], "structuredContent": {"count": 1}, "isError": False}
        self.broker.call.return_value = {"id": 2, "result": tool_result}
        response = self.client.post('/mcp/r1', headers=self.headers, json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_scene_info", "arguments": {}}})
        self.assertEqual(response.json(), {"jsonrpc": "2.0", "id": 2, "result": tool_result})

    def test_reconnected_mcp_clients_can_reuse_request_ids(self):
        scopes = []
        self.broker.call.return_value = {'result': {'content': [], 'isError': False}}
        for _ in range(2):
            initialized = self.client.post('/mcp/r1', headers=self.headers, json={'jsonrpc': '2.0', 'id': 0, 'method': 'initialize', 'params': {}})
            scope = initialized.headers['mcp-session-id'];scopes.append(scope)
            self.client.post('/mcp/r1', headers={**self.headers, 'mcp-session-id': scope}, json={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'})
        self.assertNotEqual(scopes[0], scopes[1])
        self.assertNotEqual(self.broker.call.call_args_list[0].args[3], self.broker.call.call_args_list[1].args[3])

    def test_bound_request_and_private_state_projection(self):
        response = self.client.post('/mcp/r1', headers=self.headers, content=b'x' * 65_537)
        self.assertEqual(response.status_code, 413)
        self.broker.owned.return_value = {"reservationId": "r1", "status": "running", "providerWorkerId": "sb-private", "startupExecutorId": "private"}
        response = self.client.get('/sessions/r1', headers=self.headers)
        self.assertEqual(response.json(), {"reservationId": "r1", "status": "running"})

    def test_http_tools_share_mcp_metering_and_retry_identity(self):
        headers = {**self.headers, 'X-Agartha-Operation-Id': 'create-1'}
        result = {'content': [{'type': 'text', 'text': 'created'}], 'isError': False}
        self.broker.call.return_value = {'result': result}
        params = {'name': 'execute_blender_code', 'arguments': {'code': 'import bpy'}}
        response = self.client.post('/sessions/r1/tools', headers=headers, json=params)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        rest = self.broker.call.call_args.args
        self.client.post('/mcp/r1', headers=headers, json={'jsonrpc': '2.0', 'id': 'create-1', 'method': 'tools/call', 'params': params})
        self.assertEqual(rest, self.broker.call.call_args.args)
        self.assertEqual(rest[3], 'create-1')
        self.assertEqual(rest[4], 16_777_216)

    def test_mcp_reservation_named_tools_does_not_select_rest_adapter(self):
        response = self.client.post('/mcp/tools', headers=self.headers, json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['jsonrpc'], '2.0')
        self.assertIn('serverInfo', response.json()['result'])
        self.assertIn('Use BLENDER_EEVEE for EEVEE', response.json()['result']['instructions'])
        self.assertIn('90-second', response.json()['result']['instructions'])
        self.broker.owned.return_value = {'reservationId': 'tools', 'status': 'running'}
        response = self.client.get('/sessions/tools', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'reservationId': 'tools', 'status': 'running'})

    def test_http_tool_discovery_and_explicit_response_limit(self):
        self.broker.call.return_value = {'result': {'tools': [{'name': 'get_scene_info'}]}}
        response = self.client.get('/sessions/r1/tools', headers={**self.headers, 'X-Agartha-Operation-Id': 'list-1', 'X-Agartha-Response-Limit': '1024'})
        self.assertEqual(response.json()['tools'][0]['name'], 'get_scene_info')
        self.assertEqual(self.broker.call.call_args.args[2]['method'], 'tools/list')
        self.assertEqual(self.broker.call.call_args.args[4], 1024)

    def test_http_rejects_missing_auth_operation_ids_and_invalid_payloads(self):
        self.assertEqual(self.client.get('/sessions/r1/tools').status_code, 401)
        missing = self.client.get('/sessions/r1/tools', headers=self.headers)
        self.assertEqual(missing.status_code, 400)
        self.assertIn('X-Agartha-Operation-Id', missing.json()['error'])
        headers = {**self.headers, 'X-Agartha-Operation-Id': 'op-1'}
        for payload in [[], {}, {'name': 'execute_blender_code', 'arguments': []}, {'name': 'x', 'extra': True}]:
            self.assertEqual(self.client.post('/sessions/r1/tools', headers=headers, json=payload).status_code, 400)
        self.assertEqual(self.client.post('/sessions/r1/tools', headers=headers, content=b'x' * 65_537).status_code, 413)
        self.broker.call.assert_not_called()

    def test_http_checks_owner_and_redacts_worker_failures(self):
        headers = {**self.headers, 'X-Agartha-Operation-Id': 'op-1'}
        self.broker.owned.side_effect = LedgerError(403)
        self.assertEqual(self.client.get('/sessions/r1/tools', headers=headers).status_code, 403)
        self.broker.call.assert_not_called()
        self.broker.owned.side_effect = None
        self.broker.call.return_value = {'error': {'message': 'private worker details'}}
        response = self.client.post('/sessions/r1/tools', headers=headers, json={'name': 'get_scene_info'})
        self.assertTrue(response.json()['isError'])
        self.assertNotIn('private worker details', response.text)

    def test_provider_value_errors_remain_private(self):
        self.broker.owned.side_effect = ValueError('private provider details')
        response = self.client.get('/sessions/r1', headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('private provider details', response.text)


if __name__ == '__main__':
    unittest.main()
