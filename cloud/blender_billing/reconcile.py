"""Safe reads used by scheduled billing recovery jobs."""
from __future__ import annotations

import logging
import time
from typing import Any, Callable

from .ledger import LedgerError


logger = logging.getLogger(__name__)
TRANSIENT_LEDGER_STATUSES = frozenset({502, 503, 504})


def read_reconciliation(
    ledger: Any,
    operation: str,
    *,
    attempts: int = 2,
    sleep: Callable[[float], None] = time.sleep,
    **arguments: Any,
) -> Any | None:
    """Read recovery state without failing a scheduled cycle on a transient outage.

    These operations are read-only, so one bounded retry is safe. Persistent
    transient failures return ``None`` so the next scheduled cycle can retry;
    authorization and application errors still raise for operator visibility.
    """
    if attempts < 1:
        raise ValueError("attempts must be at least one")

    for attempt in range(attempts):
        try:
            return ledger.call(operation, **arguments)
        except LedgerError as error:
            transient = error.status in TRANSIENT_LEDGER_STATUSES
            if not transient or attempt + 1 >= attempts:
                if transient:
                    logger.warning(
                        "Skipping scheduled billing reconciliation after ledger failure "
                        "operation=%s status=%s code=%s",
                        operation,
                        error.status,
                        error.code or "unknown",
                    )
                    return None
                raise
            sleep(0.25 * (2**attempt))

    raise AssertionError("unreachable")
