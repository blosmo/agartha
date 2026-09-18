from __future__ import annotations

import unittest
from unittest.mock import Mock

from .ledger import LedgerError
from .reconcile import read_reconciliation


class ReconciliationReadTests(unittest.TestCase):
    def test_retries_transient_ledger_failure_before_returning_rows(self):
        ledger = Mock()
        ledger.call.side_effect = [LedgerError(503), [{"reservationId": "r1"}]]

        rows = read_reconciliation(ledger, "listActiveReservations", sleep=lambda _seconds: None)

        self.assertEqual(rows, [{"reservationId": "r1"}])
        self.assertEqual(ledger.call.call_count, 2)

    def test_skips_cycle_after_persistent_transient_failure(self):
        ledger = Mock()
        ledger.call.side_effect = LedgerError(503)

        rows = read_reconciliation(ledger, "listActiveReservations", sleep=lambda _seconds: None)

        self.assertIsNone(rows)
        self.assertEqual(ledger.call.call_count, 2)

    def test_does_not_hide_non_transient_ledger_failure(self):
        ledger = Mock()
        ledger.call.side_effect = LedgerError(401)

        with self.assertRaises(LedgerError):
            read_reconciliation(ledger, "listActiveReservations", sleep=lambda _seconds: None)

        ledger.call.assert_called_once_with("listActiveReservations")


if __name__ == "__main__":
    unittest.main()
