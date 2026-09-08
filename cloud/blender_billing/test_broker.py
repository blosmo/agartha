from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from .broker import Broker, BrokerConflict, ResultStore
from .ledger import LedgerError


class BrokerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.row = {"reservationId": "r1", "projectId": "p1", "status": "running", "launchGeneration": 1,
                    "providerWorkerId": "sb-1", "launchClaimedAt": 100_000, "lastActivityAt": 100_000,
                    "readyAt": 100_000, "reservedMinutes": 5, "stopRequested": False}
        self.events: list[tuple[str, dict]] = []
        self.grants: dict[str, dict] = {}
        self.provider = Mock()
        self.provider.poll.return_value = None
        self.provider.call.return_value = {"id": 1, "result": {"content": [{"type": "text", "text": "cube created"}], "isError": False}}
        self.projects = Mock()
        self.ledger = Mock()
        self.ledger.call.side_effect = self.call_ledger
        self.broker = Broker(self.ledger, self.provider, ResultStore(Path(self.temporary.name)), self.projects, clock=lambda: 101)

    def call_ledger(self, operation: str, **args):
        self.events.append((operation, args))
        if operation in {"getReservation", "getReservationForBroker"}:
            return dict(self.row)
        if operation == "authorizeOperation":
            key = args["operationId"]
            if key in self.grants:
                return {**self.grants[key], "reused": True}
            self.grants[key] = {"state": "claimed"}
            return {"reused": False}
        if operation == "completeOperation":
            self.grants[args["operationId"]] = args
            return args
        if operation == "claimShutdown":
            return {"claimed": True}
        if operation == "renewShutdown":
            return {"renewed": True}
        if operation == "requestStop":
            self.row["stopRequested"] = True
            return self.row
        if operation == "settleSession":
            self.row["status"] = "settled" if args["terminalState"] == "confirmed" else "unknown"
            return dict(self.row)
        raise AssertionError(operation)

    def test_owner_failure_never_calls_provider(self):
        self.ledger.call.side_effect = LedgerError(401)
        with self.assertRaises(LedgerError):
            self.broker.start("unauthorized", "r1")
        self.provider.ensure_worker.assert_not_called()

    def test_replay_reads_saved_result_without_executing_twice_and_budgets_delivery(self):
        message = {"id": 1, "method": "tools/call", "params": {"name": "execute_blender_code", "arguments": {"code": "create cube"}}}
        first = self.broker.call("owner", "r1", message, "op1")
        second = self.broker.call("owner", "r1", {**message, "id": 2}, "op1")
        self.assertEqual(first, second)
        self.provider.call.assert_called_once()
        completions = [args for name, args in self.events if name == "completeOperation"]
        self.assertEqual(len(completions), 2)
        self.assertGreater(completions[1]["actualResponseBytes"], 0)

    def test_uncertain_operation_is_not_executed_again(self):
        self.provider.call.side_effect = TimeoutError("transport lost")
        message = {"id": 1, "method": "tools/list"}
        with self.assertRaises(TimeoutError):
            self.broker.call("owner", "r1", message, "op1")
        with self.assertRaises(BrokerConflict):
            self.broker.call("owner", "r1", message, "op1")
        self.provider.call.assert_called_once()

    def test_stop_cannot_release_credits_without_terminal_observation(self):
        self.provider.stop.side_effect = TimeoutError("provider unavailable")
        with self.assertRaises(TimeoutError):
            self.broker.stop("owner", "r1")
        settlements = [args for name, args in self.events if name == "settleSession"]
        self.assertEqual([args["terminalState"] for args in settlements], ["unknown"])

    def test_failed_download_finishes_its_read_only_claim(self):
        self.provider.read_artifact.side_effect = TimeoutError('File read failed')
        with self.assertRaises(TimeoutError):
            self.broker.download('owner', 'r1', 'model.glb', response_limit=100)
        completions = [args for name, args in self.events if name == 'completeOperation']
        self.assertEqual(completions[0]['state'], 'failed')
        self.assertEqual(completions[0]['actualResponseBytes'], 100)

    def test_checkpoint_failure_still_terminates_worker(self):
        self.projects.checkpoint.side_effect = OSError("storage failure")
        with self.assertRaises(OSError):
            self.broker.stop("owner", "r1")
        self.provider.stop.assert_called_once_with("sb-1")
        self.assertEqual(self.row["status"], "unknown")

    def test_confirmed_stop_settles_and_removes_retry_cache(self):
        self.provider.poll.side_effect = [None, 0]
        row = self.broker.stop("owner", "r1")
        self.assertEqual(row["status"], "settled")
        self.projects.checkpoint.assert_called_once()
        self.assertTrue(any(name == "settleSession" and args["terminalState"] == "confirmed" for name, args in self.events))


if __name__ == "__main__":
    unittest.main()
