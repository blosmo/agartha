from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from .broker import Broker, BrokerConflict, ResultStore, TOOL_TIMEOUT_SECONDS
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

    def test_managed_reservation_waits_for_explicit_start(self):
        self.row.update(status='reserved', deferredStart=True)
        self.assertEqual(self.broker.reconcile('r1')['status'], 'reserved')
        self.provider.ensure_worker.assert_not_called()
        self.assertFalse(any(operation == 'claimLaunch' for operation, _ in self.events))

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

    def test_completed_operation_can_run_past_old_limit_and_does_not_block_next_operation(self):
        simulated_duration_seconds = 31
        def complete_after_old_limit(_worker_id, request, *, max_bytes, timeout):
            self.assertEqual(timeout, TOOL_TIMEOUT_SECONDS)
            self.assertGreater(timeout, simulated_duration_seconds)
            return {"id": request["id"], "result": {"content": [], "isError": False}}
        self.provider.call.side_effect = complete_after_old_limit
        for operation_id in ("slow-render", "next-operation"):
            result = self.broker.call("owner", "r1", {"id": operation_id, "method": "tools/list"}, operation_id)
            self.assertFalse(result["result"]["isError"])
        self.assertEqual(self.provider.call.call_count, 2)
        self.assertEqual([args["state"] for name, args in self.events if name == "completeOperation"], ["completed", "completed"])

    def test_idle_reconciliation_waits_for_active_operation_claim(self):
        self.row.update({"lastActivityAt": 40_000, "activeOperationDeadline": 180_000})
        self.broker._stop = Mock(return_value={"status": "settled"})
        self.assertEqual(self.broker.reconcile("r1")["status"], "running")
        self.broker._stop.assert_not_called()

    def test_idle_reconciliation_stops_after_operation_claim_expires(self):
        self.row.update({"lastActivityAt": 40_000, "activeOperationDeadline": 100_999})
        self.broker._stop = Mock(return_value={"status": "settled"})
        self.broker.reconcile("r1")
        self.broker._stop.assert_called_once_with("r1", idle_only=True)

    def test_idle_shutdown_race_does_not_fence_or_terminate_a_fresh_operation(self):
        self.row.update({"lastActivityAt": 40_000})
        original_ledger = self.ledger.call.side_effect
        def authorize_during_shutdown(operation: str, **args):
            if operation == "claimShutdown":
                self.assertTrue(args["idleOnly"])
                self.row["lastActivityAt"] = 101_000
                return {"claimed": False, "terminal": False}
            return original_ledger(operation, **args)
        self.ledger.call.side_effect = authorize_during_shutdown
        result = self.broker.reconcile("r1")
        self.assertEqual(result["status"], "running")
        self.provider.stop.assert_not_called()
        self.projects.checkpoint.assert_not_called()
        self.assertFalse(any(name == "settleSession" for name, _args in self.events))

    def test_hard_deadline_and_explicit_stop_override_active_operation_grace(self):
        self.row.update({"lastActivityAt": 100_000, "activeOperationDeadline": 999_999})
        self.broker._stop = Mock(return_value={"status": "settled"})
        self.row["launchClaimedAt"] = -300_000
        self.broker.reconcile("r1")
        self.broker._stop.assert_called_once_with("r1")
        self.broker._stop.reset_mock()
        self.row.update({"launchClaimedAt": 100_000, "stopRequested": True})
        self.broker.reconcile("r1")
        self.broker._stop.assert_called_once_with("r1")

    def test_unknown_status_and_terminal_worker_override_active_operation_grace(self):
        self.row.update({"lastActivityAt": 100_000, "activeOperationDeadline": 999_999, "status": "unknown"})
        self.broker._stop = Mock(return_value={"status": "settled"})
        self.broker.reconcile("r1")
        self.broker._stop.assert_called_once_with("r1")
        self.broker._stop.reset_mock()
        self.row["status"] = "running"
        self.provider.poll.return_value = 0
        self.broker.reconcile("r1")
        self.broker._stop.assert_called_once_with("r1")

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
